"""
SSL Certificate & Let's Encrypt API Router

Exposes endpoints to provision, renew, revoke, and enforce HTTPS certificates.

Path Prefix: `/cpanelapi/ssl`
Access Control: Injected current user dependency (standard users are scoped to certificates matching their domains).

Integrations:
- Certbot: Spawns Let's Encrypt `certbot certonly --webroot` background processes to request and renew SSL certificates.
- OpenSSL: Executes `openssl x509` commands to extract certificate details, validation states, and expiry counts.
- Dynamic Hooks: Notifies installed plugins (such as NGINX vhosts) of SSL creations, deletions, and force-HTTPS rewrites.

Endpoints:
- `GET `: Returns certificate health statuses for all active registered domains.
- `GET /renewal`: Inspects whether the systemd `certbot.timer` is enabled.
- `PUT /renewal`: Starts or stops the automatic renewal systemd timer (Admin-only).
- `POST /issue`: Issues an SSL certificate in the background for a provisioned domain and its aliases.
- `DELETE /{domain}`: Revokes Let's Encrypt certificates and triggers fallback hooks.
- `PUT /{domain}/force-https`: Toggles SSL permanent redirects inside NGINX configuration templates.
"""
import os
import datetime
import logging
import subprocess
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional

from audit import log_action
from auth import User
from deps import get_current_user
from domain_registry import _load_domains, check_domain_access
from hooks import call_hooks

router = APIRouter(prefix="/cpanelapi/ssl", tags=["SSL"])
logger = logging.getLogger(__name__)

LETSENCRYPT_DIR = "/etc/letsencrypt/live"
CERTBOT_EMAIL   = os.environ.get("CERTBOT_EMAIL", "admin@hostpanel.local")
VHOSTS_DIR      = "/opt/hostpanel/plugins/nginx/vhosts"
CERTBOT_LOG_DIR = "/tmp/hostpanel-ssl-logs"


class CertStatus(BaseModel):
    domain: str
    status: str
    expiry: Optional[str]
    days_remaining: Optional[int]
    issuer: Optional[str]
    https_forced: bool

class IssueRequest(BaseModel):
    domain: str
    force: bool = False
    additional_domains: List[str] = []

class RenewalRequest(BaseModel):
    enabled: bool

class ForceHttpsRequest(BaseModel):
    enabled: bool


def _is_https_forced(domain: str) -> bool:
    """Read nginx vhost to detect force-HTTPS redirect. Returns False when nginx not installed."""
    vhost_path = f"{VHOSTS_DIR}/{domain}.conf"
    if not os.path.exists(vhost_path):
        return False
    try:
        with open(vhost_path) as f:
            return "return 301 https://" in f.read()
    except Exception:
        return False


def _cert_readable(domain: str) -> bool:
    """Return True if a cert exists for this domain (uses sudo cat since /etc/letsencrypt is root-owned)."""
    cert_path = f"{LETSENCRYPT_DIR}/{domain}/fullchain.pem"
    r = subprocess.run(["sudo", "-n", "cat", cert_path], capture_output=True, timeout=5)
    return r.returncode == 0


def _cert_expiry(domain: str) -> Optional[datetime.datetime]:
    cert_path = f"{LETSENCRYPT_DIR}/{domain}/fullchain.pem"
    # /etc/letsencrypt/live/ is root-owned; read via sudo cat then pipe to openssl via stdin
    cat = subprocess.run(["sudo", "-n", "cat", cert_path], capture_output=True, timeout=10)
    if cat.returncode != 0:
        return None
    try:
        # Pass cert bytes directly to openssl stdin — no text=True since input is bytes
        result = subprocess.run(
            ["openssl", "x509", "-noout", "-enddate"],
            input=cat.stdout, capture_output=True, timeout=10
        )
        if result.returncode != 0:
            return None
        date_str = result.stdout.decode().strip().split("=", 1)[1]
        return datetime.datetime.strptime(date_str, "%b %d %H:%M:%S %Y %Z")
    except Exception as e:
        logger.warning(f"Could not parse cert expiry for {domain}: {e}")
        return None


def _cert_status_for(domain: str) -> CertStatus:
    expiry = _cert_expiry(domain)
    https_forced = _is_https_forced(domain)
    if expiry is None:
        return CertStatus(domain=domain, status="none", expiry=None,
                          days_remaining=None, issuer=None, https_forced=https_forced)
    now = datetime.datetime.utcnow()
    days = (expiry - now).days
    status = "expired" if days < 0 else "expiring_soon" if days < 30 else "valid"
    return CertStatus(domain=domain, status=status, expiry=expiry.strftime("%Y-%m-%d"),
                      days_remaining=days, issuer="Let's Encrypt", https_forced=https_forced)


@router.get("", response_model=List[CertStatus])
async def list_certs(current_user: User = Depends(get_current_user)):
    """Return SSL cert status for every provisioned domain.
    Only domains in the domain registry are listed — SERVER_DOMAIN is not
    injected here because SSL issuance requires a provisioned document_root
    (certbot --webroot) and an active web server vhost."""
    domains = _load_domains()
    if current_user.role != "admin":
        domains = [d for d in domains if d.get("username") == current_user.linux_user]
    return [_cert_status_for(d["domain_name"]) for d in domains]


