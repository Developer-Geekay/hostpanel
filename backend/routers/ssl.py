"""
SSL Certificate & Let's Encrypt API Router

Path Prefix: `/cpanelapi/ssl`
Access Control: Injected current user dependency (standard users are scoped to their domains).

Integrations:
- Certbot: Spawns Let's Encrypt certbot background processes for issue and renew.
- OpenSSL: Extracts expiry, SANs, and issuer from cert bytes via stdin pipe.
- Dynamic Hooks: Notifies installed plugins (nginx) of SSL creations, deletions, force-HTTPS rewrites.

Endpoints:
- `GET /`                   : cert health + SANs for all provisioned domains
- `GET /renewal`            : inspect certbot.timer state
- `PUT /renewal`            : enable/disable auto-renew timer (Admin-only)
- `POST /issue`             : issue new cert via certbot certonly --webroot
- `POST /{domain}/renew`    : force-renew existing cert via certbot renew
- `GET /{domain}/log`       : tail latest certbot log and derive status
- `DELETE /{domain}`        : revoke cert, write sentinel, trigger nginx downgrade
- `PUT /{domain}/force-https`: toggle HTTPS redirect in nginx vhost
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
PDNS_URL     = os.environ.get("PDNS_URL", "http://127.0.0.1:8053")
PDNS_API_KEY = os.environ.get("PDNS_API_KEY", "hostpanel-dns-api-key")
HOOKS_DIR    = os.path.join(os.path.dirname(os.path.dirname(__file__)), "hooks")

router = APIRouter(prefix="/cpanelapi/ssl", tags=["SSL"])
logger = logging.getLogger(__name__)

LETSENCRYPT_DIR = "/etc/letsencrypt/live"
CERTBOT_EMAIL   = os.environ.get("CERTBOT_EMAIL", "admin@hostpanel.local")
VHOSTS_DIR      = "/opt/hostpanel/plugins/nginx/vhosts"
CERTBOT_LOG_DIR  = "/tmp/hostpanel-ssl-logs"
CUSTOM_CERTS_DIR = "/opt/hostpanel/custom-certs"


class CertStatus(BaseModel):
    domain: str
    status: str           # none|pending|failed|valid|expiring_soon|expired|revoked
    expiry: Optional[str]
    days_remaining: Optional[int]
    issuer: Optional[str]
    sans: List[str] = []
    https_forced: bool
    is_wildcard: bool = False
    source: str = "none"  # none|letsencrypt|imported

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


# ── Helpers ────────────────────────────────────────────────────────────────────

def _is_https_forced(domain: str) -> bool:
    vhost_path = f"{VHOSTS_DIR}/{domain}.conf"
    if not os.path.exists(vhost_path):
        return False
    try:
        with open(vhost_path) as f:
            return "return 301 https://" in f.read()
    except Exception:
        return False


def _cert_readable(domain: str) -> bool:
    cert_path = f"{LETSENCRYPT_DIR}/{domain}/fullchain.pem"
    r = subprocess.run(["sudo", "-n", "cat", cert_path], capture_output=True, timeout=5)
    return r.returncode == 0


def _read_cert_bytes(domain: str) -> Optional[bytes]:
    """Return Let's Encrypt cert bytes via sudo cat, or None if unreadable."""
    cert_path = f"{LETSENCRYPT_DIR}/{domain}/fullchain.pem"
    r = subprocess.run(["sudo", "-n", "cat", cert_path], capture_output=True, timeout=10)
    return r.stdout if r.returncode == 0 else None


def _read_custom_cert_bytes(domain: str) -> Optional[bytes]:
    """Return imported cert bytes from custom-certs dir, or None if not present."""
    cert_path = os.path.join(CUSTOM_CERTS_DIR, domain, "fullchain.pem")
    r = subprocess.run(["sudo", "-n", "cat", cert_path], capture_output=True, timeout=10)
    return r.stdout if r.returncode == 0 else None


def _cert_expiry(cert_bytes: bytes) -> Optional[datetime.datetime]:
    try:
        result = subprocess.run(
            ["openssl", "x509", "-noout", "-enddate"],
            input=cert_bytes, capture_output=True, timeout=10
        )
        if result.returncode != 0:
            return None
        date_str = result.stdout.decode().strip().split("=", 1)[1]
        return datetime.datetime.strptime(date_str, "%b %d %H:%M:%S %Y %Z")
    except Exception as e:
        logger.warning(f"Could not parse cert expiry: {e}")
        return None


