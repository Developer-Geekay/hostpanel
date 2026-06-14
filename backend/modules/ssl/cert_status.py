"""
Cert inspection helpers — reads cert bytes, parses expiry/SANs/issuer,
derives status from log files, builds the full CertStatus dict.
All reads go through `sudo -n cat` since letsencrypt certs are root-owned.
"""
import datetime
import logging
import os
import subprocess
from typing import Optional

logger = logging.getLogger(__name__)

LETSENCRYPT_DIR  = "/etc/letsencrypt/live"
CUSTOM_CERTS_DIR = "/opt/hostpanel/custom-certs"
CERTBOT_LOG_DIR  = "/tmp/hostpanel-ssl-logs"
VHOSTS_DIR       = "/opt/hostpanel/plugins/nginx/vhosts"

_ERROR_KEYWORDS = (
    "Error", "error", "FAILED", "Failed", "failed",
    "Problem binding", "Could not", "Unable to",
    "Challenge failed", "challenges have failed",
    "NXDOMAIN", "unauthorized", "DNS problem",
)
_SUCCESS_KEYWORDS = ("Congratulations", "Successfully received certificate")


# ── Cert reading ──────────────────────────────────────────────────────────────

def read_le_cert_bytes(domain: str, le_dir: str = LETSENCRYPT_DIR) -> Optional[bytes]:
    """Read Let's Encrypt fullchain.pem via sudo cat. Returns None if unreadable."""
    cert_path = os.path.join(le_dir, domain, "fullchain.pem")
    r = subprocess.run(["sudo", "-n", "cat", cert_path], capture_output=True, timeout=10)
    return r.stdout if r.returncode == 0 else None


def read_custom_cert_bytes(domain: str, custom_dir: str = CUSTOM_CERTS_DIR) -> Optional[bytes]:
    """Read imported fullchain.pem via sudo cat. Returns None if not present."""
    cert_path = os.path.join(custom_dir, domain, "fullchain.pem")
    r = subprocess.run(["sudo", "-n", "cat", cert_path], capture_output=True, timeout=10)
    return r.stdout if r.returncode == 0 else None


def cert_file_readable(domain: str, le_dir: str = LETSENCRYPT_DIR) -> bool:
    return read_le_cert_bytes(domain, le_dir) is not None


# ── Cert parsing ──────────────────────────────────────────────────────────────

def parse_cert_expiry(cert_bytes: bytes) -> Optional[datetime.datetime]:
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


def parse_cert_sans(cert_bytes: bytes) -> list[str]:
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
        logger.warning(f"Could not parse cert SANs: {e}")
        return []


def parse_cert_issuer(cert_bytes: bytes) -> Optional[str]:
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


# ── Log-derived status ────────────────────────────────────────────────────────

def get_log_derived_status(domain: str, log_dir: str = CERTBOT_LOG_DIR) -> str:
    """Inspect certbot log file and return 'pending', 'failed', or 'none'."""
    log_path = os.path.join(log_dir, f"{domain}.log")
    if not os.path.exists(log_path):
        return "none"
    try:
        with open(log_path) as f:
            content = f.read()
        if any(k in content for k in _ERROR_KEYWORDS):
            return "failed"
        return "pending"
    except Exception:
        return "none"


def get_log_full_status(domain: str, log_dir: str = CERTBOT_LOG_DIR) -> dict:
    """Return {log, status} for the cert log endpoint."""
    log_path = os.path.join(log_dir, f"{domain}.log")
    if not os.path.exists(log_path):
        return {"log": "", "status": "no_log"}
    try:
        with open(log_path) as f:
            content = f.read()
    except Exception:
        return {"log": "", "status": "error"}

    if any(k in content for k in _SUCCESS_KEYWORDS):
        status = "success"
    elif any(k in content for k in _ERROR_KEYWORDS):
        status = "error"
    else:
        status = "running"

    return {"log": content, "status": status}


# ── HTTPS forced detection ────────────────────────────────────────────────────

def is_https_forced(domain: str, vhosts_dir: str = VHOSTS_DIR) -> bool:
    vhost_path = os.path.join(vhosts_dir, f"{domain}.conf")
    if not os.path.exists(vhost_path):
        return False
    try:
        with open(vhost_path) as f:
            return "return 301 https://" in f.read()
    except Exception:
        return False


# ── Full status builder ───────────────────────────────────────────────────────

def get_cert_status(
    domain: str,
    vhosts_dir: str = VHOSTS_DIR,
    log_dir: str = CERTBOT_LOG_DIR,
    le_dir: str = LETSENCRYPT_DIR,
    custom_dir: str = CUSTOM_CERTS_DIR,
) -> dict:
    """
    Build a full cert status dict for one domain.
    Custom cert takes priority over Let's Encrypt.
    """
    https_forced = is_https_forced(domain, vhosts_dir)

    # 1. Custom / imported cert — highest priority
    custom_bytes = read_custom_cert_bytes(domain, custom_dir)
    if custom_bytes:
        expiry = parse_cert_expiry(custom_bytes)
        if expiry:
            now = datetime.datetime.utcnow()
            days = (expiry - now).days
            status = "expired" if days < 0 else "expiring_soon" if days < 30 else "valid"
            sans = parse_cert_sans(custom_bytes)
            return {
                "domain": domain, "status": status,
                "expiry": expiry.strftime("%Y-%m-%d"), "days_remaining": days,
                "issuer": parse_cert_issuer(custom_bytes), "sans": sans,
                "https_forced": https_forced,
                "is_wildcard": any(s.startswith("*.") for s in sans),
                "source": "imported",
            }

    # 2. Revoked sentinel — check before reading LE cert
    for cert_name in [domain, f"_wildcard.{domain}"]:
        if os.path.exists(os.path.join(log_dir, f"{cert_name}.revoked")):
            return {
                "domain": domain, "status": "revoked",
                "expiry": None, "days_remaining": None, "issuer": None,
                "sans": [], "https_forced": https_forced,
                "is_wildcard": False, "source": "none",
            }

    # 3. Let's Encrypt cert
    cert_bytes = None
    for cert_name in [domain, f"_wildcard.{domain}"]:
        cert_bytes = read_le_cert_bytes(cert_name, le_dir)
        if cert_bytes:
            break

    if not cert_bytes:
        status = get_log_derived_status(domain, log_dir)
        return {
            "domain": domain, "status": status,
            "expiry": None, "days_remaining": None, "issuer": None,
            "sans": [], "https_forced": https_forced,
            "is_wildcard": False, "source": "none",
        }

    expiry = parse_cert_expiry(cert_bytes)
    if not expiry:
        return {
            "domain": domain, "status": "none",
            "expiry": None, "days_remaining": None, "issuer": None,
            "sans": [], "https_forced": https_forced,
            "is_wildcard": False, "source": "none",
        }

    now = datetime.datetime.utcnow()
    days = (expiry - now).days
    status = "expired" if days < 0 else "expiring_soon" if days < 30 else "valid"
    sans = parse_cert_sans(cert_bytes)

    return {
        "domain": domain, "status": status,
        "expiry": expiry.strftime("%Y-%m-%d"), "days_remaining": days,
        "issuer": "Let's Encrypt", "sans": sans,
        "https_forced": https_forced,
        "is_wildcard": any(s.startswith("*.") for s in sans),
        "source": "letsencrypt",
    }
