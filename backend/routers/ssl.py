"""
SSL Certificate API Router — DNS-01 cert management via PowerDNS hooks.

All cert state lives in SQLite (ssl_certs + ssl_cert_domains).
Certbot runs in background; ssl_deploy.py hook updates DB on success.

Endpoints:
  GET    /cpanelapi/ssl                           list all cert records
  POST   /cpanelapi/ssl/issue                     issue new cert (background)
  GET    /cpanelapi/ssl/renewal                   certbot.timer state
  PUT    /cpanelapi/ssl/renewal                   enable/disable auto-renew (admin)
  GET    /cpanelapi/ssl/{root_domain}             single cert detail
  GET    /cpanelapi/ssl/{root_domain}/log         certbot log + running status
  GET    /cpanelapi/ssl/{root_domain}/available-domains  FQDNs available for cert
  PUT    /cpanelapi/ssl/{root_domain}/domains     reissue with updated domain list
  POST   /cpanelapi/ssl/{root_domain}/renew       force-renew existing cert
  DELETE /cpanelapi/ssl/{root_domain}             delete cert + DB record
"""
import logging
import os
import subprocess
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import User
from deps import get_current_user
from domain_registry import _load_domains, _load_subdomains, check_domain_access
from hooks import call_hooks
from modules.audit.logger import log_action
import modules.ssl.db as ssl_db
from modules.ssl.certbot import CERTS_WORK_DIR, spawn_background
from modules.ssl.cert_status import get_log_derived_status, get_log_full_status

router = APIRouter(prefix="/cpanelapi/ssl", tags=["SSL"])
logger = logging.getLogger(__name__)

_PDNS_URL      = os.environ.get("PDNS_URL",      "http://127.0.0.1:8053")
_PDNS_KEY      = os.environ.get("PDNS_API_KEY",  "hostpanel-dns-api-key")
_EMAIL         = os.environ.get("CERTBOT_EMAIL", "admin@hostpanel.local")
_HOOKS_DIR     = os.path.join(os.path.dirname(os.path.dirname(__file__)), "hooks")
_DEPLOY_HOOK   = f"python3 {_HOOKS_DIR}/ssl_deploy.py"
_AUTH_HOOK     = f"python3 {_HOOKS_DIR}/pdns_auth.py {_PDNS_URL} {_PDNS_KEY}"
_CLEANUP_HOOK  = f"python3 {_HOOKS_DIR}/pdns_cleanup.py {_PDNS_URL} {_PDNS_KEY}"


# ── Models ─────────────────────────────────────────────────────────────────────

class SslDomainItem(BaseModel):
    domain: str
    is_primary: bool
    in_cert: bool

class SslCertOut(BaseModel):
    id: Optional[int] = None
    root_domain: str
    linux_user: str
    status: str
    cert_path: Optional[str] = None
    issued_at: Optional[str] = None
    expires_at: Optional[str] = None
    updated_at: str = ""
    days_remaining: Optional[int] = None
    domains: List[SslDomainItem] = []

class IssueRequest(BaseModel):
    root_domain: str
    domains: List[str]

class DomainsRequest(BaseModel):
    domains: List[str]

class RenewalRequest(BaseModel):
    enabled: bool


# ── Helpers ────────────────────────────────────────────────────────────────────

def _require_root_domain(root_domain: str, current_user: User) -> dict:
    """Load domain record and enforce access. Raises 404/403 via HTTPException."""
    domains = _load_domains()
    record = next((d for d in domains if d["domain_name"] == root_domain), None)
    if not record:
        raise HTTPException(404, f"Domain '{root_domain}' not provisioned.")
    check_domain_access(record, current_user)
    return record