def _cert_sans(cert_bytes: bytes) -> List[str]:
    try:
        result = subprocess.run(
            ["openssl", "x509", "-noout", "-ext", "subjectAltName"],
            input=cert_bytes, capture_output=True, timeout=10
        )
        if result.returncode != 0:
            return []
        sans = []
        for part in result.stdout.decode().split(","):
            part = part.strip()
            if part.startswith("DNS:"):
                sans.append(part[4:])
        return sans
    except Exception as e:
        logger.warning(f"Could not parse SANs: {e}")
        return []


def _cert_issuer(cert_bytes: bytes) -> Optional[str]:
    try:
        result = subprocess.run(
            ["openssl", "x509", "-noout", "-issuer"],
            input=cert_bytes, capture_output=True, timeout=10
        )
        if result.returncode != 0:
            return None
        line = result.stdout.decode().strip()
        if "Let" in line and "Encrypt" in line:
            return "Let's Encrypt"
        for part in line.replace("issuer=", "").split(","):
            part = part.strip()
            if part.startswith("O =") or part.startswith("O="):
                return part.split("=", 1)[1].strip()
        return None
    except Exception as e:
        logger.warning(f"Could not parse cert issuer: {e}")
        return None


def _log_derived_status(domain: str) -> str:
    """Read certbot log and return 'pending', 'failed', or 'none'."""
    log_path = os.path.join(CERTBOT_LOG_DIR, f"{domain}.log")
    if not os.path.exists(log_path):
        return "none"
    try:
        with open(log_path) as f:
            content = f.read()
        if any(k in content for k in ("Error", "error", "FAILED", "Failed", "failed",
                                       "Problem binding", "Could not", "Unable to",
                                       "Challenge failed", "challenges have failed",
                                       "NXDOMAIN", "unauthorized", "DNS problem")):
            return "failed"
        return "pending"
    except Exception:
        return "none"


def _cert_status_for(domain: str) -> CertStatus:
    https_forced = _is_https_forced(domain)

    # Check imported cert first — takes priority over Let's Encrypt
    custom_bytes = _read_custom_cert_bytes(domain)
    if custom_bytes:
        expiry = _cert_expiry(custom_bytes)
        if expiry:
            now = datetime.datetime.utcnow()
            days = (expiry - now).days
            status = "expired" if days < 0 else "expiring_soon" if days < 30 else "valid"
            sans = _cert_sans(custom_bytes)
            return CertStatus(
                domain=domain, status=status,
                expiry=expiry.strftime("%Y-%m-%d"), days_remaining=days,
                issuer=_cert_issuer(custom_bytes), sans=sans,
                https_forced=https_forced,
                is_wildcard=any(s.startswith("*.") for s in sans),
                source="imported",
            )

    # Certbot may store wildcard certs under _wildcard.{domain} if --cert-name wasn't forced.
    # Check both names; prefer {domain}.
    cert_names = [domain, f"_wildcard.{domain}"]

    for cert_name in cert_names:
        revoked_path = os.path.join(CERTBOT_LOG_DIR, f"{cert_name}.revoked")
        if os.path.exists(revoked_path):
            return CertStatus(domain=domain, status="revoked", expiry=None,
                              days_remaining=None, issuer=None, sans=[],
                              https_forced=https_forced, source="none")

    cert_bytes = None
    for cert_name in cert_names:
        cert_bytes = _read_cert_bytes(cert_name)
        if cert_bytes is not None:
            break

    if cert_bytes is None:
        status = _log_derived_status(domain)
        return CertStatus(domain=domain, status=status, expiry=None,
                          days_remaining=None, issuer=None, sans=[],
                          https_forced=https_forced, source="none")

    expiry = _cert_expiry(cert_bytes)
    if expiry is None:
        return CertStatus(domain=domain, status="none", expiry=None,
                          days_remaining=None, issuer=None, sans=[],
                          https_forced=https_forced, source="none")

    now = datetime.datetime.utcnow()
    days = (expiry - now).days
    status = "expired" if days < 0 else "expiring_soon" if days < 30 else "valid"
    sans = _cert_sans(cert_bytes)
    is_wildcard = any(s.startswith("*.") for s in sans)

    return CertStatus(
        domain=domain, status=status,
        expiry=expiry.strftime("%Y-%m-%d"), days_remaining=days,
        issuer="Let's Encrypt", sans=sans, https_forced=https_forced,
        is_wildcard=is_wildcard, source="letsencrypt",
    )


