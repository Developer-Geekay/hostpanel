"""
SSL Certificate API Router — thin HTTP boundary layer.

All business logic lives in backend/modules/ssl/.
This file: request parsing, auth checks, module delegation, hook calls, audit logging.

Path Prefix: /cpanelapi/ssl
Endpoints:
- GET    /                    : cert health + SANs for all provisioned domains
- GET    /renewal             : certbot.timer state
- PUT    /renewal             : enable/disable auto-renew timer (Admin-only)
- POST   /issue               : issue/expand cert via certbot (background)
- POST   /{domain}/renew      : force-renew existing cert (background)
- POST   /{domain}/import     : install commercial/custom PEM cert
- GET    /{domain}/log        : tail certbot log + derive status
- DELETE /{domain}            : revoke/delete cert
- PUT    /{domain}/force-https: toggle HTTPS redirect
"""
import logging
import os
import subprocess

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional

from modules.audit.logger import log_action
from auth import User
from deps import get_current_user
from domain_registry import _load_domains, check_domain_access
from hooks import call_hooks

from modules.ssl.cert_status import (
    get_cert_status,
    get_log_full_status,
    cert_file_readable,
    read_custom_cert_bytes,
    CERTBOT_LOG_DIR,
    CUSTOM_CERTS_DIR,
)
from modules.ssl.certbot import spawn_certbot_background

router = APIRouter(prefix="/cpanelapi/ssl", tags=["SSL"])
logger = logging.getLogger(__name__)

VHOSTS_DIR = "/opt/hostpanel/plugins/nginx/vhosts"
HOOKS_DIR  = os.path.join(os.path.dirname(os.path.dirname(__file__)), "hooks")

PDNS_URL     = os.environ.get("PDNS_URL",     "http://127.0.0.1:8053")
PDNS_API_KEY = os.environ.get("PDNS_API_KEY", "hostpanel-dns-api-key")
CERTBOT_EMAIL = os.environ.get("CERTBOT_EMAIL", "admin@hostpanel.local")


# ── Request / Response models ──────────────────────────────────────────────────

class CertStatus(BaseModel):
    domain: str
    status: str             # none|pending|failed|valid|expiring_soon|expired|revoked
    expiry: Optional[str]
    days_remaining: Optional[int]
    issuer: Optional[str]
    sans: List[str] = []
    https_forced: bool
    is_wildcard: bool = False
    source: str = "none"    # none|letsencrypt|imported

class IssueRequest(BaseModel):
    domain: str
    force: bool = False
    additional_domains: List[str] = []
    wildcard: bool = False

class RenewalRequest(BaseModel):
    enabled: bool

class ForceHttpsRequest(BaseModel):
    enabled: bool

class ImportRequest(BaseModel):
    cert_pem: str
    key_pem: str
    chain_pem: str


# ── Internal helpers ───────────────────────────────────────────────────────────

def _require_domain(domain: str, current_user: User) -> dict:
    """Load domain record and enforce access control. Raises 404/403 via HTTPException."""
    domains = _load_domains()
    record = next((d for d in domains if d["domain_name"] == domain), None)
    if not record:
        raise HTTPException(status_code=404, detail=f"Domain '{domain}' not provisioned.")
    check_domain_access(record, current_user)
    return record


def _clear_revoked_sentinel(domain: str) -> None:
    revoked_path = os.path.join(CERTBOT_LOG_DIR, f"{domain}.revoked")
    if os.path.exists(revoked_path):
        try:
            os.remove(revoked_path)
        except Exception:
            pass


