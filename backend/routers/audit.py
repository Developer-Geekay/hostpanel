"""
Audit Log API Router

Path Prefix: `/cpanelapi/audit`
Access Control: Admin only.

Endpoints:
- `GET /`: Returns paginated audit log entries, newest first.
- `DELETE /`: Clears all audit log entries (Admin only).
"""
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from typing import List, Optional

from deps import require_admin
from db import get_conn

router = APIRouter(prefix="/cpanelapi/audit", tags=["Audit"])


class AuditEntry(BaseModel):
    id: int
    ts: str
    actor: str
    action: str
    resource: Optional[str]
    detail: Optional[str]
    status: str


@router.get("", response_model=List[AuditEntry])
async def list_audit_log(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    _=Depends(require_admin),
):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, ts, actor, action, resource, detail, status "
            "FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?",
            (limit, offset),
        ).fetchall()
    return [dict(r) for r in rows]


@router.get("/count")
async def audit_count(_=Depends(require_admin)):
    with get_conn() as conn:
        total = conn.execute("SELECT COUNT(*) FROM audit_log").fetchone()[0]
    return {"total": total}


@router.delete("")
async def clear_audit_log(_=Depends(require_admin)):
    with get_conn() as conn:
        conn.execute("DELETE FROM audit_log")
    return {"message": "Audit log cleared"}
