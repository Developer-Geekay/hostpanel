import logging
import subprocess
from typing import Optional

from modules.users.exceptions import FtpOperationFailed

_log = logging.getLogger(__name__)

PURE_PW     = "/opt/hostpanel/plugins/ftp/pure-pw"
PASSWD_FILE = "/opt/hostpanel/plugins/ftp/etc/pureftpd.passwd"
PDB_FILE    = "/opt/hostpanel/plugins/ftp/etc/pureftpd.pdb"


def _run_ftp(cmd: list[str]) -> None:
    try:
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    except subprocess.CalledProcessError as e:
        raise FtpOperationFailed(e.stderr.strip() or "FTP command failed")


def _rebuild_db() -> None:
    try:
        subprocess.run(
            ["sudo", PURE_PW, "mkdb", PDB_FILE, "-f", PASSWD_FILE],
            check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
    except subprocess.CalledProcessError as e:
        _log.error("pure-pw mkdb failed: %s", e.stderr)


def ftp_enabled_users() -> set[str]:
    try:
        result = subprocess.run(
            ["sudo", PURE_PW, "list", "-f", PASSWD_FILE],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        return {line.split()[0] for line in result.stdout.strip().splitlines() if line}
    except Exception:
        return set()


def enable_ftp(username: str, password: str, directory: Optional[str] = None) -> None:
    home_dir = (directory or f"/home/{username}").rstrip("/")
    if directory and not home_dir.startswith(f"/home/{username}"):
        raise FtpOperationFailed(f"FTP directory must be within /home/{username}/")
    try:
        subprocess.run(
            ["sudo", PURE_PW, "useradd", username, "-u", username, "-d", home_dir, "-f", PASSWD_FILE],
            input=f"{password}\n{password}\n",
            check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
    except subprocess.CalledProcessError as e:
        raise FtpOperationFailed(e.stderr.strip() or "Failed to enable FTP")
    _rebuild_db()


def disable_ftp(username: str) -> None:
    _run_ftp(["sudo", PURE_PW, "userdel", username, "-f", PASSWD_FILE])
    _rebuild_db()
