"""
All validation functions are pure — no side effects, no state mutation.
Each raises a typed exception from exceptions.py on failure.
"""
import logging
import os
import re
import shutil
import socket
import stat
import subprocess
from datetime import datetime, timezone

import psutil

from .exceptions import (
    CertbotNotInstalledError,
    ConfigValidationError,
    DNSPropagationError,
    DomainNotInPowerDNSError,
    DomainNotResolvableError,
    DomainValidationError,
    NginxConfigExistsError,
    NginxConfigInvalidError,
    NginxNotInstalledError,
    RootPrivilegesError,
)

logger = logging.getLogger(__name__)

# RFC 1035 label: 1–63 chars, alphanumeric + internal hyphens, no start/end hyphen
_LABEL_RE = re.compile(r'^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?$|^[a-zA-Z0-9]$')


# ── System ────────────────────────────────────────────────────────────────────

def validate_root_privileges() -> None:
    if os.geteuid() != 0:
        raise RootPrivilegesError("This operation must be run as root (sudo).")


def validate_certbot_installed() -> str:
    path = shutil.which("certbot")
    if not path:
        raise CertbotNotInstalledError(
            "certbot not found on PATH. Install with: apt install certbot"
        )
    return path


def validate_nginx_installed(nginx_bin: str = None) -> str:
    candidate = nginx_bin or shutil.which("nginx") or "/opt/hostpanel/plugins/nginx/nginx"
    if not os.path.isfile(candidate):
        raise NginxNotInstalledError(f"nginx binary not found at {candidate}")
    return candidate


def validate_nginx_running() -> bool:
    for proc in psutil.process_iter(["name"]):
        try:
            if proc.info["name"] in ("nginx", "nginx: master process"):
                return True
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    return False


def validate_no_process_conflict(port: int) -> None:
    for conn in psutil.net_connections(kind="inet"):
        if conn.laddr.port == port and conn.status == "LISTEN":
            try:
                proc = psutil.Process(conn.pid)
                if proc.name() not in ("nginx",):
                    raise DomainValidationError(
                        f"Port {port} is already in use by '{proc.name()}' (PID {conn.pid})"
                    )
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass


# ── Domain ────────────────────────────────────────────────────────────────────

def validate_domain_format(domain: str) -> None:
    if not domain:
        raise DomainValidationError("Domain name cannot be empty.")
    if len(domain) > 253:
        raise DomainValidationError(
            f"Domain name exceeds 253 characters: {len(domain)} chars."
        )
    if domain.startswith(".") or domain.endswith("."):
        raise DomainValidationError("Domain must not start or end with a dot.")
    if "*" in domain:
        raise DomainValidationError(
            "Wildcards are not accepted here. Use expand command for SAN additions."
        )

    labels = domain.split(".")
    if len(labels) < 2:
        raise DomainValidationError(
            f"Domain '{domain}' must contain at least one dot (bare hostnames not accepted)."
        )
    for label in labels:
        if not label:
            raise DomainValidationError(f"Domain '{domain}' contains an empty label (double dot).")
        if not _LABEL_RE.match(label):
            raise DomainValidationError(
                f"Label '{label}' in domain '{domain}' is invalid. "
                "Labels must be 1–63 chars, alphanumeric with internal hyphens only."
            )


def extract_root_domain(domain: str) -> str:
    """
    Return the apex/root domain (last two labels).
    cpanel.consoleapi.in  -> consoleapi.in
    mail.sub.test.com     -> test.com
    consoleapi.in         -> consoleapi.in
    """
    parts = domain.split(".")
    return ".".join(parts[-2:])


def validate_domain_resolvable(domain: str) -> str:
    """Resolve domain via A/AAAA lookup. Returns resolved IP. Raises DomainNotResolvableError."""
    try:
        results = socket.getaddrinfo(domain, None)
        if not results:
            raise DomainNotResolvableError(f"No DNS records found for '{domain}'.")
        ip = results[0][4][0]
        logger.debug(f"Domain '{domain}' resolves to {ip}")
        return ip
    except socket.gaierror as e:
        raise DomainNotResolvableError(f"Could not resolve '{domain}': {e}")


