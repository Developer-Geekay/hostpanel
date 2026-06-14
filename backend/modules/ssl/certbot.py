"""
Certbot subprocess interaction layer.
All calls use shell=False and list-form args — never string interpolation into shell.
"""
import logging
import os
import subprocess
from typing import Optional

from .exceptions import CertbotExecutionError, CertExpansionError
from .validators import parse_certbot_domains

logger = logging.getLogger(__name__)

_CERTBOT_TIMEOUT = 300  # 5 min max for cert operations


def _run_certbot(args: list[str], timeout: int = _CERTBOT_TIMEOUT) -> subprocess.CompletedProcess:
    """Run certbot with the given args. Raises CertbotExecutionError on non-zero exit."""
    cmd = ["certbot"] + args
    logger.debug(f"Running: {' '.join(cmd)}")
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
        shell=False,
    )
    if result.returncode != 0:
        output = (result.stdout + "\n" + result.stderr).strip()
        raise CertbotExecutionError(
            f"certbot exited with code {result.returncode}:\n{output}"
        )
    return result


def get_existing_domains(root_domain: str) -> list[str]:
    """
    Parse `certbot certificates --cert-name <root_domain>` output.
    Returns current SAN list, or empty list if cert doesn't exist.
    """
    return parse_certbot_domains(root_domain)


def issue_new_cert(
    domains: list[str],
    credentials_file: str,
    email: str,
    dry_run: bool = False,
) -> None:
    """
    Issue a new cert via certbot certonly --dns-rfc2136 for all given domains.
    domains[0] should be the primary/root domain.
    Raises CertbotExecutionError on failure.
    """
    if not domains:
        raise CertbotExecutionError("At least one domain is required to issue a cert.")

    # Sanitise: strip any leading/trailing whitespace or dots from each domain
    clean = [d.strip().strip(".") for d in domains if d.strip()]
    if not clean:
        raise CertbotExecutionError("Domain list is empty after sanitisation.")

    args = [
        "certonly",
        "--dns-rfc2136",
        "--dns-rfc2136-credentials", credentials_file,
        "--non-interactive",
        "--agree-tos",
        "--email", email,
        "--cert-name", clean[0],
    ]
    for domain in clean:
        args += ["-d", domain]

    if dry_run:
        args.append("--dry-run")

    logger.info(f"Issuing new cert for: {', '.join(clean)}")
    _run_certbot(args)
    logger.info(f"Cert issued successfully for {clean[0]}")


def expand_existing_cert(
    root_domain: str,
    new_domain: str,
    credentials_file: str,
    email: str,
    dry_run: bool = False,
) -> list[str]:
    """
    Expand an existing cert to include new_domain.
    1. Fetch current SAN list.
    2. Return early if new_domain already covered (idempotent).
    3. Append new_domain and re-run certbot with --expand.
    Returns the updated SAN list.
    Raises CertExpansionError on failure.
    """
    current_sans = get_existing_domains(root_domain)
    if not current_sans:
        raise CertExpansionError(
            f"No existing cert found for '{root_domain}'. "
            "Use issue_new_cert() instead."
        )

    if new_domain in current_sans:
        logger.info(f"'{new_domain}' already in cert SANs for {root_domain} — skipping expand.")
        return current_sans

    updated_sans = current_sans + [new_domain]

    args = [
        "certonly",
        "--dns-rfc2136",
        "--dns-rfc2136-credentials", credentials_file,
        "--non-interactive",
        "--agree-tos",
        "--email", email,
        "--cert-name", root_domain,
        "--expand",
    ]
    for domain in updated_sans:
        args += ["-d", domain]

    if dry_run:
        args.append("--dry-run")

    logger.info(f"Expanding cert for {root_domain}: adding '{new_domain}'")
    try:
        _run_certbot(args)
    except CertbotExecutionError as e:
        raise CertExpansionError(f"Failed to expand cert for '{root_domain}': {e}") from e

    logger.info(f"Cert expanded — new SAN list: {updated_sans}")
    return updated_sans


def renew_cert(root_domain: str, force: bool = False) -> None:
    """
    Renew cert for root_domain via `certbot renew --cert-name`.
    Pass force=True to renew even if not yet due.
    Raises CertbotExecutionError on failure.
    """
    args = ["renew", "--cert-name", root_domain, "--non-interactive"]
    if force:
        args.append("--force-renewal")

    logger.info(f"Renewing cert for {root_domain} (force={force})")
    _run_certbot(args)
    logger.info(f"Cert renewed for {root_domain}")


def revoke_and_delete_cert(root_domain: str, reason: str = "unspecified") -> None:
    """
    Revoke and delete a Let's Encrypt cert.
    Raises CertbotExecutionError on failure.
    """
    args = [
        "delete",
        "--cert-name", root_domain,
        "--non-interactive",
    ]
    logger.info(f"Deleting cert for {root_domain}")
    _run_certbot(args)
    logger.info(f"Cert deleted for {root_domain}")


def spawn_certbot_background(cmd: list[str], domain: str, log_dir: str) -> None:
    """
    Write log header and spawn certbot as a background Popen (non-blocking).
    Used by the API issue/renew endpoints so the HTTP request returns immediately.
    The frontend polls GET /{domain}/log to track progress.
    """
    os.makedirs(log_dir, exist_ok=True)
    log_path = os.path.join(log_dir, f"{domain}.log")
    with open(log_path, "w") as log_fd:
        log_fd.write(f"$ {' '.join(cmd)}\n\n")
        log_fd.flush()
        subprocess.Popen(cmd, stdout=log_fd, stderr=subprocess.STDOUT)
    logger.info(f"certbot spawned in background for {domain}, log: {log_path}")


def shrink_cert_sans(
    root_domain: str,
    remove_domain: str,
    credentials_file: str,
    email: str,
) -> list[str]:
    """
    Re-issue cert with remove_domain excluded from the SAN list.
    Returns the reduced SAN list, or current list if remove_domain wasn't present.
    """
    current_sans = get_existing_domains(root_domain)
    if remove_domain not in current_sans:
        logger.info(f"'{remove_domain}' not in SANs for {root_domain} — nothing to shrink.")
        return current_sans

    reduced = [d for d in current_sans if d != remove_domain]
    if not reduced:
        raise CertbotExecutionError(
            f"Cannot shrink cert — removing '{remove_domain}' would leave no domains."
        )

    args = [
        "certonly",
        "--dns-rfc2136",
        "--dns-rfc2136-credentials", credentials_file,
        "--non-interactive",
        "--agree-tos",
        "--email", email,
        "--cert-name", root_domain,
        "--expand",  # certbot requires --expand when changing the SAN list
    ]
    for domain in reduced:
        args += ["-d", domain]

    logger.info(f"Shrinking cert for {root_domain}: removing '{remove_domain}'")
    _run_certbot(args)
    logger.info(f"Cert shrunk — remaining SANs: {reduced}")
    return reduced
