import os
from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException

from auth import User, get_password_hash
from deps import get_current_user, require_admin
from domain_registry import _load_domains
from hooks import call_hooks
from modules.audit.logger import log_action
from modules.users import system as sys_users
from modules.users import ftp as ftp_users
from modules.users.exceptions import (
    ProtectedUser, UserNotFound, UserOperationFailed, FtpOperationFailed
)
from portal_users import PortalUser, upsert_user as upsert_portal_user, delete_portal_user

router = APIRouter(prefix="/cpanelapi/users", tags=["Users"])


def _guard(username: str) -> None:
    try:
        sys_users.guard_protected(username)
    except ProtectedUser as e:
        raise HTTPException(status_code=403, detail=str(e))


def _user_err(e: Exception) -> HTTPException:
    if isinstance(e, UserNotFound):
        return HTTPException(status_code=404, detail=str(e))
    if isinstance(e, ProtectedUser):
        return HTTPException(status_code=403, detail=str(e))
    return HTTPException(status_code=500, detail=f"System error: {e}")


class UserCreateRequest(BaseModel):
    username: str
    password: Optional[str] = None
    portal_password: Optional[str] = None


class PasswordChangeRequest(BaseModel):
    new_password: str


class FTPEnableRequest(BaseModel):
    password: str
    directory: Optional[str] = None


@router.get("")
async def list_users(current_user: User = Depends(require_admin)):
    try:
        users = sys_users.get_sys_users()
        ftp_set = ftp_users.ftp_enabled_users()
        for u in users:
            u['ftp_enabled'] = u['username'] in ftp_set
        return users
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve users: {e}")


@router.post("")
async def create_user(req: UserCreateRequest, current_user: User = Depends(require_admin)):
    _guard(req.username)
    try:
        sys_users.create_linux_user(req.username, req.password)
    except (ProtectedUser, UserOperationFailed) as e:
        raise _user_err(e)

    if req.portal_password:
        upsert_portal_user(PortalUser(
            username=req.username,
            hashed_password=get_password_hash(req.portal_password),
            role="user", linux_user=req.username, disabled=False, protected=False,
        ))

    log_action(current_user.username, "user.create", req.username)
    return {"message": f"User {req.username} successfully created"}


@router.get("/{username}")
async def get_user(username: str, current_user: User = Depends(get_current_user)):
    _guard(username)
    if current_user.role != "admin" and current_user.linux_user != username:
        raise HTTPException(status_code=403, detail="Access denied")
    try:
        return sys_users.get_user(username)
    except UserNotFound as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{username}/resources")
async def get_user_resources(username: str, current_user: User = Depends(require_admin)):
    _guard(username)
    from .databases import _load_store as _load_databases
    import modules.ssl.db as ssl_db
    domain_names = [d["domain_name"] for d in _load_domains() if d.get("username") == username]
    ssl_certs = [d for d in domain_names
                 if (lambda c: c and c["status"] in ("valid", "expiring_soon"))(ssl_db.get_cert(d))]
    databases = [r["name"] for r in _load_databases() if r.get("owner") == username]
    return {
        "username": username,
        "domains": domain_names,
        "ssl_certs": ssl_certs,
        "databases": databases,
        "ftp_account": username in ftp_users.ftp_enabled_users(),
    }


@router.delete("/{username}")
async def delete_user(username: str, remove_home: bool = True, current_user: User = Depends(require_admin)):
    _guard(username)
    from .databases import _load_store as _load_databases, _save_store as _save_databases, _mysql
    import subprocess

    await call_hooks("hostpanel.hooks.user_delete", username=username)

    try:
        ftp_users.disable_ftp(username)
    except Exception:
        pass

    db_records = _load_databases()
    user_dbs = [r for r in db_records if r.get("owner") == username]
    for db_rec in user_dbs:
        try:
            _mysql(f"DROP DATABASE IF EXISTS `{db_rec['name']}`;")
            _mysql(f"DROP USER IF EXISTS '{db_rec['db_user']}'@'localhost';")
        except Exception:
            pass
    if user_dbs:
        try: _mysql("FLUSH PRIVILEGES;")
        except: pass
    _save_databases([r for r in db_records if r.get("owner") != username])

    try:
        sys_users.delete_linux_user(username, remove_home)
    except UserOperationFailed as e:
        raise HTTPException(status_code=500, detail=str(e))

    try:
        delete_portal_user(username)
    except ValueError:
        pass

    log_action(current_user.username, "user.delete", username)
    return {"message": f"User {username} and all associated resources deleted"}


@router.put("/{username}/password")
async def change_password(username: str, req: PasswordChangeRequest, current_user: User = Depends(get_current_user)):
    _guard(username)
    if current_user.role != "admin" and current_user.linux_user != username:
        raise HTTPException(status_code=403, detail="Access denied")
    try:
        sys_users.change_password(username, req.new_password)
    except UserOperationFailed as e:
        raise HTTPException(status_code=500, detail=str(e))
    log_action(current_user.username, "user.password", username)
    return {"message": f"Password changed for {username}"}


@router.put("/{username}/suspend")
async def suspend_user(username: str, suspend: bool = True, current_user: User = Depends(require_admin)):
    _guard(username)
    try:
        sys_users.set_suspend(username, suspend)
    except UserOperationFailed as e:
        raise HTTPException(status_code=500, detail=str(e))
    action = "user.suspend" if suspend else "user.unsuspend"
    log_action(current_user.username, action, username)
    return {"message": f"User {username} {'suspended' if suspend else 'unsuspended'}"}


@router.put("/{username}/ftp/enable")
async def enable_ftp(username: str, req: FTPEnableRequest, current_user: User = Depends(require_admin)):
    _guard(username)
    try:
        ftp_users.enable_ftp(username, req.password, req.directory)
    except FtpOperationFailed as e:
        raise HTTPException(status_code=500, detail=str(e))
    log_action(current_user.username, "user.ftp_enable", username)
    return {"message": f"FTP enabled for {username}"}


@router.delete("/{username}/ftp")
async def disable_ftp(username: str, current_user: User = Depends(require_admin)):
    _guard(username)
    try:
        ftp_users.disable_ftp(username)
    except FtpOperationFailed as e:
        raise HTTPException(status_code=500, detail=str(e))
    log_action(current_user.username, "user.ftp_disable", username)
    return {"message": f"FTP disabled for {username}"}


# Exported for use by other routers (e.g. old ssl router)
create_linux_user = sys_users.create_linux_user
