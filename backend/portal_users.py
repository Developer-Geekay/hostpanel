import json
import logging
import os
from typing import List, Literal, Optional

from pydantic import BaseModel

from auth import get_password_hash

logger = logging.getLogger(__name__)

PORTAL_USERS_FILE = os.environ.get("PORTAL_USERS_FILE", "/opt/hostpanel/portal_users.json")


class PortalUser(BaseModel):
    username: str
    hashed_password: str
    role: Literal["admin", "user"]
    linux_user: Optional[str] = None  # None for admin portal account
    disabled: bool = False
    protected: bool = False           # True = cannot be deleted via API


# ── Persistence ────────────────────────────────────────────────────────────────

def load_users() -> List[PortalUser]:
    """Load portal users from JSON file. Returns empty list if file missing."""
    if not os.path.exists(PORTAL_USERS_FILE):
        return []
    try:
        with open(PORTAL_USERS_FILE, "r") as f:
            data = json.load(f)
        return [PortalUser(**u) for u in data]
    except Exception as e:
        logger.error(f"Failed to load portal users from {PORTAL_USERS_FILE}: {e}")
        return []


def save_users(users: List[PortalUser]):
    """Save portal users to JSON file with restricted permissions."""
    os.makedirs(os.path.dirname(PORTAL_USERS_FILE), exist_ok=True)
    with open(PORTAL_USERS_FILE, "w") as f:
        json.dump([u.model_dump() for u in users], f, indent=2)
    try:
        os.chmod(PORTAL_USERS_FILE, 0o600)
    except Exception:
        pass  # may not be root during development


# ── CRUD ───────────────────────────────────────────────────────────────────────

def get_user(username: str) -> Optional[PortalUser]:
    """Look up a portal user by username."""
    return next((u for u in load_users() if u.username == username), None)


def upsert_user(user: PortalUser):
    """Insert or update a portal user record."""
    users = load_users()
    users = [u for u in users if u.username != user.username]
    users.append(user)
    save_users(users)
    logger.info(f"Portal user upserted: {user.username} (role={user.role})")


def delete_portal_user(username: str):
    """
    Remove a portal user. Raises ValueError if user is protected.
    Silently succeeds if user does not exist.
    """
    users = load_users()
    target = next((u for u in users if u.username == username), None)
    if target is None:
        return  # no-op
    if target.protected:
        raise ValueError(f"Portal user '{username}' is protected and cannot be deleted.")
    save_users([u for u in users if u.username != username])
    logger.info(f"Portal user deleted: {username}")


# ── Bootstrap ──────────────────────────────────────────────────────────────────

def ensure_admin_exists(default_username: str, default_password: str):
    """
    Called at startup. If the admin portal user doesn't exist yet,
    create it (first-install bootstrap).
    """
    existing = get_user(default_username)
    if existing is not None:
        return  # already set up

    admin = PortalUser(
        username=default_username,
        hashed_password=get_password_hash(default_password),
        role="admin",
        linux_user=None,
        disabled=False,
        protected=True,
    )
    upsert_user(admin)
    logger.info(f"Admin portal user bootstrapped: {default_username}")
