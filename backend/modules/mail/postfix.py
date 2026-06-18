import logging
import subprocess

logger = logging.getLogger(__name__)

VIRTUAL_DOMAINS = "/etc/postfix/virtual_domains"
VIRTUAL_MAILBOX = "/etc/postfix/virtual_mailbox"
VIRTUAL_ALIAS   = "/etc/postfix/virtual_alias"
VMAIL_BASE      = "/var/mail/vhosts"
VMAIL_UID       = "5000"
VMAIL_GID       = "5000"

POSTFIX_PARAMS = {
    "virtual_mailbox_domains": f"hash:{VIRTUAL_DOMAINS}",
    "virtual_mailbox_base":    VMAIL_BASE,
    "virtual_mailbox_maps":    f"hash:{VIRTUAL_MAILBOX}",
    "virtual_alias_maps":      f"hash:{VIRTUAL_ALIAS}",
    "virtual_minimum_uid":     "100",
    "virtual_uid_maps":        f"static:{VMAIL_UID}",
    "virtual_gid_maps":        f"static:{VMAIL_GID}",
}


def _tee(path: str, content: str) -> None:
    r = subprocess.run(
        ["sudo", "tee", path],
        input=content, text=True, capture_output=True
    )
    if r.returncode != 0:
        raise OSError(f"tee {path} failed: {r.stderr.strip()}")


def _run(cmd: list[str]) -> None:
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        logger.warning(f"Command {' '.join(cmd)} failed: {r.stderr.strip()}")


def configure_postfix() -> None:
    """Apply virtual mailbox settings to Postfix main.cf via postconf."""
    for key, val in POSTFIX_PARAMS.items():
        _run(["sudo", "postconf", "-e", f"{key} = {val}"])
    logger.info("Postfix virtual mailbox parameters configured")


def rebuild(domains: list[str], accounts: list[dict], aliases: list[dict]) -> None:
    """Rebuild all three virtual map files from current data and reload Postfix."""
    # virtual_domains: domain → OK
    domains_content = "\n".join(f"{d} OK" for d in domains) + "\n" if domains else "\n"
    _tee(VIRTUAL_DOMAINS, domains_content)
    _run(["sudo", "postmap", VIRTUAL_DOMAINS])

    # virtual_mailbox: email → domain/localpart/
    mailbox_lines = []
    for acc in accounts:
        email = acc["email"]
        domain = acc["domain"]
        localpart = email.split("@")[0]
        mailbox_lines.append(f"{email} {domain}/{localpart}/")
    mailbox_content = "\n".join(mailbox_lines) + "\n" if mailbox_lines else "\n"
    _tee(VIRTUAL_MAILBOX, mailbox_content)
    _run(["sudo", "postmap", VIRTUAL_MAILBOX])

    # virtual_alias: alias → target
    alias_lines = [f"{a['alias']} {a['target']}" for a in aliases]
    alias_content = "\n".join(alias_lines) + "\n" if alias_lines else "\n"
    _tee(VIRTUAL_ALIAS, alias_content)
    _run(["sudo", "postmap", VIRTUAL_ALIAS])

    _run(["sudo", "postfix", "reload"])
    logger.info(f"Postfix maps rebuilt: {len(domains)} domains, {len(accounts)} accounts, {len(aliases)} aliases")


def postfix_running() -> bool:
    r = subprocess.run(
        ["sudo", "systemctl", "is-active", "postfix"],
        capture_output=True, text=True
    )
    return r.stdout.strip() == "active"