def _build_issue_cmd(record: dict, request: IssueRequest) -> list[str]:
    """Construct certbot command list for issue. No shell interpolation."""
    domain = request.domain

    if request.wildcard:
        auth_hook    = f"python3 {HOOKS_DIR}/pdns_auth.py {PDNS_URL} {PDNS_API_KEY}"
        cleanup_hook = f"python3 {HOOKS_DIR}/pdns_cleanup.py {PDNS_URL} {PDNS_API_KEY}"
        cmd = [
            "sudo", "certbot", "certonly",
            "--manual", "--preferred-challenges", "dns",
            "--manual-auth-hook",    auth_hook,
            "--manual-cleanup-hook", cleanup_hook,
            "--manual-public-ip-logging-ok",
            "-d", domain, "-d", f"*.{domain}",
            "--cert-name", domain,
        ]
        for san in request.additional_domains:
            cmd += ["-d", san]
        cmd += [
            "--non-interactive", "--agree-tos", "--email", CERTBOT_EMAIL,
            "--expand" if (request.force or request.additional_domains) else "--keep-until-expiring",
        ]
    else:
        is_apex = domain.count(".") == 1
        cmd = [
            "sudo", "certbot", "certonly",
            "--webroot", "-w", record["document_root"],
            "-d", domain,
        ]
        if is_apex:
            cmd += ["-d", f"www.{domain}"]
            cpanel_vhost = os.path.join(VHOSTS_DIR, f"cpanel.{domain}.conf")
            if os.path.exists(cpanel_vhost):
                cmd += ["-d", f"cpanel.{domain}"]
        for san in request.additional_domains:
            cmd += ["-d", san]
        cmd += [
            "--non-interactive", "--agree-tos", "--email", CERTBOT_EMAIL,
            "--expand" if (request.force or request.additional_domains) else "--keep-until-expiring",
        ]
    return cmd


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("", response_model=List[CertStatus])
async def list_certs(current_user: User = Depends(get_current_user)):
    domains = _load_domains()
    if current_user.role != "admin":
        domains = [d for d in domains if d.get("username") == current_user.linux_user]
    return [get_cert_status(d["domain_name"]) for d in domains]


@router.get("/renewal")
async def get_renewal_status(current_user: User = Depends(get_current_user)):
    result = subprocess.run(
        ["systemctl", "is-active", "certbot.timer"],
        capture_output=True, text=True
    )
    return {"enabled": result.stdout.strip() == "active"}


@router.put("/renewal")
async def set_renewal(request: RenewalRequest, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    action = "enable" if request.enabled else "disable"
    try:
        subprocess.run(
            ["sudo", "systemctl", action, "--now", "certbot.timer"],
            check=True, capture_output=True, text=True, timeout=10
        )
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"systemctl error: {e.stderr.strip()}")
    log_action(current_user.username, f"ssl.renewal_{'enable' if request.enabled else 'disable'}")
    return {"enabled": request.enabled}


@router.post("/issue")
async def issue_cert(request: IssueRequest, current_user: User = Depends(get_current_user)):
    record = _require_domain(request.domain, current_user)
    cmd = _build_issue_cmd(record, request)
    _clear_revoked_sentinel(request.domain)
    try:
        spawn_certbot_background(cmd, request.domain, CERTBOT_LOG_DIR)
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="certbot not found.")
    log_action(current_user.username, "ssl.issue", resource=request.domain)
    return {"domain": request.domain, "status": "pending", "message": "certbot started in background"}


@router.post("/{domain}/renew")
async def renew_cert(domain: str, current_user: User = Depends(get_current_user)):
    record = _require_domain(domain, current_user)
    if not cert_file_readable(domain):
        raise HTTPException(
            status_code=400,
            detail=f"No existing certificate for '{domain}'. Use /issue instead."
        )
    cmd = ["sudo", "certbot", "renew", "--cert-name", domain, "--force-renewal", "--non-interactive"]
    try:
        spawn_certbot_background(cmd, domain, CERTBOT_LOG_DIR)
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="certbot not found.")
    log_action(current_user.username, "ssl.renew", resource=domain)
    return {"domain": domain, "status": "pending", "message": "certbot renew started in background"}


