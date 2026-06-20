import logging
import subprocess

logger = logging.getLogger(__name__)

MAIL_DIR        = "/opt/hostpanel/mail"
VIRTUAL_DOMAINS = f"{MAIL_DIR}/virtual_domains"
VIRTUAL_MAILBOX = f"{MAIL_DIR}/virtual_mailbox"
VIRTUAL_ALIAS   = f"{MAIL_DIR}/virtual_alias"
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
    # DKIM signing via OpenDKIM milter
    "milter_protocol":         "6",
    "milter_default_action":   "accept",
    "smtpd_milters":           "inet:127.0.0.1:12301",
    "non_smtpd_milters":       "inet:127.0.0.1:12301",
    # SASL auth via Dovecot (for ports 587/465 client submission)
    "smtpd_sasl_type":         "dovecot",
    "smtpd_sasl_path":         "private/auth",
    "smtpd_sasl_auth_enable":  "yes",
}

# Appended to master.cf once (marker prevents duplicates)
_MASTER_CF_MARKER = "# HostPanel submission ports"
_MASTER_CF_BLOCK = """
# HostPanel submission ports
submission inet n - n - - smtpd
  -o syslog_name=postfix/submission
  -o smtpd_tls_security_level=encrypt
  -o smtpd_sasl_auth_enable=yes
  -o smtpd_relay_restrictions=permit_sasl_authenticated,reject

submissions inet n - n - - smtpd
  -o syslog_name=postfix/submissions
  -o smtpd_tls_wrappermode=yes
  -o smtpd_sasl_auth_enable=yes
  -o smtpd_relay_restrictions=permit_sasl_authenticated,reject
"""


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


def _enable_submission_ports() -> None:
    """Append submission (587) and submissions (465) blocks to master.cf once."""
    r = subprocess.run(["sudo", "cat", "/etc/postfix/master.cf"], capture_output=True, text=True)
    if r.returncode != 0:
        logger.warning("Could not read master.cf")
        return
    if _MASTER_CF_MARKER in r.stdout:
        return  # already patched
    r2 = subprocess.run(
        ["sudo", "tee", "-a", "/etc/postfix/master.cf"],
        input=_MASTER_CF_BLOCK, text=True, capture_output=True
    )
    if r2.returncode != 0:
        logger.warning(f"Failed to patch master.cf: {r2.stderr.strip()}")
    else:
        logger.info("Postfix master.cf: submission ports 587/465 enabled")


def configure_postfix() -> None:
    """Apply virtual mailbox settings to Postfix main.cf via postconf."""
    for key, val in POSTFIX_PARAMS.items():
        _run(["sudo", "postconf", "-e", f"{key} = {val}"])
    _enable_submission_ports()
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
