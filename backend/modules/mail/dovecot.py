import logging
import subprocess

from passlib.hash import sha512_crypt

logger = logging.getLogger(__name__)

VMAIL_USERS_FILE = "/etc/dovecot/vmail_users"
VMAIL_UID        = "5000"
VMAIL_GID        = "5000"
VMAIL_HOME_BASE  = "/var/mail/vhosts"

DOVECOT_AUTH_CONF = "/etc/dovecot/conf.d/10-auth.conf"
DOVECOT_MAIL_CONF = "/etc/dovecot/conf.d/10-mail.conf"

_AUTH_CONF_CONTENT = """\
##
## Authentication processes — managed by HostPanel
##

auth_allow_cleartext = yes
auth_mechanisms = plain login

passdb passwd-file {
  default_password_scheme = SHA512-CRYPT
  auth_username_format = %{user}
  passwd_file_path = /etc/dovecot/vmail_users
}

userdb passwd-file {
  auth_username_format = %{user}
  passwd_file_path = /etc/dovecot/vmail_users
  fields {
    uid = 5000
    gid = 5000
    home = /var/mail/vhosts/%{user|domain}/%{user|username}
  }
}
"""

_MAIL_CONF_CONTENT = """\
##
## Mailbox locations — managed by HostPanel
##

mail_driver = maildir
mail_path = /var/mail/vhosts/%{user|domain}/%{user|username}
mail_privileged_group = vmail
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


def hash_password(plain: str) -> str:
    return sha512_crypt.hash(plain)


def configure_dovecot() -> None:
    """Write HostPanel auth and mail config files for virtual users."""
    _tee(DOVECOT_AUTH_CONF, _AUTH_CONF_CONTENT)
    _tee(DOVECOT_MAIL_CONF, _MAIL_CONF_CONTENT)
    logger.info("Dovecot virtual user config applied")


def rebuild(accounts: list[dict]) -> None:
    """Rewrite /etc/dovecot/vmail_users from current account list and reload Dovecot."""
    lines = []
    for acc in accounts:
        email   = acc["email"]
        domain  = acc["domain"]
        localpart = email.split("@")[0]
        pw_hash = acc.get("passwd_hash", "")
        home    = f"{VMAIL_HOME_BASE}/{domain}/{localpart}"
        # Format: user:hash:uid:gid:gecos:home:shell:extra
        lines.append(f"{email}:{pw_hash}:{VMAIL_UID}:{VMAIL_GID}::{home}::")
    content = "\n".join(lines) + "\n" if lines else "\n"
    _tee(VMAIL_USERS_FILE, content)
    _run(["sudo", "chmod", "640", VMAIL_USERS_FILE])
    _run(["sudo", "doveadm", "reload"])
    logger.info(f"Dovecot vmail_users rebuilt: {len(accounts)} account(s)")


def dovecot_running() -> bool:
    r = subprocess.run(
        ["sudo", "systemctl", "is-active", "dovecot"],
        capture_output=True, text=True
    )
    return r.stdout.strip() == "active"
