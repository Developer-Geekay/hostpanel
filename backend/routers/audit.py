from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from typing import List, Optional

from auth import User
from deps import require_admin
from modules.audit import queries as audit_q
from modules.audit.logger import log_action

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
    return audit_q.list_entries(limit, offset)


@router.get("/count")
async def audit_count(_=Depends(require_admin)):
    return {"total": audit_q.count_entries()}


@router.delete("")
async def clear_audit_log(current_user: User = Depends(require_admin)):
    audit_q.clear_entries()
    log_action(current_user.username, "audit.clear")
    return {"message": "Audit log cleared"}
