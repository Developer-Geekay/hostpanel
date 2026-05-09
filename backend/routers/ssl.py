import os
import datetime
import logging
import subprocess
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional

from auth import User
from deps import get_current_user
from domain_registry import _load_domains, check_domain_access
from hooks import call_hooks

router = APIRouter(prefix="/cpanelapi/ssl", tags=["SSL"])
logger = logging.getLogger(__name__)

LETSENCRYPT_DIR = "/etc/letsencrypt/live"
CERTBOT_EMAIL   = os.environ.get("CERTBOT_EMAIL", "admin@hostpanel.local")
VHOSTS_DIR      = "/opt/hostpanel/nginx/vhosts"


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


def _cert_expiry(domain: str) -> Optional[datetime.datetime]:
    cert_path = f"{LETSENCRYPT_DIR}/{domain}/fullchain.pem"
    if not os.path.exists(cert_path):
        return None
    try:
        result = subprocess.run(
            ["openssl", "x509", "-noout", "-enddate", "-in", cert_path],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode != 0:
            return None
        date_str = result.stdout.strip().split("=", 1)[1]
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
    return {"enabled": request.enabled}


@router.post("/issue")
async def issue_cert(request: IssueRequest, current_user: User = Depends(get_current_user)):
    domains = _load_domains()
    record = next((d for d in domains if d["domain_name"] == request.domain), None)
    if not record:
        raise HTTPException(status_code=404, detail=f"Domain '{request.domain}' not provisioned.")
    check_domain_access(record, current_user)

    domain = request.domain
    cmd = ["sudo", "certbot", "certonly", "--webroot", "-w", record["document_root"],
           "-d", domain, "-d", f"www.{domain}"]
    for san in request.additional_domains:
        cmd += ["-d", san]
    cmd += ["--non-interactive", "--agree-tos", "--email", CERTBOT_EMAIL,
            "--expand" if (request.force or request.additional_domains) else "--keep-until-expiring"]
    try:
        subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="certbot not found.")
    return {"domain": domain, "status": "pending", "message": "certbot started in background"}


@router.delete("/{domain}")
async def revoke_cert(domain: str, current_user: User = Depends(get_current_user)):
    domains = _load_domains()
    record = next((d for d in domains if d["domain_name"] == domain), None)
    if record:
        check_domain_access(record, current_user)
    if not os.path.exists(f"{LETSENCRYPT_DIR}/{domain}"):
        raise HTTPException(status_code=404, detail=f"No certificate found for '{domain}'.")
    try:
        subprocess.run(["sudo", "certbot", "delete", "--cert-name", domain, "--non-interactive"],
                       check=True, capture_output=True, text=True, timeout=30)
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"certbot error: {e.stderr.strip()}")
    # Notify plugins (nginx) to downgrade the vhost to HTTP
    doc_root = record["document_root"] if record else None
    await call_hooks("hostpanel.hooks.ssl_cert_deleted", domain=domain, doc_root=doc_root)
    return {"message": f"Certificate for {domain} removed"}


@router.put("/{domain}/force-https")
async def toggle_force_https(domain: str, request: ForceHttpsRequest, current_user: User = Depends(get_current_user)):
    domains = _load_domains()
    record = next((d for d in domains if d["domain_name"] == domain), None)
    if not record:
        raise HTTPException(status_code=404, detail=f"Domain '{domain}' not found.")
    check_domain_access(record, current_user)
    if request.enabled and not os.path.exists(f"{LETSENCRYPT_DIR}/{domain}/fullchain.pem"):
        raise HTTPException(status_code=400, detail="Cannot enable Force HTTPS: no active SSL certificate.")
    # Delegate vhost rewrite to whichever web server plugin is installed
    await call_hooks("hostpanel.hooks.ssl_force_https",
                     domain=domain, enabled=request.enabled, doc_root=record["document_root"])
    return {"domain": domain, "https_forced": request.enabled}
