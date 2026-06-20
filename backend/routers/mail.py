import logging
import os
import subprocess

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import User
from deps import get_current_user, require_admin
from modules.audit.logger import log_action
from modules.mail import db as mail_db
from modules.mail import dkim, dovecot, postfix
from modules.mail.exceptions import (
    MailAccountExists, MailAccountNotFound,
    MailDomainExists, MailDomainNotFound, MailError,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cpanelapi/mail", tags=["Mail"])

SERVER_IP = os.environ.get("SERVER_IP", "")


# ── Request models ────────────────────────────────────────────────────────────

class DomainAdd(BaseModel):
    domain: str = Field(..., min_length=3, max_length=253)

class AccountCreate(BaseModel):
    email:    str = Field(..., min_length=3, max_length=254)
    password: str = Field(..., min_length=8, max_length=256)
    quota_mb: int = Field(default=2048, ge=1, le=102400)

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


async def _provision_dns(domain: str, dkim_txt: str) -> list[str]:
    """Add MX, mail-A, SPF, and DKIM DNS records for a mail domain.
    Returns a list of warning strings for any records that couldn't be added
    (e.g. zone doesn't exist in HostPanel's DNS).
    """
    from modules.dns import powerdns
    from modules.dns.exceptions import DnsServiceError, ZoneNotFound

    warnings = []

    async def _safe_add(zone, name, rtype, content, ttl=3600):
        try:
            await powerdns.add_record(zone, name, rtype, content, ttl)
        except (ZoneNotFound, DnsServiceError) as e:
            warnings.append(f"DNS {rtype} for {name}: {e}")

    if not SERVER_IP:
        warnings.append("SERVER_IP not set — skipping DNS provisioning")
        return warnings

    # PowerDNS requires TXT content to be double-quoted
    def qtxt(s: str) -> str:
        return f'"{s}"' if not s.startswith('"') else s

    # mail A record
    await _safe_add(domain, f"mail.{domain}", "A", SERVER_IP)
    # MX record
    await _safe_add(domain, domain, "MX", f"10 mail.{domain}.")
    # SPF TXT
    await _safe_add(domain, domain, "TXT", qtxt(f"v=spf1 ip4:{SERVER_IP} ~all"))
    # DKIM TXT — opendkim-genkey may already include quotes in parts; wrap full value
    if dkim_txt:
        await _safe_add(domain, f"mail._domainkey.{domain}", "TXT", qtxt(dkim_txt))

    return warnings


# ── Status & Setup ────────────────────────────────────────────────────────────

@router.get("/available-domains")
async def available_domains(_: User = Depends(require_admin)):
    """Return DNS zones available for mail (falls back to mail_domains if DNS is down)."""
    from modules.dns import powerdns
    from modules.dns.exceptions import DnsServiceError
    try:
        zones = await powerdns.list_zones()
        return {"domains": sorted(z["name"] for z in zones)}
    except DnsServiceError:
        return {"domains": sorted(d["domain"] for d in mail_db.list_domains())}


@router.get("/configured")
async def mail_configured(_: User = Depends(require_admin)):
    """Returns whether initial mail setup has been run (config files exist)."""
    return {"configured": os.path.isfile(dovecot.VMAIL_USERS_FILE)}


@router.post("/setup")
async def mail_setup(current_user: User = Depends(require_admin)):
    """
    One-time setup: configure Postfix + Dovecot + OpenDKIM for virtual mailboxes.
    Postfix, Dovecot, and opendkim must already be installed via apt before running this.
    """
    errors = []

    # Create HostPanel mail directory
    subprocess.run(["sudo", "mkdir", "-p", postfix.MAIL_DIR], capture_output=True)
    subprocess.run(["sudo", "chmod", "755", postfix.MAIL_DIR], capture_output=True)

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

    # Mail storage root
    subprocess.run(["sudo", "mkdir", "-p", "/var/mail/vhosts"], capture_output=True)
    subprocess.run(["sudo", "/opt/hostpanel/bin/hp-chown", "vmail:/var/mail/vhosts"], capture_output=True)
    subprocess.run(["sudo", "chmod", "755", "/var/mail/vhosts"], capture_output=True)

    # Configure Postfix (includes milter params for DKIM)
    try:
        postfix.configure_postfix()
    except Exception as e:
        errors.append(f"Postfix config: {e}")

    # Configure Dovecot
    try:
        dovecot.configure_dovecot()
    except Exception as e:
        errors.append(f"Dovecot config: {e}")

    # Configure OpenDKIM
    try:
        dkim.configure_opendkim()
    except Exception as e:
        errors.append(f"OpenDKIM config: {e}")

    # Write empty virtual map files
    try:
        _rebuild_all()
    except Exception as e:
        errors.append(f"Rebuild maps: {e}")

    # Start all three services
    for svc in ["postfix", "dovecot", "opendkim"]:
        subprocess.run(["sudo", "systemctl", "enable", "--now", svc], capture_output=True)
        subprocess.run(["sudo", "systemctl", "restart", svc], capture_output=True)

    log_action(current_user.username, "mail.setup", detail="Mail server configured")
    return {"ok": len(errors) == 0, "errors": errors}


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

    # Generate DKIM keypair
    dkim_txt = ""
    try:
        dkim_txt = dkim.generate_key(body.domain)
    except Exception as e:
        logger.warning(f"DKIM key generation for {body.domain} failed: {e}")

    # Rebuild OpenDKIM tables
    try:
        all_domains = [d["domain"] for d in mail_db.list_domains()]
        dkim.rebuild(all_domains)
    except Exception as e:
        logger.warning(f"OpenDKIM rebuild after domain add failed: {e}")

    # Rebuild Postfix / Dovecot maps
    try:
        _rebuild_all()
    except Exception as e:
        logger.warning(f"Postfix rebuild after domain add failed: {e}")

    # Provision DNS records (MX, A, SPF, DKIM)
    dns_warnings = []
    try:
        dns_warnings = await _provision_dns(body.domain, dkim_txt)
        if dns_warnings:
            for w in dns_warnings:
                logger.warning(w)
    except Exception as e:
        logger.warning(f"DNS provisioning for {body.domain} failed: {e}")

    log_action(current_user.username, "mail.domain.add", body.domain)
    return {"ok": True, "domain": body.domain, "dns_warnings": dns_warnings}


@router.post("/domains/{domain}/refresh-dkim")
async def refresh_domain_dkim(domain: str, current_user: User = Depends(require_admin)):
    """Regenerate DKIM keypair for an existing domain and re-provision DNS records."""
    existing = [d["domain"] for d in mail_db.list_domains()]
    if domain not in existing:
        raise HTTPException(status_code=404, detail=f"Domain '{domain}' not found")

    dkim_txt = ""
    try:
        dkim.remove_key(domain)
        dkim_txt = dkim.generate_key(domain)
        dkim.rebuild(existing)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DKIM key generation failed: {e}")

    dns_warnings = []
    try:
        dns_warnings = await _provision_dns(domain, dkim_txt)
        if dns_warnings:
            for w in dns_warnings:
                logger.warning(w)
    except Exception as e:
        logger.warning(f"DNS provisioning for {domain} failed: {e}")

    log_action(current_user.username, "mail.domain.refresh_dkim", domain)
    return {"ok": True, "dns_warnings": dns_warnings}


@router.delete("/domains/{domain}")
async def remove_domain(domain: str, current_user: User = Depends(require_admin)):
    try:
        mail_db.remove_domain(domain)
    except MailDomainNotFound as e:
        raise HTTPException(status_code=404, detail=str(e))

    dkim.remove_key(domain)

    try:
        all_domains = [d["domain"] for d in mail_db.list_domains()]
        dkim.rebuild(all_domains)
    except Exception as e:
        logger.warning(f"OpenDKIM rebuild after domain remove failed: {e}")

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
    registered = [d["domain"] for d in mail_db.list_domains()]
    if domain not in registered:
        # Auto-provision: register domain + generate DKIM + push DNS records
        try:
            mail_db.add_domain(domain, current_user.linux_user or current_user.username)
        except Exception:
            pass
        dkim_txt = ""
        try:
            dkim_txt = dkim.generate_key(domain)
            all_domains = [d["domain"] for d in mail_db.list_domains()]
            dkim.rebuild(all_domains)
        except Exception as e:
            logger.warning(f"DKIM auto-provision for {domain} failed: {e}")
        try:
            await _provision_dns(domain, dkim_txt)
        except Exception as e:
            logger.warning(f"DNS auto-provision for {domain} failed: {e}")
        try:
            _rebuild_all()
        except Exception as e:
            logger.warning(f"Postfix rebuild during auto-provision failed: {e}")
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