@router.get("/renewal")
async def get_renewal_status(current_user: User = Depends(get_current_user)):
    result = subprocess.run(["systemctl", "is-active", "certbot.timer"], capture_output=True, text=True)
    return {"enabled": result.stdout.strip() == "active"}


@router.put("/renewal")
async def set_renewal(request: RenewalRequest, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    action = "enable" if request.enabled else "disable"
    try:
        subprocess.run(["sudo", "systemctl", action, "--now", "certbot.timer"],
                       check=True, capture_output=True, text=True, timeout=10)
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"systemctl error: {e.stderr.strip()}")
    log_action(current_user.username, f"ssl.renewal_{'enable' if request.enabled else 'disable'}")
    return {"enabled": request.enabled}


@router.post("/issue")
async def issue_cert(request: IssueRequest, current_user: User = Depends(get_current_user)):
    domains = _load_domains()
    record = next((d for d in domains if d["domain_name"] == request.domain), None)
    if not record:
        raise HTTPException(status_code=404, detail=f"Domain '{request.domain}' not provisioned.")
    check_domain_access(record, current_user)

    domain = request.domain
    # Apex domains get www + cpanel + ftp SANs; subdomains get only themselves
    is_apex = domain.count('.') == 1
    cmd = ["sudo", "certbot", "certonly", "--webroot", "-w", record["document_root"], "-d", domain]
    if is_apex:
        cmd += ["-d", f"www.{domain}", "-d", f"cpanel.{domain}", "-d", f"ftp.{domain}"]
    for san in request.additional_domains:
        cmd += ["-d", san]
    cmd += ["--non-interactive", "--agree-tos", "--email", CERTBOT_EMAIL,
            "--expand" if (request.force or request.additional_domains) else "--keep-until-expiring"]

    os.makedirs(CERTBOT_LOG_DIR, exist_ok=True)
    log_path = os.path.join(CERTBOT_LOG_DIR, f"{domain}.log")
    try:
        log_fd = open(log_path, "w")
        log_fd.write(f"$ {' '.join(cmd)}\n\n")
        log_fd.flush()
        subprocess.Popen(cmd, stdout=log_fd, stderr=subprocess.STDOUT)
        log_fd.close()  # parent closes; child (certbot) keeps writing
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="certbot not found.")
    log_action(current_user.username, "ssl.issue", resource=domain)
    return {"domain": domain, "status": "pending", "message": "certbot started in background"}


@router.get("/{domain}/log")
async def get_cert_log(domain: str, current_user: User = Depends(get_current_user)):
    """Return the most recent certbot log for a domain and a derived status."""
    domains = _load_domains()
    record = next((d for d in domains if d["domain_name"] == domain), None)
    if record:
        check_domain_access(record, current_user)

    log_path = os.path.join(CERTBOT_LOG_DIR, f"{domain}.log")
    if not os.path.exists(log_path):
        return {"log": "", "status": "no_log"}

    try:
        with open(log_path) as f:
            content = f.read()
    except Exception:
        return {"log": "", "status": "error"}

    if "Congratulations" in content or "Successfully received certificate" in content:
        status = "success"
    elif any(k in content for k in ("Error", "error", "FAILED", "Failed", "Problem binding",
                                    "Could not", "Unable to", "Challenge failed")):
        status = "error"
    else:
        status = "running"

    return {"log": content, "status": status}


@router.delete("/{domain}")
async def revoke_cert(domain: str, current_user: User = Depends(get_current_user)):
    domains = _load_domains()
    record = next((d for d in domains if d["domain_name"] == domain), None)
    if record:
        check_domain_access(record, current_user)
    if not _cert_readable(domain):
        raise HTTPException(status_code=404, detail=f"No certificate found for '{domain}'.")
    try:
        subprocess.run(["sudo", "certbot", "delete", "--cert-name", domain, "--non-interactive"],
                       check=True, capture_output=True, text=True, timeout=30)
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"certbot error: {e.stderr.strip()}")
    # Notify plugins (nginx) to downgrade the vhost to HTTP
    doc_root = record["document_root"] if record else None
    await call_hooks("hostpanel.hooks.ssl_cert_deleted", domain=domain, doc_root=doc_root)
    log_action(current_user.username, "ssl.revoke", resource=domain)
    return {"message": f"Certificate for {domain} removed"}


@router.put("/{domain}/force-https")
async def toggle_force_https(domain: str, request: ForceHttpsRequest, current_user: User = Depends(get_current_user)):
    domains = _load_domains()
    record = next((d for d in domains if d["domain_name"] == domain), None)
    if not record:
        raise HTTPException(status_code=404, detail=f"Domain '{domain}' not found.")
    check_domain_access(record, current_user)
    if request.enabled and not _cert_readable(domain):
        raise HTTPException(status_code=400, detail="Cannot enable Force HTTPS: no active SSL certificate.")
    # Delegate vhost rewrite to whichever web server plugin is installed
    await call_hooks("hostpanel.hooks.ssl_force_https",
                     domain=domain, enabled=request.enabled, doc_root=record["document_root"])
    log_action(current_user.username, f"ssl.force_https_{'on' if request.enabled else 'off'}", resource=domain)
    return {"domain": domain, "https_forced": request.enabled}
