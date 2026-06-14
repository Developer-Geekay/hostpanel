from typing import List
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException

from auth import User
from deps import require_admin
from modules.audit.logger import log_action
from modules.services import systemd as svc_svc
from modules.services import journal as journal_svc
from modules.services.exceptions import ServiceNotFound, ServiceActionFailed, ServiceActionTimeout

router = APIRouter(prefix="/cpanelapi/services", tags=["Services"])


class ServiceStatus(BaseModel):
    name: str
    unit: str
    status: str
    label: str
    icon: str
    can_reload: bool


def _require_service(name: str) -> dict:
    svc = svc_svc.lookup(name)
    if not svc:
        raise HTTPException(status_code=404, detail=f"Unknown service '{name}'")
    return svc


def _handle_action(unit: str, action: str) -> None:
    try:
        svc_svc.run_action(unit, action)
    except ServiceActionTimeout as e:
        raise HTTPException(status_code=504, detail=str(e))
    except ServiceActionFailed as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("", response_model=List[ServiceStatus])
async def list_services(_: User = Depends(require_admin)):
    return [
        ServiceStatus(
            name=s["name"], unit=s["unit"], label=s["label"],
            icon=s["icon"], can_reload=s["can_reload"],
            status=svc_svc.get_status(s["unit"]),
        )
        for s in svc_svc.all_services()
    ]


@router.post("/{name}/start")
async def start_service(name: str, user: User = Depends(require_admin)):
    svc = _require_service(name)
    _handle_action(svc["unit"], "start")
    log_action(user.username, "service.start", name)
    return {"name": name, "status": svc_svc.get_status(svc["unit"])}


@router.post("/{name}/stop")
async def stop_service(name: str, user: User = Depends(require_admin)):
    svc = _require_service(name)
    _handle_action(svc["unit"], "stop")
    log_action(user.username, "service.stop", name)
    return {"name": name, "status": svc_svc.get_status(svc["unit"])}


@router.post("/{name}/restart")
async def restart_service(name: str, user: User = Depends(require_admin)):
    svc = _require_service(name)
    _handle_action(svc["unit"], "restart")
    log_action(user.username, "service.restart", name)
    return {"name": name, "status": svc_svc.get_status(svc["unit"])}


@router.post("/{name}/reload")
async def reload_service(name: str, user: User = Depends(require_admin)):
    svc = _require_service(name)
    if not svc["can_reload"]:
        raise HTTPException(status_code=400, detail=f"Service '{name}' does not support reload")
    _handle_action(svc["unit"], "reload")
    log_action(user.username, "service.reload", name)
    return {"name": name, "status": svc_svc.get_status(svc["unit"])}


@router.get("/{name}/logs")
async def get_service_logs(name: str, lines: int = 200, _: User = Depends(require_admin)):
    svc = _require_service(name)
    try:
        log_lines = journal_svc.get_logs(svc["unit"], lines)
    except ServiceActionTimeout as e:
        raise HTTPException(status_code=504, detail=str(e))
    except ServiceActionFailed as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"name": name, "unit": svc["unit"], "lines": log_lines}
