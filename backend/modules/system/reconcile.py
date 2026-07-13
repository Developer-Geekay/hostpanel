"""
Rebuild OS state from the SQLite source of truth.

Every provisioning step is recorded in the DB before the OS is touched. If a step
was missed, or a resource drifted, reconcile() re-asserts it idempotently — the
"redo from stored info" guarantee. Safe to re-run; never destructive.

Core reconcile owns the Linux-user layer (users referenced by domains and by
tenant portal logins). Packages rebuild their own state (e.g. nginx webroots and
vhosts) by registering a `hostpanel.hooks.reconcile` handler.
"""
import logging

from db import get_conn
from hooks import call_hooks
from modules.users import system as sys_users
from modules.system.identity import valid_linux_user

_log = logging.getLogger(__name__)


def _existing_users() -> set:
    return {u["username"] for u in sys_users.get_sys_users()}


async def reconcile() -> dict:
    """Re-assert every Linux user the DB expects, then let packages rebuild.

    Returns a report of what was created/found/failed.
    """
    report = {"users_created": [], "users_present": [], "errors": []}
    existing = _existing_users()

    wanted = set()
    with get_conn() as conn:
        for row in conn.execute(
            "SELECT DISTINCT username FROM domains WHERE username IS NOT NULL AND username != ''"
        ):
            wanted.add(row["username"])
        for row in conn.execute(
            "SELECT DISTINCT linux_user FROM portal_users WHERE linux_user IS NOT NULL AND linux_user != ''"
        ):
            wanted.add(row["linux_user"])

    for name in sorted(wanted):
        if not valid_linux_user(name):
            report["errors"].append(f"invalid username in DB: {name!r}")
            continue
        if name in existing:
            report["users_present"].append(name)
            continue
        try:
            sys_users.create_linux_user(name)
            report["users_created"].append(name)
            _log.info("reconcile: created missing Linux user '%s'", name)
        except Exception as e:  # noqa: BLE001 — collect, don't abort the whole run
            report["errors"].append(f"{name}: {e}")
            _log.warning("reconcile: failed to create user '%s': %s", name, e)

    # Packages rebuild their own OS state (nginx webroots/vhosts, etc.) from the DB.
    await call_hooks("hostpanel.hooks.reconcile", report=report)
    return report
