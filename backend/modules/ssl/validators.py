"""
SSL validation helpers — pure functions, no side effects.
"""
import logging
import os
import re
import shutil
import socket
import subprocess

from .exceptions import (
    CertbotNotInstalledError,
    ConfigValidationError,
    DomainNotInPowerDNSError,
    DomainNotResolvableError,
    DomainValidationError,
)

logger = logging.getLogger(__name__)

_LABEL_RE = re.compile(r'^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?$|^[a-zA-Z0-9]$')


# ── System ────────────────────────────────────────────────────────────────────

def validate_certbot_installed() -> str:
    path = shutil.which("certbot")
    if not path:
        raise CertbotNotInstalledError(
            "certbot not found on PATH. Install with: apt install certbot"
        )
    return path


def validate_hooks_exist(hooks_dir: str) -> None:
    """Verify the three certbot hook scripts exist and are executable."""
    for name in ("pdns_auth.py", "pdns_cleanup.py", "ssl_deploy.py"):
        path = os.path.join(hooks_dir, name)
        if not os.path.isfile(path):
            raise ConfigValidationError(
                f"Hook script missing: {path}. "
                "Ensure the HostPanel backend is fully deployed."
            )


# ── Domain ────────────────────────────────────────────────────────────────────

def validate_domain_format(domain: str) -> None:
    if not domain:
        raise DomainValidationError("Domain name cannot be empty.")
    if len(domain) > 253:
        raise DomainValidationError(f"Domain name too long: {len(domain)} chars.")
    if domain.startswith(".") or domain.endswith("."):
        raise DomainValidationError("Domain must not start or end with a dot.")
    if "*" in domain:
        raise DomainValidationError("Wildcard domains are not supported.")
    labels = domain.split(".")
    if len(labels) < 2:
        raise DomainValidationError(f"'{domain}' must have at least one dot.")
    for label in labels:
        if not label:
            raise DomainValidationError(f"'{domain}' contains an empty label (double dot).")
        if not _LABEL_RE.match(label):
            raise DomainValidationError(
                f"Label '{label}' in '{domain}' is invalid. "
                "Labels must be 1–63 alphanumeric chars with internal hyphens only."
            )


def extract_root_domain(domain: str) -> str:
    """
    Return the apex domain (last two labels).
    cpanel.consoleapi.in  → consoleapi.in
    mail.sub.test.com     → test.com
    """
    return ".".join(domain.split(".")[-2:])


def validate_domain_resolvable(domain: str) -> str:
    """DNS A/AAAA lookup. Returns resolved IP. Raises DomainNotResolvableError."""
    try:
        results = socket.getaddrinfo(domain, None)
        if not results:
            raise DomainNotResolvableError(f"No DNS records for '{domain}'.")
        return results[0][4][0]
    except socket.gaierror as e:
        raise DomainNotResolvableError(f"Could not resolve '{domain}': {e}")


def validate_domain_in_powerdns(root_domain: str, pdns_url: str, pdns_api_key: str) -> None:
    """Query PowerDNS API to confirm the root domain zone exists."""
    import httpx
    try:
        resp = httpx.get(
            f"{pdns_url}/api/v1/servers/localhost/zones",
            headers={"X-API-Key": pdns_api_key},
            timeout=5.0,
        )
        resp.raise_for_status()
        zones = [z["name"].rstrip(".") for z in resp.json()]
        if root_domain not in zones:
            raise DomainNotInPowerDNSError(
                f"Zone '{root_domain}' not found in PowerDNS. "
                "Create the zone first before issuing a cert."
            )
    except httpx.RequestError as e:
        raise DomainNotInPowerDNSError(f"Could not reach PowerDNS at {pdns_url}: {e}")


# ── Certbot ────────────────────────────────────────────────────────────────────

def parse_certbot_domains(root_domain: str, certs_work_dir: str | None = None) -> list[str]:
    """
    Run `certbot certificates` and parse the SAN list for root_domain.
    Returns empty list if cert not found.
    """
    cmd = ["certbot", "certificates", "--cert-name", root_domain, "--non-interactive"]
    if certs_work_dir:
        cmd += ["--config-dir", certs_work_dir]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        output = result.stdout + result.stderr
        for line in output.splitlines():
            if "Domains:" in line and root_domain in output:
                raw = line.split("Domains:", 1)[1].strip()
                return [d.strip() for d in raw.split() if d.strip()]
        return []
    except Exception as e:
        logger.warning("Could not parse certbot domains for %s: %s", root_domain, e)
        return []