def _spawn_certbot(cmd: List[str], domain: str):
    """Write log header and spawn certbot as a background process."""
    os.makedirs(CERTBOT_LOG_DIR, exist_ok=True)
    log_path = os.path.join(CERTBOT_LOG_DIR, f"{domain}.log")
    log_fd = open(log_path, "w")
    log_fd.write(f"$ {' '.join(cmd)}\n\n")
    log_fd.flush()
    subprocess.Popen(cmd, stdout=log_fd, stderr=subprocess.STDOUT)
    log_fd.close()


# ── Routes ─────────────────────────────────────────────────────────────────────

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

    if request.wildcard:
        auth_hook    = f"python3 {HOOKS_DIR}/pdns_auth.py {PDNS_URL} {PDNS_API_KEY}"
        cleanup_hook = f"python3 {HOOKS_DIR}/pdns_cleanup.py {PDNS_URL} {PDNS_API_KEY}"
        cmd = ["sudo", "certbot", "certonly",
               "--manual", "--preferred-challenges", "dns",
               "--manual-auth-hook",    auth_hook,
               "--manual-cleanup-hook", cleanup_hook,
               "--manual-public-ip-logging-ok",
               "-d", domain, "-d", f"*.{domain}", "--cert-name", domain]
        for san in request.additional_domains:
            cmd += ["-d", san]
        cmd += ["--non-interactive", "--agree-tos", "--email", CERTBOT_EMAIL,
                "--expand" if (request.force or request.additional_domains) else "--keep-until-expiring"]
    else:
        is_apex = domain.count('.') == 1
        cmd = ["sudo", "certbot", "certonly", "--webroot", "-w", record["document_root"], "-d", domain]
        if is_apex:
            cmd += ["-d", f"www.{domain}"]
            # cpanel subdomain uses the same webroot (nginx cpanel vhost serves ACME from there)
            cpanel_vhost = f"{VHOSTS_DIR}/cpanel.{domain}.conf"
            if os.path.exists(cpanel_vhost):
                cmd += ["-d", f"cpanel.{domain}"]
        for san in request.additional_domains:
            cmd += ["-d", san]
        cmd += ["--non-interactive", "--agree-tos", "--email", CERTBOT_EMAIL,
                "--expand" if (request.force or request.additional_domains) else "--keep-until-expiring"]

    # Clear any stale revoked sentinel so status shows pending instead of revoked
    revoked_path = os.path.join(CERTBOT_LOG_DIR, f"{domain}.revoked")
    if os.path.exists(revoked_path):
        try: os.remove(revoked_path)
        except Exception: pass

    try:
        _spawn_certbot(cmd, domain)
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="certbot not found.")
    log_action(current_user.username, "ssl.issue", resource=domain)
    return {"domain": domain, "status": "pending", "message": "certbot started in background"}


@router.post("/{domain}/renew")
async def renew_cert(domain: str, current_user: User = Depends(get_current_user)):
    """Force-renew an existing certificate via certbot renew."""
    domains = _load_domains()
    record = next((d for d in domains if d["domain_name"] == domain), None)
    if not record:
        raise HTTPException(status_code=404, detail=f"Domain '{domain}' not provisioned.")
    check_domain_access(record, current_user)
    if not _cert_readable(domain):
        raise HTTPException(status_code=400,
                            detail=f"No existing certificate for '{domain}'. Use /issue instead.")

    cmd = ["sudo", "certbot", "renew", "--cert-name", domain, "--force-renewal", "--non-interactive"]
    try:
        _spawn_certbot(cmd, domain)
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="certbot not found.")
    log_action(current_user.username, "ssl.renew", resource=domain)
    return {"domain": domain, "status": "pending", "message": "certbot renew started in background"}


