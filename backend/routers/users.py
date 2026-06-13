"""
Linux Hosting Users & FTP Management Router

Exposes CRUD endpoints for managing local Linux system hosting users (UID >= 1000) and pure-ftpd accounts.

Path Prefix: `/cpanelapi/users`
Access Control: Primarily restricted to administrator access, with user-level read permissions on their own details.

Capabilities:
- System Integration: Executes Linux commands like `useradd`, `userdel`, `chpasswd`, and `usermod` using `sudo` subprocess wrappers.
- FTP virtual users: Integrates with `pure-pw` and `pureftpd.passwd` to enable virtual FTP accounts scoped to user home directories.
- Safety Protections: Protects core system accounts (`root`, `ubuntu`, `nobody`) from listing or modifications.
- Cascade Deletion: Triggers dynamic cleanup hooks for web servers, DNS databases, databases, and FTP configs upon user deletion.

Endpoints:
- `GET `: Lists all system hosting users (UID >= 1000) and checks their FTP state (Admin-only).
- `POST `: Creates a new system user, sets passwords, and provisions optional portal credentials (Admin-only).
- `GET /{username}`: Retrieves hosting user status, home directory, and login shell.
- `GET /{username}/resources`: Calculates all provisioned resources (domains, databases, certs) linked to a user.
- `DELETE /{username}`: Performs a full cascade deletion of system users and their associated databases, FTP accounts, files, and domains (Admin-only).
- `PUT /{username}/password`: Changes the system user's login password.
- `PUT /{username}/suspend`: Disables user login shell (mapping shell to `/usr/sbin/nologin` or back to `/bin/bash`; Admin-only).
- `PUT /{username}/ftp/enable`: Enables pure-ftpd virtual account scoped to a target folder (Admin-only).
- `DELETE /{username}/ftp`: Disables virtual FTP access for the user (Admin-only).
"""
import logging
import os
import subprocess
from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException

from audit import log_action
from auth import User, get_password_hash
from deps import get_current_user, require_admin
from portal_users import PortalUser, upsert_user as upsert_portal_user, delete_portal_user

router = APIRouter(prefix="/cpanelapi/users", tags=["Users"])
logger = logging.getLogger(__name__)

PURE_PW     = "/opt/hostpanel/plugins/ftp/pure-pw"
PASSWD_FILE = "/opt/hostpanel/plugins/ftp/etc/pureftpd.passwd"
PDB_FILE    = "/opt/hostpanel/plugins/ftp/etc/pureftpd.pdb"

# Users that must never be listed or modified through the panel
PROTECTED_USERS = {"ubuntu", "root", "nobody"}


def _guard_protected(username: str):
    if username in PROTECTED_USERS:
        raise HTTPException(status_code=403, detail=f"User '{username}' is a protected system user and cannot be modified.")


class HostUser(BaseModel):
    username: str
    home_dir: str
    shell: str
    status: str
    ftp_enabled: bool = False