def validate_domain_points_to_this_server(domain: str) -> None:
    """
    Resolve domain IP and compare against this server's public interface IPs.
    Raises DomainValidationError on mismatch. Warns (does not raise) on partial match.
    """
    try:
        resolved_ip = validate_domain_resolvable(domain)
    except DomainNotResolvableError:
        raise DomainValidationError(f"'{domain}' does not resolve — cannot verify server ownership.")

    server_ips = _get_server_ips()
    if not server_ips:
        logger.warning("Could not determine server IPs — skipping server ownership check.")
        return

    if resolved_ip in server_ips:
        return

    raise DomainValidationError(
        f"'{domain}' resolves to {resolved_ip} but this server's IPs are {sorted(server_ips)}. "
        "Update your DNS A record to point to this server before issuing a cert."
    )


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


# ── Port ──────────────────────────────────────────────────────────────────────

def validate_port(port: int) -> None:
    if not (1 <= port <= 65535):
        raise ValueError(f"Port {port} is out of range (1–65535).")


def validate_port_accessible(port: int) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=1):
            return True
    except OSError:
        return False


def validate_port_not_conflicting(port: int, expected_process: str) -> None:
    for conn in psutil.net_connections(kind="inet"):
        if conn.laddr.port == port and conn.status == "LISTEN":
            try:
                proc = psutil.Process(conn.pid)
                if proc.name() != expected_process:
                    raise DomainValidationError(
                        f"Port {port} is held by '{proc.name()}' (PID {conn.pid}), "
                        f"expected '{expected_process}'."
                    )
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass


# ── Certificate ───────────────────────────────────────────────────────────────

def validate_cert_exists(domain: str, letsencrypt_dir: str = "/etc/letsencrypt/live") -> bool:
    return os.path.isfile(os.path.join(letsencrypt_dir, domain, "fullchain.pem"))


def validate_cert_covers_domain(root_domain: str, target_domain: str,
                                 letsencrypt_dir: str = "/etc/letsencrypt/live") -> bool:
    """Parse cert SANs via openssl to check if target_domain is covered."""
    cert_path = os.path.join(letsencrypt_dir, root_domain, "fullchain.pem")
    if not os.path.isfile(cert_path):
        return False
    try:
        result = subprocess.run(
            ["openssl", "x509", "-in", cert_path, "-noout", "-text"],
            capture_output=True, text=True, timeout=10
        )
        # SANs appear as: DNS:example.com, DNS:www.example.com, ...
        san_section = ""
        for line in result.stdout.splitlines():
            if "Subject Alternative Name" in line:
                san_section = next(
                    (l.strip() for l in result.stdout.splitlines()
                     if "DNS:" in l), ""
                )
                break
        sans = [s.strip().removeprefix("DNS:") for s in san_section.split(",") if "DNS:" in s]
        return target_domain in sans
    except Exception as e:
        logger.warning(f"Could not parse cert SANs for {root_domain}: {e}")
        return False


