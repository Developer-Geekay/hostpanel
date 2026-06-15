"""
Certbot subprocess interaction — DNS-01 via --manual + PowerDNS auth/cleanup hooks.
All certbot calls use list-form args (never shell=True or string interpolation).
"""
import logging
import os
import subprocess

from .exceptions import CertbotExecutionError

logger = logging.getLogger(__name__)

CERTS_WORK_DIR  = os.environ.get("CERTS_WORK_DIR", "/opt/hostpanel/certs")
CERTBOT_LOG_DIR = os.path.join(CERTS_WORK_DIR, "logs")

_HOOKS_DIR       = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "hooks")
_CERTBOT_TIMEOUT = 300


def _cfg_args(cfg: dict) -> tuple[str, str, str, str, str, str]:
    """Extract commonly-used config values."""
    certs_dir = cfg.get("CERTS_WORK_DIR", CERTS_WORK_DIR)
    hooks_dir = cfg.get("HOOKS_DIR", _HOOKS_DIR)
    pdns_url  = cfg.get("PDNS_URL",   "http://127.0.0.1:8053")
    pdns_key  = cfg.get("PDNS_API_KEY", "hostpanel-dns-api-key")
    email     = cfg.get("CERTBOT_EMAIL", "admin@hostpanel.local")
    return certs_dir, hooks_dir, pdns_url, pdns_key, email


def _common_args(cfg: dict) -> list[str]:
    """Build the shared certbot flags used by every certonly/renew call."""
    certs_dir, hooks_dir, pdns_url, pdns_key, email = _cfg_args(cfg)
    return [
        "--manual", "--preferred-challenges", "dns",
        "--manual-auth-hook",
            f"python3 {hooks_dir}/pdns_auth.py {pdns_url} {pdns_key}",
        "--manual-cleanup-hook",
            f"python3 {hooks_dir}/pdns_cleanup.py {pdns_url} {pdns_key}",
        "--manual-public-ip-logging-ok",
        "--deploy-hook", f"python3 {hooks_dir}/ssl_deploy.py",
        "--config-dir", certs_dir,
        "--work-dir",   os.path.join(certs_dir, "work"),
        "--logs-dir",   os.path.join(certs_dir, "logs"),
        "--non-interactive", "--agree-tos", "--email", email,
    ]


def _run(args: list[str], timeout: int = _CERTBOT_TIMEOUT) -> subprocess.CompletedProcess:
    cmd = ["certbot"] + args
    logger.debug("Running: %s", " ".join(cmd))
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, shell=False)
    if result.returncode != 0:
        output = (result.stdout + "\n" + result.stderr).strip()
        raise CertbotExecutionError(f"certbot exited {result.returncode}:\n{output}")
    return result


def issue_cert(domains: list[str], cfg: dict) -> None:
    """Issue a new DNS-01 cert. domains[0] becomes the cert-name."""
    if not domains:
        raise CertbotExecutionError("At least one domain is required.")
    clean = [d.strip().strip(".") for d in domains if d.strip()]
    args = ["certonly"] + _common_args(cfg) + ["--cert-name", clean[0]]
    for d in clean:
        args += ["-d", d]
    logger.info("Issuing cert for: %s", ", ".join(clean))
    _run(args)


def reissue_cert(root_domain: str, domains: list[str], cfg: dict) -> None:
    """Force-reissue cert with an updated domain list (expand, shrink, or unchanged)."""
    if not domains:
        raise CertbotExecutionError("Domain list cannot be empty for reissue.")
    clean = [d.strip().strip(".") for d in domains if d.strip()]
    args = (
        ["certonly"] + _common_args(cfg)
        + ["--cert-name", root_domain, "--force-renewal"]
    )
    for d in clean:
        args += ["-d", d]
    logger.info("Reissuing cert for %s with SANs: %s", root_domain, ", ".join(clean))
    _run(args)


def renew_cert(root_domain: str, cfg: dict, force: bool = False) -> None:
    """Renew an existing cert (used by the auto-renew timer or manual force-renew)."""
    certs_dir = cfg.get("CERTS_WORK_DIR", CERTS_WORK_DIR)
    args = ["renew", "--cert-name", root_domain, "--non-interactive",
            "--config-dir", certs_dir]
    if force:
        args.append("--force-renewal")
    logger.info("Renewing cert for %s (force=%s)", root_domain, force)
    _run(args)


def delete_cert(root_domain: str, cfg: dict) -> None:
    """Delete certbot's internal cert lineage (does not touch our /home/ ssl copy)."""
    certs_dir = cfg.get("CERTS_WORK_DIR", CERTS_WORK_DIR)
    args = ["delete", "--cert-name", root_domain, "--non-interactive",
            "--config-dir", certs_dir]
    logger.info("Deleting certbot lineage for %s", root_domain)
    _run(args)


def spawn_background(cmd: list[str], domain: str) -> None:
    """
    Write log header and spawn certbot as a background Popen (non-blocking).
    Frontend polls GET /{root_domain}/log to track progress.
    """
    os.makedirs(CERTBOT_LOG_DIR, exist_ok=True)
    log_path = os.path.join(CERTBOT_LOG_DIR, f"{domain}.log")
    with open(log_path, "w") as lf:
        lf.write(f"$ {' '.join(cmd)}\n\n")
        lf.flush()
        subprocess.Popen(cmd, stdout=lf, stderr=subprocess.STDOUT)
    logger.info("certbot spawned in background for %s, log: %s", domain, log_path)
