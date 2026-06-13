"""
Portal User Credential Persistence & CRUD Controls

Manages credentials and roles of panel portal users (separate from Linux hosting users).
Backed by SQLite via db.py — previously used portal_users.json (migrated automatically).
"""
import logging
import os
from typing import List, Literal, Optional

from pydantic import BaseModel

from auth import get_password_hash
from db import get_conn

logger = logging.getLogger(__name__)

# Kept so db.py migration path can read it at startup
PORTAL_USERS_FILE = os.environ.get("PORTAL_USERS_FILE", "/opt/hostpanel/portal_users.json")


class PortalUser(BaseModel):
    username: str
    hashed_password: str
    role: Literal["admin", "user"]
    linux_user: Optional[str] = None
    disabled: bool = False
    protected: bool = False


# ── CRUD ───────────────────────────────────────────────────────────────────────

def load_users() -> List[PortalUser]:
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM portal_users").fetchall()
    return [_row_to_user(r) for r in rows]


def save_users(users: List[PortalUser]):
    """Replace all portal users atomically (used by bulk operations)."""
    with get_conn() as conn:
        conn.execute("DELETE FROM portal_users")
        for u in users:
            conn.execute(
                "INSERT INTO portal_users VALUES (?,?,?,?,?,?)",
                (u.username, u.hashed_password, u.role, u.linux_user,
                 int(u.disabled), int(u.protected)),
            )


def get_user(username: str) -> Optional[PortalUser]:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM portal_users WHERE username = ?", (username,)
        ).fetchone()
    return _row_to_user(row) if row else None


def upsert_user(user: PortalUser):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO portal_users VALUES (?,?,?,?,?,?) "
            "ON CONFLICT(username) DO UPDATE SET "
            "hashed_password=excluded.hashed_password, role=excluded.role, "
            "linux_user=excluded.linux_user, disabled=excluded.disabled, "
            "protected=excluded.protected",
            (user.username, user.hashed_password, user.role, user.linux_user,
             int(user.disabled), int(user.protected)),
        )
    logger.info(f"Portal user upserted: {user.username} (role={user.role})")


def delete_portal_user(username: str):
    user = get_user(username)
    if user is None:
        return
    if user.protected:
        raise ValueError(f"Portal user '{username}' is protected and cannot be deleted.")
    with get_conn() as conn:
        conn.execute("DELETE FROM portal_users WHERE username = ?", (username,))
    logger.info(f"Portal user deleted: {username}")


# ── Bootstrap ──────────────────────────────────────────────────────────────────

def ensure_admin_exists(default_username: str, default_password: str):
    if get_user(default_username) is not None:
        return
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


# ── Internal ───────────────────────────────────────────────────────────────────

def _row_to_user(row) -> PortalUser:
    return PortalUser(
        username=row["username"],
        hashed_password=row["hashed_password"],
        role=row["role"],
        linux_user=row["linux_user"],
        disabled=bool(row["disabled"]),
        protected=bool(row["protected"]),
    )
