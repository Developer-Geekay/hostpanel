import logging
import re
import subprocess

logger = logging.getLogger(__name__)

MAIL_DIR      = "/opt/hostpanel/mail"
DKIM_DIR      = f"{MAIL_DIR}/dkim"
KEYTABLE      = f"{DKIM_DIR}/keytable"
SIGNINGTABLE  = f"{DKIM_DIR}/signingtable"
TRUSTEDHOSTS  = f"{DKIM_DIR}/trustedhosts"
OPENDKIM_CONF = "/etc/opendkim.conf"
SELECTOR      = "mail"

_OPENDKIM_CONF = f"""\
## Managed by HostPanel -- do not edit manually
Syslog              yes
SyslogSuccess       yes
UMask               007
Mode                sv
PidFile             /run/opendkim/opendkim.pid
UserID              opendkim:opendkim
Socket              inet:12301@127.0.0.1
Canonicalization    relaxed/simple
OversignHeaders     From
KeyTable            {KEYTABLE}
SigningTable        refile:{SIGNINGTABLE}
InternalHosts       {TRUSTEDHOSTS}
"""


def _tee(path: str, content: str) -> None:
    r = subprocess.run(["sudo", "tee", path], input=content, text=True, capture_output=True)
    if r.returncode != 0:
        raise OSError(f"tee {path} failed: {r.stderr.strip()}")


def _run(cmd: list[str]) -> None:
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        logger.warning(f"{' '.join(cmd)} failed: {r.stderr.strip()}")


def configure_opendkim() -> None:
    """One-time: write OpenDKIM config and create /opt/hostpanel/mail/dkim/."""
    subprocess.run(["sudo", "mkdir", "-p", DKIM_DIR], capture_output=True)
    subprocess.run(["sudo", "chmod", "750", DKIM_DIR], capture_output=True)
    _run(["sudo", "/opt/hostpanel/bin/hp-chown", f"opendkim:{DKIM_DIR}"])
    # Ensure /run/opendkim/ exists (tmpfiles.d may not have run yet after install)
    subprocess.run(["sudo", "mkdir", "-p", "/run/opendkim"], capture_output=True)
    subprocess.run(["sudo", "chmod", "750", "/run/opendkim"], capture_output=True)
    _run(["sudo", "/opt/hostpanel/bin/hp-chown", "opendkim:/run/opendkim"])
    _tee(OPENDKIM_CONF, _OPENDKIM_CONF)
    for path in [KEYTABLE, SIGNINGTABLE]:
        _tee(path, "")
    _tee(TRUSTEDHOSTS, "127.0.0.1\n::1\nlocalhost\n")
    _run(["sudo", "chmod", "640", KEYTABLE, SIGNINGTABLE, TRUSTEDHOSTS])
    _run(["sudo", "/opt/hostpanel/bin/hp-chown", f"opendkim:{DKIM_DIR}"])
    logger.info("OpenDKIM configured")


def generate_key(domain: str) -> str:
    """Generate DKIM keypair for domain; return the DNS TXT record value."""
    domain_dir = f"{DKIM_DIR}/{domain}"
    subprocess.run(["sudo", "mkdir", "-p", domain_dir], capture_output=True)
    _run(["sudo", "/usr/sbin/opendkim-genkey", "-D", domain_dir, "-d", domain, "-s", SELECTOR])
    _run(["sudo", "chmod", "640", f"{domain_dir}/{SELECTOR}.private"])
    _run(["sudo", "/opt/hostpanel/bin/hp-chown", f"opendkim:{domain_dir}"])
    # Read the generated .txt record file
    r = subprocess.run(["sudo", "cat", f"{domain_dir}/{SELECTOR}.txt"], capture_output=True, text=True)
    return _parse_dkim_txt(r.stdout)


def _parse_dkim_txt(raw: str) -> str:
    """Join quoted strings from opendkim-genkey .txt output into a single value."""
    parts = re.findall(r'"([^"]+)"', raw)
    return "".join(parts)


def remove_key(domain: str) -> None:
    _run(["sudo", "rm", "-rf", f"{DKIM_DIR}/{domain}"])


def rebuild(domains: list[str]) -> None:
    """Rewrite KeyTable / SigningTable for all domains and restart opendkim."""
    keytable_lines, signing_lines = [], []
    for domain in domains:
        key_path = f"{DKIM_DIR}/{domain}/{SELECTOR}.private"
        keytable_lines.append(f"{SELECTOR}._domainkey.{domain} {domain}:{SELECTOR}:{key_path}")
        signing_lines.append(f"@{domain} {SELECTOR}._domainkey.{domain}")
    _tee(KEYTABLE, "\n".join(keytable_lines) + "\n" if keytable_lines else "")
    _tee(SIGNINGTABLE, "\n".join(signing_lines) + "\n" if signing_lines else "")
    _run(["sudo", "systemctl", "restart", "opendkim"])
    logger.info(f"OpenDKIM rebuilt for {len(domains)} domain(s)")