def validate_cert_not_expiring_soon(domain: str, threshold_days: int = 30,
                                     letsencrypt_dir: str = "/etc/letsencrypt/live") -> bool:
    """Return False (needs renewal) if cert expires within threshold_days."""
    cert_path = os.path.join(letsencrypt_dir, domain, "fullchain.pem")
    if not os.path.isfile(cert_path):
        return False
    try:
        result = subprocess.run(
            ["openssl", "x509", "-in", cert_path, "-noout", "-enddate"],
            capture_output=True, text=True, timeout=10
        )
        # Output: notAfter=Sep 11 12:00:00 2024 GMT
        line = result.stdout.strip()
        date_str = line.split("=", 1)[1].strip()
        expiry = datetime.strptime(date_str, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
        days_left = (expiry - datetime.now(timezone.utc)).days
        return days_left > threshold_days
    except Exception as e:
        logger.warning(f"Could not check cert expiry for {domain}: {e}")
        return False


def validate_certbot_credentials_file(path: str) -> None:
    from .config import validate_credentials_file
    validate_credentials_file(path)


def parse_certbot_domains(root_domain: str) -> list[str]:
    """
    Run `certbot certificates` and parse the SAN list for root_domain.
    Returns empty list if cert not found.
    """
    try:
        result = subprocess.run(
            ["certbot", "certificates", "--cert-name", root_domain],
            capture_output=True, text=True, timeout=30
        )
        output = result.stdout + result.stderr
        domains: list[str] = []
        in_cert = False
        for line in output.splitlines():
            if f"Certificate Name: {root_domain}" in line:
                in_cert = True
            if in_cert and "Domains:" in line:
                raw = line.split("Domains:", 1)[1].strip()
                domains = [d.strip() for d in raw.split() if d.strip()]
                break
        return domains
    except Exception as e:
        logger.warning(f"Could not parse certbot domains for {root_domain}: {e}")
        return []


# ── Nginx ─────────────────────────────────────────────────────────────────────

def validate_nginx_config_not_exists(domain: str, vhosts_dir: str) -> None:
    path = os.path.join(vhosts_dir, f"cpanel.{domain}.conf")
    if os.path.exists(path):
        raise NginxConfigExistsError(
            f"Nginx config already exists for cpanel.{domain} at {path}. "
            "Use 'update' or remove the existing config first."
        )


def validate_nginx_config_syntax(config_path: str, nginx_bin: str = None) -> None:
    bin_path = nginx_bin or shutil.which("nginx") or "/opt/hostpanel/plugins/nginx/nginx"
    result = subprocess.run(
        [bin_path, "-t", "-c", config_path],
        capture_output=True, text=True
    )
    output = (result.stderr or result.stdout).strip()
    if result.returncode != 0 and "syntax is ok" not in output:
        raise NginxConfigInvalidError(f"nginx config test failed:\n{output}")


def validate_nginx_server_name_unique(domain: str, vhosts_dir: str) -> None:
    server_name = f"cpanel.{domain}"
    if not os.path.isdir(vhosts_dir):
        return
    for fname in os.listdir(vhosts_dir):
        if not fname.endswith(".conf"):
            continue
        fpath = os.path.join(vhosts_dir, fname)
        try:
            with open(fpath) as f:
                if f"server_name {server_name}" in f.read():
                    raise NginxConfigInvalidError(
                        f"server_name '{server_name}' is already defined in {fpath}."
                    )
        except OSError:
            pass


# ── DNS Propagation ───────────────────────────────────────────────────────────

def validate_dns_txt_record_propagated(
    domain: str,
    expected_value: str,
    nameserver: str,
    retries: int = 10,
    wait_seconds: int = 6,
) -> None:
    """
    Poll _acme-challenge.<domain> TXT record until expected_value appears.
    Uses tenacity for retry with fixed wait. Raises DNSPropagationError on timeout.
    """
    import dns.resolver
    from tenacity import retry, stop_after_attempt, wait_fixed, retry_if_exception_type

    challenge_domain = f"_acme-challenge.{domain}"

    @retry(
        stop=stop_after_attempt(retries),
        wait=wait_fixed(wait_seconds),
        retry=retry_if_exception_type((dns.resolver.NXDOMAIN, dns.resolver.NoAnswer, Exception)),
        reraise=False,
    )
    def _check():
        resolver = dns.resolver.Resolver()
        resolver.nameservers = [nameserver]
        answers = resolver.resolve(challenge_domain, "TXT")
        for rdata in answers:
            for txt in rdata.strings:
                if txt.decode() == expected_value:
                    return True
        raise dns.resolver.NoAnswer(f"TXT value not yet propagated for {challenge_domain}")

    try:
        _check()
    except Exception:
        raise DNSPropagationError(
            f"DNS TXT record for '{challenge_domain}' did not propagate to {nameserver} "
            f"after {retries * wait_seconds}s. Check your PowerDNS setup."
        )


# ── Internal helpers ──────────────────────────────────────────────────────────

def _get_server_ips() -> set[str]:
    """Return set of non-loopback IPv4 addresses on this machine."""
    ips = set()
    try:
        for _iface, addrs in psutil.net_if_addrs().items():
            for addr in addrs:
                if addr.family == socket.AF_INET and not addr.address.startswith("127."):
                    ips.add(addr.address)
    except Exception as e:
        logger.warning(f"Could not enumerate network interfaces: {e}")
    return ips