def _days_remaining(expires_at: Optional[str]) -> Optional[int]:
    if not expires_at:
        return None
    try:
        expiry = datetime.strptime(expires_at, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        return (expiry - datetime.now(timezone.utc)).days
    except Exception:
        return None


def _enrich(cert: dict) -> dict:
    """Add days_remaining and resolve live status from log when pending."""
    cert = dict(cert)
    cert["days_remaining"] = _days_remaining(cert.get("expires_at"))
    status = cert["status"]
    if status == "pending":
        log_st = get_log_derived_status(cert["root_domain"])
        if log_st == "failed":
            cert["status"] = "failed"
    elif status == "valid":
        days = cert["days_remaining"]
        if days is not None:
            if days < 0:
                cert["status"] = "expired"
            elif days < 30:
                cert["status"] = "expiring_soon"
    return cert


def _build_certonly_cmd(domains: list[str], cert_name: str, force: bool = False) -> list[str]:
    cmd = [
        "sudo", "certbot", "certonly",
        "--manual", "--preferred-challenges", "dns",
        "--manual-auth-hook",    _AUTH_HOOK,
        "--manual-cleanup-hook", _CLEANUP_HOOK,
        "--manual-public-ip-logging-ok",
        "--deploy-hook", _DEPLOY_HOOK,
        "--config-dir", CERTS_WORK_DIR,
        "--work-dir",   os.path.join(CERTS_WORK_DIR, "work"),
        "--logs-dir",   os.path.join(CERTS_WORK_DIR, "logs"),
        "--non-interactive", "--agree-tos", "--email", _EMAIL,
        "--cert-name", cert_name,
    ]
    for d in domains:
        cmd += ["-d", d]
    cmd.append("--force-renewal" if force else "--keep-until-expiring")
    return cmd


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("", response_model=List[SslCertOut])
async def list_certs(current_user: User = Depends(get_current_user)):
    cert_records = ssl_db.get_all_certs_with_domains()
    cert_map = {c["root_domain"]: c for c in cert_records}

    all_domains = _load_domains()
    if current_user.role != "admin":
        all_domains = [d for d in all_domains
                       if d.get("username") == current_user.linux_user]

    result = []
    seen = set()
    for domain in all_domains:
        rd = domain["domain_name"]
        seen.add(rd)
        if rd in cert_map:
            result.append(_enrich(cert_map[rd]))
        else:
            result.append({
                "id": None,
                "root_domain": rd,
                "linux_user": domain.get("username", ""),
                "status": "none",
                "cert_path": None,
                "issued_at": None,
                "expires_at": None,
                "updated_at": "",
                "days_remaining": None,
                "domains": [],
            })

    # Include cert records whose domain was removed from provisioning
    for rd, cert in cert_map.items():
        if rd not in seen:
            if current_user.role == "admin" or cert.get("linux_user") == current_user.linux_user:
                result.append(_enrich(cert))

    return result


@router.get("/renewal")
async def get_renewal(current_user: User = Depends(get_current_user)):
    r = subprocess.run(["systemctl", "is-active", "certbot.timer"],
                       capture_output=True, text=True)
    return {"enabled": r.stdout.strip() == "active"}


@router.put("/renewal")
async def set_renewal(body: RenewalRequest, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(403, "Admin only")
    action = "enable" if body.enabled else "disable"
    try:
        subprocess.run(["sudo", "systemctl", action, "--now", "certbot.timer"],
                       check=True, capture_output=True, text=True, timeout=10)
    except subprocess.CalledProcessError as e:
        raise HTTPException(500, f"systemctl error: {e.stderr.strip()}")
    log_action(current_user.username,
               f"ssl.renewal_{'enable' if body.enabled else 'disable'}")
    return {"enabled": body.enabled}


@router.post("/issue")
async def issue_cert(body: IssueRequest, current_user: User = Depends(get_current_user)):
    record = _require_root_domain(body.root_domain, current_user)
    if not body.domains:
        raise HTTPException(400, "domains list cannot be empty")

    linux_user = record.get("username") or current_user.linux_user or "nobody"
    cert_id = ssl_db.upsert_cert(body.root_domain, linux_user, status="pending")
    ssl_db.set_in_cert_flags(cert_id, [])
    for fqdn in body.domains:
        ssl_db.upsert_cert_domain(cert_id, fqdn,
                                  is_primary=(fqdn == body.root_domain),
                                  in_cert=False)

    cmd = _build_certonly_cmd(body.domains, body.root_domain)
    spawn_background(cmd, body.root_domain)

    log_action(current_user.username, "ssl.issue", resource=body.root_domain,
               detail=f"domains: {','.join(body.domains)}")
    return {"root_domain": body.root_domain, "status": "pending",
            "message": "certbot started in background"}


@router.get("/{root_domain}/available-domains")
async def get_available_domains(root_domain: str,
                                current_user: User = Depends(get_current_user)):
    """Return all provisionable FQDNs for root_domain (root + subdomains)."""
    record = _require_root_domain(root_domain, current_user)
    subs = _load_subdomains()
    fqdns = [root_domain] + [s["fqdn"] for s in subs
                              if s.get("parent_domain") == root_domain]
    return {"root_domain": root_domain, "fqdns": fqdns}


@router.get("/{root_domain}/log")
async def get_cert_log(root_domain: str, current_user: User = Depends(get_current_user)):
    domains = _load_domains()
    record = next((d for d in domains if d["domain_name"] == root_domain), None)
    if record:
        check_domain_access(record, current_user)
    elif current_user.role != "admin":
        raise HTTPException(403, "Access denied")
    return get_log_full_status(root_domain)


@router.get("/{root_domain}", response_model=SslCertOut)
async def get_cert(root_domain: str, current_user: User = Depends(get_current_user)):
    cert = ssl_db.get_cert_with_domains(root_domain)
    if not cert:
        raise HTTPException(404, f"No SSL record for '{root_domain}'.")
    domains = _load_domains()
    record = next((d for d in domains if d["domain_name"] == root_domain), None)
    if record:
        check_domain_access(record, current_user)
    elif current_user.role != "admin":
        raise HTTPException(403, "Access denied")
    return _enrich(cert)


@router.put("/{root_domain}/domains")
async def reissue_cert(root_domain: str, body: DomainsRequest,
                       current_user: User = Depends(get_current_user)):
    """Update domain list and force-reissue the cert."""
    _require_root_domain(root_domain, current_user)
    if not body.domains:
        raise HTTPException(400, "domains list cannot be empty")

    cert = ssl_db.get_cert(root_domain)
    if not cert:
        raise HTTPException(404, f"No SSL record for '{root_domain}'. Use /issue first.")

    cert_id = cert["id"]
    # Remove domains no longer requested
    existing = ssl_db.get_cert_with_domains(root_domain)
    for d in (existing.get("domains") or []):
        if d["domain"] not in body.domains:
            ssl_db.remove_cert_domain(cert_id, d["domain"])
    # Upsert all requested domains
    for fqdn in body.domains:
        ssl_db.upsert_cert_domain(cert_id, fqdn,
                                  is_primary=(fqdn == root_domain),
                                  in_cert=False)
    ssl_db.set_in_cert_flags(cert_id, [])
    ssl_db.update_cert_status(root_domain, "pending")

    cmd = _build_certonly_cmd(body.domains, root_domain, force=True)
    spawn_background(cmd, root_domain)

    log_action(current_user.username, "ssl.reissue", resource=root_domain,
               detail=f"domains: {','.join(body.domains)}")
    return {"root_domain": root_domain, "status": "pending",
            "message": "certbot reissue started in background"}


@router.post("/{root_domain}/renew")
async def renew_cert(root_domain: str, current_user: User = Depends(get_current_user)):
    """Force-renew an existing valid cert."""
    _require_root_domain(root_domain, current_user)
    cert = ssl_db.get_cert(root_domain)
    if not cert or cert["status"] not in ("valid", "expiring_soon", "expired"):
        raise HTTPException(400,
            f"No existing cert for '{root_domain}'. Use /issue first.")

    ssl_db.update_cert_status(root_domain, "pending")
    cmd = [
        "sudo", "certbot", "renew",
        "--cert-name", root_domain,
        "--force-renewal", "--non-interactive",
        "--config-dir", CERTS_WORK_DIR,
    ]
    spawn_background(cmd, root_domain)

    log_action(current_user.username, "ssl.renew", resource=root_domain)
    return {"root_domain": root_domain, "status": "pending",
            "message": "certbot renew started in background"}


@router.delete("/{root_domain}")
async def delete_cert(root_domain: str, current_user: User = Depends(get_current_user)):
    _require_root_domain(root_domain, current_user)
    cert = ssl_db.get_cert(root_domain)
    if not cert:
        raise HTTPException(404, f"No SSL record for '{root_domain}'.")

    # Remove from certbot's internal store (best-effort — may not exist)
    try:
        subprocess.run(
            ["sudo", "certbot", "delete", "--cert-name", root_domain,
             "--non-interactive", "--config-dir", CERTS_WORK_DIR],
            capture_output=True, text=True, timeout=30,
        )
    except Exception:
        pass

    # Remove our /home/<user>/<domain>/ssl/ copy
    linux_user = cert.get("linux_user", "")
    ssl_dir = f"/home/{linux_user}/{root_domain}/ssl"
    try:
        subprocess.run(["sudo", "-n", "rm", "-rf", ssl_dir],
                       capture_output=True, timeout=10)
    except Exception:
        pass

    ssl_db.delete_cert(root_domain)
    await call_hooks("hostpanel.hooks.ssl_cert_deleted", domain=root_domain)
    log_action(current_user.username, "ssl.delete", resource=root_domain)
    return {"message": f"SSL certificate for '{root_domain}' deleted"}
