"""
System router — panel-level identity and reconcile operations (admin only).

- POST /cpanelapi/system/reconcile: rebuild OS state from the SQLite source of
  truth (missing tenant users, and — via packages — webroots/vhosts).
- GET  /cpanelapi/system/identity: report the process/panel service identity so
  drift is visible in the UI.
"""
import getpass

from fastapi import APIRouter, Depends

from auth import User
from deps import require_admin
from modules.audit.logger import log_action
from modules.system import reconcile as _reconcile
from modules.system.identity import panel_user

router = APIRouter(prefix="/cpanelapi/system", tags=["System"])


@router.post("/reconcile")
async def run_reconcile(current_user: User = Depends(require_admin)):
    report = await _reconcile.reconcile()
    log_action(
        current_user.username, "system.reconcile",
        detail=f"created={len(report['users_created'])} errors={len(report['errors'])}",
        status="ok" if not report["errors"] else "error",
    )
    return report


@router.get("/identity")
async def identity(current_user: User = Depends(require_admin)):
    try:
        process_user = getpass.getuser()
    except Exception:
        process_user = None
    expected = panel_user()
    return {
        "process_user": process_user,
        "panel_user": expected,
        "drift": bool(process_user and process_user != expected),
    }
