"""
Cert inspection helpers — reads cert from the DB-tracked path (/home/<user>/<domain>/ssl/).
No dependency on /etc/letsencrypt or nginx.
"""
import datetime
import logging
import os
import subprocess
from typing import Optional

logger = logging.getLogger(__name__)

CERTS_WORK_DIR  = os.environ.get("CERTS_WORK_DIR", "/opt/hostpanel/certs")
CERTBOT_LOG_DIR = os.path.join(CERTS_WORK_DIR, "logs")

_ERROR_KEYWORDS   = (
    "Error", "error", "FAILED", "Failed", "failed",
    "Problem binding", "Could not", "Unable to",
    "Challenge failed", "challenges have failed",
    "NXDOMAIN", "unauthorized", "DNS problem",
)
_SUCCESS_KEYWORDS = ("Congratulations", "Successfully received certificate")


# ── Cert file parsing ──────────────────────────────────────────────────────────

def parse_cert_expiry(cert_path: str) -> Optional[datetime.datetime]:
    """Parse notAfter from a PEM file. Returns timezone-aware datetime or None."""
    try:
        r = subprocess.run(
            ["openssl", "x509", "-in", cert_path, "-noout", "-enddate"],
            capture_output=True, text=True, timeout=10,
        )
        if r.returncode != 0:
            return None
        date_str = r.stdout.strip().split("=", 1)[1]
        return datetime.datetime.strptime(date_str, "%b %d %H:%M:%S %Y %Z").replace(
            tzinfo=datetime.timezone.utc
        )
    except Exception as e:
        logger.warning("Could not parse cert expiry from %s: %s", cert_path, e)
        return None


def parse_cert_sans(cert_path: str) -> list[str]:
    """Return Subject Alternative Name DNS entries from a PEM file."""
    try:
        r = subprocess.run(
            ["openssl", "x509", "-in", cert_path, "-noout", "-ext", "subjectAltName"],
            capture_output=True, text=True, timeout=10,
        )
        if r.returncode != 0:
            return []
        return [
            p.strip()[4:] for p in r.stdout.split(",")
            if p.strip().startswith("DNS:")
        ]
    except Exception as e:
        logger.warning("Could not parse SANs from %s: %s", cert_path, e)
        return []


# ── Log-derived status ─────────────────────────────────────────────────────────

def get_log_derived_status(root_domain: str) -> str:
    """Quick status from certbot log: 'pending', 'failed', or 'none'."""
    log_path = os.path.join(CERTBOT_LOG_DIR, f"{root_domain}.log")
    if not os.path.exists(log_path):
        return "none"
    try:
        with open(log_path) as f:
            content = f.read()
        return "failed" if any(k in content for k in _ERROR_KEYWORDS) else "pending"
    except Exception:
        return "none"


def get_log_full_status(root_domain: str) -> dict:
    """Return {log, status} for the /log endpoint."""
    log_path = os.path.join(CERTBOT_LOG_DIR, f"{root_domain}.log")
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
