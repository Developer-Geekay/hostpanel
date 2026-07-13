from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List

from auth import User
from deps import get_current_user, require_admin, assert_owner
from modules.audit.logger import log_action
from modules.ssh import keys as ssh_keys
from modules.ssh.exceptions import DuplicateKey, InvalidKeyFormat, KeyNotFound

router = APIRouter(prefix="/cpanelapi/ssh", tags=["SSH"])


class SshKey(BaseModel):
    id: str
    type: str
    fingerprint: str
    label: str
    added: str


class AddKeyRequest(BaseModel):
    public_key: str
    label: str = ""


def _check_access(linux_user: str, current_user: User) -> None:
    assert_owner(current_user, linux_user)


def _resolve_linux_user(username: str | None, current_user: User) -> str:
    lu = username or current_user.linux_user or current_user.username
    _check_access(lu, current_user)
    return lu


@router.get("/keys", response_model=List[SshKey])
async def list_ssh_keys(
    username: str | None = None,
    current_user: User = Depends(get_current_user),
):
    lu = _resolve_linux_user(username, current_user)
    return ssh_keys.list_keys(lu)


@router.post("/keys", response_model=SshKey)
async def add_ssh_key(
    body: AddKeyRequest,
    username: str | None = None,
    current_user: User = Depends(get_current_user),
):
    lu = _resolve_linux_user(username, current_user)
    try:
        key = ssh_keys.add_key(lu, body.public_key, body.label)
    except InvalidKeyFormat as e:
        raise HTTPException(status_code=422, detail=str(e))
    except DuplicateKey as e:
        raise HTTPException(status_code=409, detail=str(e))
    log_action(current_user.username, "ssh.add_key", lu, key["fingerprint"])
    return key


@router.delete("/keys/{fingerprint:path}")
async def delete_ssh_key(
    fingerprint: str,
    username: str | None = None,
    current_user: User = Depends(get_current_user),
):
    lu = _resolve_linux_user(username, current_user)
    try:
        ssh_keys.remove_key(lu, fingerprint)
    except KeyNotFound as e:
        raise HTTPException(status_code=404, detail=str(e))
    log_action(current_user.username, "ssh.remove_key", lu, fingerprint)
    return {"message": "Key removed"}


@router.put("/access")
async def toggle_ssh_access(
    username: str,
    enable: bool,
    current_user: User = Depends(require_admin),
):
    status = "enabled" if enable else "disabled"
    log_action(current_user.username, f"ssh.access_{status}", username)
    return {"message": f"SSH access {status} for {username}"}
