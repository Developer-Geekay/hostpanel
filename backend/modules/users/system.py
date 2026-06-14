import logging
import subprocess
from typing import Optional

from modules.users.exceptions import ProtectedUser, UserNotFound, UserOperationFailed

_log = logging.getLogger(__name__)

PROTECTED_USERS = frozenset({"ubuntu", "root", "nobody"})


def guard_protected(username: str) -> None:
    if username in PROTECTED_USERS:
        raise ProtectedUser(f"'{username}' is a protected system user and cannot be modified.")


def _run(cmd: list[str]) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    except subprocess.CalledProcessError as e:
        raise UserOperationFailed(e.stderr.strip() or f"Command failed: {' '.join(cmd)}")


def get_sys_users() -> list[dict]:
    users = []
    with open('/etc/passwd') as f:
        for line in f:
            parts = line.strip().split(':')
            if len(parts) >= 7:
                username, _, uid, _, _, home, shell = parts
                if int(uid) >= 1000 and username not in PROTECTED_USERS:
                    status = "suspended" if shell in ('/bin/false', '/usr/sbin/nologin') else "active"
                    users.append({"username": username, "home_dir": home, "shell": shell, "status": status})
    return users


def get_user(username: str) -> dict:
    for u in get_sys_users():
        if u["username"] == username:
            return u
    raise UserNotFound(f"User '{username}' not found")


def create_linux_user(username: str, password: Optional[str] = None) -> None:
    guard_protected(username)
    _run(["sudo", "useradd", "-m", "-s", "/bin/bash", username])
    if password:
        _set_password(username, password)


def delete_linux_user(username: str, remove_home: bool = True) -> None:
    cmd = ["sudo", "userdel", "-r", username] if remove_home else ["sudo", "userdel", username]
    _run(cmd)


def change_password(username: str, new_password: str) -> None:
    _set_password(username, new_password)


def set_suspend(username: str, suspend: bool) -> None:
    if suspend:
        _run(["sudo", "usermod", "-L", "-s", "/usr/sbin/nologin", username])
    else:
        _run(["sudo", "usermod", "-U", "-s", "/bin/bash", username])


def _set_password(username: str, password: str) -> None:
    try:
        proc = subprocess.Popen(
            ['sudo', '-n', 'chpasswd'],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        _, err = proc.communicate(input=f"{username}:{password}\n")
        if proc.returncode != 0:
            raise UserOperationFailed(f"chpasswd failed: {err.strip()}")
    except UserOperationFailed:
        raise
    except Exception as e:
        raise UserOperationFailed(str(e))
