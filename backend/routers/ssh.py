"""
SSH Credentials & Shell Access API Router

Exposes endpoints for editing SSH public keys and managing secure shell permissions.

Path Prefix: `/cpanelapi/ssh`
Access Control: Injected current user dependency (standard users are scoped to their own keys).

Endpoints:
- `GET /keys`: Lists SSH public keys registered for a system user (Mock).
- `POST /keys`: Adds a new SSH public key to the user's `authorized_keys` file (Mock).
- `DELETE /keys/{key_id}`: Removes an authorized public key by its ID (Mock).
- `PUT /access`: Enables/disables system shell access for a user (Admin-only; Mock).
"""
import logging
from fastapi import APIRouter, Depends, HTTPException

from deps import get_current_user, require_admin
from auth import User

router = APIRouter(prefix="/cpanelapi/ssh", tags=["SSH"])
logger = logging.getLogger(__name__)


def _check_ssh_access(username: str, current_user: User):
    if current_user.role != "admin" and current_user.linux_user != username:
        raise HTTPException(status_code=403, detail="Access denied")


@router.get("/keys")
async def list_ssh_keys(username: str, current_user: User = Depends(get_current_user)):
    """List authorized keys for a user."""
    _check_ssh_access(username, current_user)
    return {"keys": []}

@router.post("/keys")
async def add_ssh_key(username: str, key: str, current_user: User = Depends(get_current_user)):
    """Add a new SSH public key string to user's authorized_keys."""
    _check_ssh_access(username, current_user)
    logger.info(f"Mock adding SSH key for user {username}")
    return {"message": f"SSH key added for {username}"}

@router.delete("/keys/{key_id}")
async def delete_ssh_key(key_id: str, current_user: User = Depends(get_current_user)):
    """Remove a specific key."""
    return {"message": f"SSH key {key_id} deleted"}

@router.put("/access")
async def toggle_ssh_access(username: str, enable: bool, current_user: User = Depends(require_admin)):
    """Toggle shell access for user. Admin only."""
    access_status = "enabled" if enable else "disabled"
    logger.info(f"Mock toggling SSH access for {username} to {access_status}")
    return {"message": f"SSH access {access_status} for {username}"}