@router.post("/{domain}/import")
async def import_cert(domain: str, request: ImportRequest, current_user: User = Depends(get_current_user)):
    """Install a commercial/custom certificate from PEM strings."""
    domains = _load_domains()
    record = next((d for d in domains if d["domain_name"] == domain), None)
    if not record:
        raise HTTPException(status_code=404, detail=f"Domain '{domain}' not provisioned.")
    check_domain_access(record, current_user)

    for label, pem in [("cert_pem", request.cert_pem), ("key_pem", request.key_pem), ("chain_pem", request.chain_pem)]:
        if "-----BEGIN" not in pem:
            raise HTTPException(status_code=400, detail=f"{label} does not appear to be valid PEM")

    cert_check = subprocess.run(
        ["openssl", "x509", "-noout"],
        input=request.cert_pem.encode(), capture_output=True, timeout=10
    )
    if cert_check.returncode != 0:
        raise HTTPException(status_code=400, detail="cert_pem is not a valid certificate")

    cert_dir = os.path.join(CUSTOM_CERTS_DIR, domain)
    try:
        r = subprocess.run(["sudo", "mkdir", "-p", cert_dir], capture_output=True, timeout=10)
        if r.returncode != 0:
            raise HTTPException(status_code=500, detail=f"Failed to create cert directory: {r.stderr.decode().strip()}")

        fullchain = request.cert_pem.strip() + "\n" + request.chain_pem.strip() + "\n"
        files = {
            "cert.pem":     request.cert_pem,
            "privkey.pem":  request.key_pem,
            "chain.pem":    request.chain_pem,
            "fullchain.pem": fullchain,
        }
        for filename, content in files.items():
            proc = subprocess.run(
                ["sudo", "tee", os.path.join(cert_dir, filename)],
                input=content.encode(), capture_output=True, timeout=10
            )
            if proc.returncode != 0:
                raise HTTPException(status_code=500, detail=f"Failed to write {filename}")
        subprocess.run(["sudo", "chmod", "600", os.path.join(cert_dir, "privkey.pem")],
                       capture_output=True, timeout=5)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Clear any revoked sentinel so status reflects the new cert
    revoked_path = os.path.join(CERTBOT_LOG_DIR, f"{domain}.revoked")
    if os.path.exists(revoked_path):
        try: os.remove(revoked_path)
        except Exception: pass

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
    elif any(k in content for k in ("Error", "error", "FAILED", "Failed", "failed",
                                    "Problem binding", "Could not", "Unable to",
                                    "Challenge failed", "challenges have failed",
                                    "NXDOMAIN", "unauthorized", "DNS problem")):
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

    custom_dir = os.path.join(CUSTOM_CERTS_DIR, domain)
    has_custom = _read_custom_cert_bytes(domain) is not None
    has_le     = _cert_readable(domain)

    if not has_custom and not has_le:
        raise HTTPException(status_code=404, detail=f"No certificate found for '{domain}'.")

    if has_custom:
        r = subprocess.run(["sudo", "rm", "-rf", custom_dir], capture_output=True, timeout=10)
        if r.returncode != 0:
            raise HTTPException(status_code=500, detail=f"Failed to remove cert directory: {r.stderr.decode().strip()}")
    else:
        try:
            subprocess.run(["sudo", "certbot", "delete", "--cert-name", domain, "--non-interactive"],
                           check=True, capture_output=True, text=True, timeout=30)
        except subprocess.CalledProcessError as e:
            raise HTTPException(status_code=500, detail=f"certbot error: {e.stderr.strip()}")

    # Write revoked sentinel so list_certs returns status=revoked
    os.makedirs(CERTBOT_LOG_DIR, exist_ok=True)
    try:
        with open(os.path.join(CERTBOT_LOG_DIR, f"{domain}.revoked"), "w") as f:
            f.write(datetime.datetime.utcnow().isoformat())
    except Exception:
        pass

    doc_root = record["document_root"] if record else None
    await call_hooks("hostpanel.hooks.ssl_cert_deleted", domain=domain, doc_root=doc_root)
    log_action(current_user.username, "ssl.revoke", resource=domain)
    return {"message": f"Certificate for {domain} removed"}


@router.put("/{domain}/force-https")
async def toggle_force_https(domain: str, request: ForceHttpsRequest,
                              current_user: User = Depends(get_current_user)):
    domains = _load_domains()
    record = next((d for d in domains if d["domain_name"] == domain), None)
    if not record:
        raise HTTPException(status_code=404, detail=f"Domain '{domain}' not found.")
    check_domain_access(record, current_user)
    if request.enabled and not (_cert_readable(domain) or _read_custom_cert_bytes(domain) is not None):
        raise HTTPException(status_code=400, detail="Cannot enable Force HTTPS: no active SSL certificate.")
    await call_hooks("hostpanel.hooks.ssl_force_https",
                     domain=domain, enabled=request.enabled, doc_root=record["document_root"])
    log_action(current_user.username, f"ssl.force_https_{'on' if request.enabled else 'off'}", resource=domain)
    return {"domain": domain, "https_forced": request.enabled}
