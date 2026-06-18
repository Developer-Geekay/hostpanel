import logging
import subprocess

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import User
from deps import get_current_user, require_admin
from modules.audit.logger import log_action
from modules.mail import db as mail_db
from modules.mail import dovecot, postfix
from modules.mail.exceptions import (
    MailAccountExists, MailAccountNotFound,
    MailDomainExists, MailDomainNotFound, MailError,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cpanelapi/mail", tags=["Mail"])


# ── Request models ────────────────────────────────────────────────────────────

class DomainAdd(BaseModel):
    domain: str = Field(..., min_length=3, max_length=253)

class AccountCreate(BaseModel):
    email:    str = Field(..., min_length=3, max_length=254)
    password: str = Field(..., min_length=8, max_length=256)
    quota_mb: int = Field(default=1024, ge=1, le=102400)

class PasswordChange(BaseModel):
    password: str = Field(..., min_length=8, max_length=256)

class AliasCreate(BaseModel):
    alias:  str = Field(..., min_length=3, max_length=254)
    target: str = Field(..., min_length=3, max_length=254)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _mail_err(e: Exception) -> HTTPException:
    if isinstance(e, (MailDomainNotFound, MailAccountNotFound)):
        return HTTPException(status_code=404, detail=str(e))
    if isinstance(e, (MailDomainExists, MailAccountExists)):
        return HTTPException(status_code=409, detail=str(e))
    return HTTPException(status_code=500, detail=f"Mail error: {e}")


def _rebuild_all() -> None:
    """Rebuild Postfix maps + Dovecot users from current DB state."""
    domains  = [d["domain"] for d in mail_db.list_domains()]
    accounts = mail_db.list_accounts()
    aliases  = mail_db.list_aliases()
    postfix.rebuild(domains, accounts, aliases)
    dovecot.rebuild(accounts)


# ── Status & Setup ────────────────────────────────────────────────────────────

@router.get("/status")
async def mail_status(_: User = Depends(require_admin)):
    return {
        "postfix": postfix.postfix_running(),
        "dovecot": dovecot.dovecot_running(),
    }


@router.post("/setup")
async def mail_setup(current_user: User = Depends(require_admin)):
    """
    One-time setup: configure Postfix + Dovecot for virtual mailboxes.
    Postfix and Dovecot must already be installed via apt before running this.
    """
    errors = []

    # Create vmail group and user (uid/gid 5000) if not present
    r = subprocess.run(["getent", "group", "vmail"], capture_output=True)
    if r.returncode != 0:
        subprocess.run(["sudo", "groupadd", "-g", "5000", "vmail"], capture_output=True)

    r = subprocess.run(["getent", "passwd", "vmail"], capture_output=True)
    if r.returncode != 0:
        subprocess.run([
            "sudo", "useradd", "-g", "vmail", "-u", "5000",
            "-d", "/var/mail/vhosts", "-s", "/usr/sbin/nologin", "vmail"
        ], capture_output=True)

    # Create mail storage root
    subprocess.run(["sudo", "mkdir", "-p", "/var/mail/vhosts"], capture_output=True)
    subprocess.run(["sudo", "chown", "vmail:vmail", "/var/mail/vhosts"], capture_output=True)
    subprocess.run(["sudo", "chmod", "755", "/var/mail/vhosts"], capture_output=True)

    # Configure Postfix virtual mailbox settings
    try:
        postfix.configure_postfix()
    except Exception as e:
        errors.append(f"Postfix config: {e}")

    # Write Dovecot virtual user config files
    try:
        dovecot.configure_dovecot()
    except Exception as e:
        errors.append(f"Dovecot config: {e}")

    # Write empty virtual map files so postmap doesn't fail
    try:
        _rebuild_all()
    except Exception as e:
        errors.append(f"Rebuild maps: {e}")

    # Restart both services
    subprocess.run(["sudo", "systemctl", "enable", "--now", "postfix"], capture_output=True)
    subprocess.run(["sudo", "systemctl", "enable", "--now", "dovecot"], capture_output=True)
    subprocess.run(["sudo", "systemctl", "restart", "postfix"], capture_output=True)
    subprocess.run(["sudo", "systemctl", "restart", "dovecot"], capture_output=True)

    log_action(current_user.username, "mail.setup", detail="Mail server configured")
    return {
        "ok":     len(errors) == 0,
        "errors": errors,
        "postfix": postfix.postfix_running(),
        "dovecot": dovecot.dovecot_running(),
    }


# ── Domains ───────────────────────────────────────────────────────────────────

@router.get("/domains")
async def list_domains(_: User = Depends(require_admin)):
    return {"domains": mail_db.list_domains()}


@router.post("/domains", status_code=201)
async def add_domain(body: DomainAdd, current_user: User = Depends(require_admin)):
    if "." not in body.domain:
        raise HTTPException(status_code=422, detail="Invalid domain name")
    try:
        mail_db.add_domain(body.domain, current_user.linux_user or current_user.username)
    except MailDomainExists as e:
        raise HTTPException(status_code=409, detail=str(e))
    try:
        _rebuild_all()
    except Exception as e:
        logger.warning(f"Postfix rebuild after domain add failed: {e}")
    log_action(current_user.username, "mail.domain.add", body.domain)
    return {"ok": True, "domain": body.domain}


@router.delete("/domains/{domain}")
async def remove_domain(domain: str, current_user: User = Depends(require_admin)):
    try:
        mail_db.remove_domain(domain)
    except MailDomainNotFound as e:
        raise HTTPException(status_code=404, detail=str(e))
    try:
        _rebuild_all()
    except Exception as e:
        logger.warning(f"Postfix rebuild after domain remove failed: {e}")
    log_action(current_user.username, "mail.domain.remove", domain)
    return {"ok": True}


# ── Accounts ──────────────────────────────────────────────────────────────────

@router.get("/accounts/count")
async def accounts_count(current_user: User = Depends(get_current_user)):
    owner = current_user.linux_user if current_user.role != "admin" else None
    return {"count": mail_db.count_accounts(owner=owner)}


@router.get("/accounts")
async def list_accounts(current_user: User = Depends(get_current_user)):
    if current_user.role == "admin":
        accounts = mail_db.list_accounts()
    else:
        accounts = mail_db.list_accounts(owner=current_user.linux_user)
    for acc in accounts:
        acc.pop("passwd_hash", None)
    return {"accounts": accounts}


@router.post("/accounts", status_code=201)
async def create_account(body: AccountCreate, current_user: User = Depends(require_admin)):
    if "@" not in body.email:
        raise HTTPException(status_code=422, detail="email must be a valid address")
    domain = body.email.split("@")[1]
    domains = [d["domain"] for d in mail_db.list_domains()]
    if domain not in domains:
        raise HTTPException(
            status_code=422,
            detail=f"Domain '{domain}' is not configured for mail. Add it under Mail → Domains first."
        )
    passwd_hash = dovecot.hash_password(body.password)
    try:
        mail_db.add_account(
            email=body.email,
            domain=domain,
            owner=current_user.linux_user or current_user.username,
            passwd_hash=passwd_hash,
            quota_mb=body.quota_mb,
        )
    except MailAccountExists as e:
        raise HTTPException(status_code=409, detail=str(e))
    try:
        _rebuild_all()
    except Exception as e:
        logger.warning(f"Mail rebuild after account create failed: {e}")
    log_action(current_user.username, "mail.account.create", body.email)
    return {"ok": True, "email": body.email}


@router.post("/accounts/{email}/password")
async def change_password(email: str, body: PasswordChange, current_user: User = Depends(require_admin)):
    passwd_hash = dovecot.hash_password(body.password)
    try:
        mail_db.update_account_password(email, passwd_hash)
    except MailAccountNotFound as e:
        raise HTTPException(status_code=404, detail=str(e))
    try:
        dovecot.rebuild(mail_db.list_accounts())
    except Exception as e:
        logger.warning(f"Dovecot rebuild after password change failed: {e}")
    log_action(current_user.username, "mail.account.password", email)
    return {"ok": True}


@router.delete("/accounts/{email}")
async def delete_account(email: str, current_user: User = Depends(require_admin)):
    try:
        mail_db.remove_account(email)
    except MailAccountNotFound as e:
        raise HTTPException(status_code=404, detail=str(e))
    try:
        _rebuild_all()
    except Exception as e:
        logger.warning(f"Mail rebuild after account delete failed: {e}")
    log_action(current_user.username, "mail.account.delete", email)
    return {"ok": True}


# ── Aliases ───────────────────────────────────────────────────────────────────

@router.get("/aliases")
async def list_aliases(_: User = Depends(require_admin)):
    return {"aliases": mail_db.list_aliases()}


@router.post("/aliases", status_code=201)
async def create_alias(body: AliasCreate, current_user: User = Depends(require_admin)):
    if "@" not in body.alias or "@" not in body.target:
        raise HTTPException(status_code=422, detail="alias and target must be valid email addresses")
    domain = body.alias.split("@")[1]
    try:
        mail_db.add_alias(
            alias=body.alias,
            target=body.target,
            domain=domain,
            owner=current_user.linux_user or current_user.username,
        )
    except MailError as e:
        raise HTTPException(status_code=409, detail=str(e))
    try:
        postfix.rebuild(
            [d["domain"] for d in mail_db.list_domains()],
            mail_db.list_accounts(),
            mail_db.list_aliases(),
        )
    except Exception as e:
        logger.warning(f"Postfix rebuild after alias create failed: {e}")
    log_action(current_user.username, "mail.alias.create", body.alias)
    return {"ok": True}


@router.delete("/aliases/{alias}")
async def delete_alias(alias: str, current_user: User = Depends(require_admin)):
    mail_db.remove_alias(alias)
    try:
        postfix.rebuild(
            [d["domain"] for d in mail_db.list_domains()],
            mail_db.list_accounts(),
            mail_db.list_aliases(),
        )
    except Exception as e:
        logger.warning(f"Postfix rebuild after alias delete failed: {e}")
    log_action(current_user.username, "mail.alias.delete", alias)
    return {"ok": True}