def run_command(command: List[str]) -> subprocess.CompletedProcess:
    """Run a shell command and raise HTTPException on failure."""
    try:
        result = subprocess.run(
            command,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        return result
    except subprocess.CalledProcessError as e:
        logger.error(f"Command failed: {' '.join(command)}")
        logger.error(f"Error output: {e.stderr}")
        raise HTTPException(status_code=500, detail=f"System error: {e.stderr.strip()}")


def get_sys_users() -> List[dict]:
    """Parse /etc/passwd to find hosting users (UID >= 1000)."""
    users = []
    with open('/etc/passwd', 'r') as f:
        for line in f:
            parts = line.strip().split(':')
            if len(parts) >= 7:
                username, _, uid, gid, info, home, shell = parts
                if int(uid) >= 1000 and username not in PROTECTED_USERS:
                    status = "suspended" if shell in ['/bin/false', '/usr/sbin/nologin'] else "active"
                    users.append({
                        "username": username,
                        "home_dir": home,
                        "shell": shell,
                        "status": status
                    })
    return users


def _ftp_enabled_users() -> set:
    """Returns a set of usernames that have FTP virtual accounts."""
    try:
        result = subprocess.run(
            ["sudo", PURE_PW, "list", "-f", PASSWD_FILE],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
        )
        return {line.split()[0] for line in result.stdout.strip().splitlines() if line}
    except Exception:
        return set()


def _rebuild_ftp_db():
    try:
        subprocess.run(
            ["sudo", PURE_PW, "mkdb", PDB_FILE, "-f", PASSWD_FILE],
            check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
    except subprocess.CalledProcessError as e:
        logger.error(f"pure-pw mkdb failed: {e.stderr}")


@router.get("", response_model=List[HostUser])
async def list_users(current_user: User = Depends(require_admin)):
    """List all hosting users by reading /etc/passwd. Admin only."""
    try:
        users = get_sys_users()
        ftp_users = _ftp_enabled_users()
        for user in users:
            user['ftp_enabled'] = user['username'] in ftp_users
        return users
    except Exception as e:
        logger.error(f"Failed to read /etc/passwd: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve users.")


class UserCreateRequest(BaseModel):
    username: str
    password: Optional[str] = None
    portal_password: Optional[str] = None


def _create_linux_user(username: str, password: Optional[str] = None):
    """Create a Linux system user without HTTP context (callable from other routers)."""
    _guard_protected(username)
    logger.info(f"Creating system user: {username}")
    run_command(["sudo", "useradd", "-m", "-s", "/bin/bash", username])
    if password:
        auth_string = f"{username}:{password}\n"
        try:
            proc = subprocess.Popen(
                ['sudo', '-n', 'chpasswd'],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            out, err = proc.communicate(input=auth_string)
            if proc.returncode != 0:
                raise subprocess.CalledProcessError(proc.returncode, ['chpasswd'], output=out, stderr=err)
        except subprocess.CalledProcessError as e:
            logger.error(f"chpasswd failed for {username}: {e.stderr}")
            raise HTTPException(status_code=500, detail="User created but failed to set password")


@router.post("")
async def create_user(request: UserCreateRequest, current_user: User = Depends(require_admin)):
    """Create a new Linux hosting user. Admin only."""
    username = request.username
    _create_linux_user(username, request.password)

    if request.portal_password:
        portal_user = PortalUser(
            username=username,
            hashed_password=get_password_hash(request.portal_password),
            role="user",
            linux_user=username,
            disabled=False,
            protected=False,
        )
        upsert_portal_user(portal_user)
        logger.info(f"Portal access granted to {username}")

    log_action(current_user.username, "user.create", resource=username)
    return {"message": f"User {username} successfully created"}


@router.get("/{username}", response_model=HostUser)
async def get_user(username: str, current_user: User = Depends(get_current_user)):
    """Get a specific Linux user's details."""
    _guard_protected(username)
    if current_user.role != "admin" and current_user.linux_user != username:
        raise HTTPException(status_code=403, detail="Access denied")
    for user in get_sys_users():
        if user["username"] == username:
            return user
    raise HTTPException(status_code=404, detail="User not found")


@router.get("/{username}/resources")
async def get_user_resources(username: str, current_user: User = Depends(require_admin)):
    """Return resources associated with a user (used by the delete confirmation dialog)."""
    _guard_protected(username)
    from .databases import _load_store as _load_databases
    from domain_registry import _load_domains

    LETSENCRYPT_DIR = "/etc/letsencrypt/live"
    domain_names = [d["domain_name"] for d in _load_domains() if d.get("username") == username]
    ssl_certs = [d for d in domain_names if os.path.exists(f"{LETSENCRYPT_DIR}/{d}")]
    databases = [r["name"] for r in _load_databases() if r.get("owner") == username]
    ftp_account = username in _ftp_enabled_users()

    return {
        "username": username,
        "domains": domain_names,
        "ssl_certs": ssl_certs,
        "databases": databases,
        "ftp_account": ftp_account,
    }


@router.delete("/{username}")
async def delete_user(username: str, remove_home: bool = True, current_user: User = Depends(require_admin)):
    """Delete a user and all associated resources (domains, SSL, FTP, databases). Admin only."""
    _guard_protected(username)
    logger.info(f"Deleting system user: {username} with full cascade")

    from .databases import _load_store as _load_databases, _save_store as _save_databases, _mysql
    from hooks import call_hooks

    # 1. Plugin hooks clean up nginx vhosts, SSL certs, DNS zones, domains.json (best effort)
    await call_hooks("hostpanel.hooks.user_delete", username=username)

    # 2. Delete FTP account (best effort — FTP lives in this module)
    try:
        subprocess.run(
            ["sudo", PURE_PW, "userdel", username, "-f", PASSWD_FILE],
            check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
        )
        _rebuild_ftp_db()
        logger.info(f"FTP account deleted for {username}")
    except Exception as e:
        logger.warning(f"Could not delete FTP account for {username}: {e}")

    # 3. Delete databases (best effort)
    db_records = _load_databases()
    user_dbs = [r for r in db_records if r.get("owner") == username]
    for db_rec in user_dbs:
        try:
            _mysql(f"DROP DATABASE IF EXISTS `{db_rec['name']}`;")
            _mysql(f"DROP USER IF EXISTS '{db_rec['db_user']}'@'localhost';")
            logger.info(f"Database {db_rec['name']} deleted")
        except Exception as e:
            logger.warning(f"Could not delete database {db_rec['name']}: {e}")
    if user_dbs:
        try: _mysql("FLUSH PRIVILEGES;")
        except: pass
    _save_databases([r for r in db_records if r.get("owner") != username])

    # 4. Delete system user
    command = ["sudo", "userdel", "-r", username] if remove_home else ["sudo", "userdel", username]
    run_command(command)

    try:
        delete_portal_user(username)
    except ValueError:
        pass

    log_action(current_user.username, "user.delete", resource=username)
    return {"message": f"User {username} and all associated resources deleted"}


class PasswordChangeRequest(BaseModel):
    new_password: str


@router.put("/{username}/password")
async def change_password(username: str, request: PasswordChangeRequest, current_user: User = Depends(get_current_user)):
    """Change a Linux user's password. Admin can change any; standard users only their own."""
    _guard_protected(username)
    if current_user.role != "admin" and current_user.linux_user != username:
        raise HTTPException(status_code=403, detail="Access denied")
    logger.info(f"Changing password for user: {username}")
    auth_string = f"{username}:{request.new_password}\n"
    try:
        proc = subprocess.Popen(
            ['sudo', 'chpasswd'],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        out, err = proc.communicate(input=auth_string)
        if proc.returncode != 0:
            raise subprocess.CalledProcessError(proc.returncode, ['chpasswd'], output=out, stderr=err)
    except subprocess.CalledProcessError as e:
        logger.error(f"chpasswd failed for {username}: {e.stderr}")
        raise HTTPException(status_code=500, detail="Failed to change password")
    log_action(current_user.username, "user.password", resource=username)
    return {"message": f"Password changed for {username}"}


@router.put("/{username}/suspend")
async def suspend_user(username: str, suspend: bool = True, current_user: User = Depends(require_admin)):
    """Suspend (usermod -L) or unsuspend (usermod -U) a user account. Admin only."""
    _guard_protected(username)
    if suspend:
        logger.info(f"Suspending system user: {username}")
        run_command(["sudo", "usermod", "-L", "-s", "/usr/sbin/nologin", username])
        log_action(current_user.username, "user.suspend", resource=username)
        return {"message": f"User {username} suspended"}
    else:
        logger.info(f"Unsuspending system user: {username}")
        run_command(["sudo", "usermod", "-U", "-s", "/bin/bash", username])
        log_action(current_user.username, "user.unsuspend", resource=username)
        return {"message": f"User {username} unsuspended"}


class FTPEnableRequest(BaseModel):
    password: str
    directory: Optional[str] = None


@router.put("/{username}/ftp/enable")
async def enable_ftp(username: str, request: FTPEnableRequest, current_user: User = Depends(require_admin)):
    """Create a pure-ftpd virtual user account for this system user. Admin only."""
    _guard_protected(username)
    try:
        subprocess.run(["id", username], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except subprocess.CalledProcessError:
        raise HTTPException(status_code=404, detail=f"System user '{username}' not found")

    if request.directory:
        home_dir = request.directory.rstrip("/")
        if not home_dir.startswith(f"/home/{username}"):
            raise HTTPException(status_code=400, detail=f"FTP directory must be within /home/{username}/")
    else:
        home_dir = f"/home/{username}"
    password_input = f"{request.password}\n{request.password}\n"
    try:
        subprocess.run(
            ["sudo", PURE_PW, "useradd", username, "-u", username, "-d", home_dir, "-f", PASSWD_FILE],
            input=password_input, check=True,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
        )
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=e.stderr.strip() or "Failed to enable FTP")
    _rebuild_ftp_db()
    logger.info(f"FTP enabled for {username}")
    log_action(current_user.username, "user.ftp_enable", resource=username)
    return {"message": f"FTP enabled for {username}"}


@router.delete("/{username}/ftp")
async def disable_ftp(username: str, current_user: User = Depends(require_admin)):
    """Remove the pure-ftpd virtual user account for this system user. Admin only."""
    _guard_protected(username)
    try:
        subprocess.run(
            ["sudo", PURE_PW, "userdel", username, "-f", PASSWD_FILE],
            check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
        )
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=e.stderr.strip() or "Failed to disable FTP")
    _rebuild_ftp_db()
    logger.info(f"FTP disabled for {username}")
    log_action(current_user.username, "user.ftp_disable", resource=username)
    return {"message": f"FTP disabled for {username}"}