@router.post("/{domain}/import")
async def import_cert(domain: str, request: ImportRequest, current_user: User = Depends(get_current_user)):
    record = _require_domain(domain, current_user)

    # Validate PEM content
    for label, pem in [("cert_pem", request.cert_pem), ("key_pem", request.key_pem), ("chain_pem", request.chain_pem)]:
        if "-----BEGIN" not in pem:
            raise HTTPException(status_code=400, detail=f"{label} does not appear to be valid PEM")

    cert_check = subprocess.run(
        ["openssl", "x509", "-noout"],
        input=request.cert_pem.encode(), capture_output=True, timeout=10
    )
    if cert_check.returncode != 0:
        raise HTTPException(status_code=400, detail="cert_pem is not a valid certificate")

    # Write cert files
    cert_dir = os.path.join(CUSTOM_CERTS_DIR, domain)
    try:
        r = subprocess.run(["sudo", "-n", "mkdir", "-p", cert_dir], capture_output=True, timeout=10)
        if r.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to create cert directory: {r.stderr.decode().strip()}"
            )
        fullchain = request.cert_pem.strip() + "\n" + request.chain_pem.strip() + "\n"
        files = {
            "cert.pem":      request.cert_pem,
            "privkey.pem":   request.key_pem,
            "chain.pem":     request.chain_pem,
            "fullchain.pem": fullchain,
        }
        for filename, content in files.items():
            proc = subprocess.run(
                ["sudo", "-n", "tee", os.path.join(cert_dir, filename)],
                input=content.encode(), capture_output=True, timeout=10
            )
            if proc.returncode != 0:
                raise HTTPException(status_code=500, detail=f"Failed to write {filename}")
        subprocess.run(
            ["sudo", "-n", "chmod", "600", os.path.join(cert_dir, "privkey.pem")],
            capture_output=True, timeout=5
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    _clear_revoked_sentinel(domain)
    await call_hooks("hostpanel.hooks.ssl_cert_imported",
                     domain=domain, cert_dir=cert_dir, doc_root=record["document_root"])
    log_action(current_user.username, "ssl.import", resource=domain)
    return {"domain": domain, "status": "imported", "cert_dir": cert_dir}


@router.get("/{domain}/log")
async def get_cert_log(domain: str, current_user: User = Depends(get_current_user)):
    domains = _load_domains()
    record = next((d for d in domains if d["domain_name"] == domain), None)
    if record:
        check_domain_access(record, current_user)
    return get_log_full_status(domain, CERTBOT_LOG_DIR)


@router.delete("/{domain}")
async def revoke_cert(domain: str, current_user: User = Depends(get_current_user)):
    domains = _load_domains()
    record = next((d for d in domains if d["domain_name"] == domain), None)
    if record:
        check_domain_access(record, current_user)

    has_custom = read_custom_cert_bytes(domain) is not None
    has_le     = cert_file_readable(domain)

    if not has_custom and not has_le:
        raise HTTPException(status_code=404, detail=f"No certificate found for '{domain}'.")

    if has_custom:
        r = subprocess.run(
            ["sudo", "-n", "rm", "-rf", os.path.join(CUSTOM_CERTS_DIR, domain)],
            capture_output=True, timeout=10
        )
        if r.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to remove cert directory: {r.stderr.decode().strip()}"
            )
    else:
        try:
            subprocess.run(
                ["sudo", "certbot", "delete", "--cert-name", domain, "--non-interactive"],
                check=True, capture_output=True, text=True, timeout=30
            )
        except subprocess.CalledProcessError as e:
            raise HTTPException(status_code=500, detail=f"certbot error: {e.stderr.strip()}")

    # Write revoked sentinel
    os.makedirs(CERTBOT_LOG_DIR, exist_ok=True)
    try:
        import datetime
        with open(os.path.join(CERTBOT_LOG_DIR, f"{domain}.revoked"), "w") as f:
            f.write(datetime.datetime.utcnow().isoformat())
    except Exception:
        pass

    doc_root = record["document_root"] if record else None
    await call_hooks("hostpanel.hooks.ssl_cert_deleted", domain=domain, doc_root=doc_root)
    log_action(current_user.username, "ssl.revoke", resource=domain)
    return {"message": f"Certificate for {domain} removed"}


@router.put("/{domain}/force-https")
async def toggle_force_https(
    domain: str,
    request: ForceHttpsRequest,
    current_user: User = Depends(get_current_user),
):
    record = _require_domain(domain, current_user)
    if request.enabled and not (cert_file_readable(domain) or read_custom_cert_bytes(domain)):
        raise HTTPException(
            status_code=400,
            detail="Cannot enable Force HTTPS: no active SSL certificate."
        )
    await call_hooks("hostpanel.hooks.ssl_force_https",
                     domain=domain, enabled=request.enabled, doc_root=record["document_root"])
    log_action(
        current_user.username,
        f"ssl.force_https_{'on' if request.enabled else 'off'}",
        resource=domain
    )
    return {"domain": domain, "https_forced": request.enabled}
