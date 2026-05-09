import logging
import subprocess
from typing import List
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException

from deps import require_admin
from auth import User

router = APIRouter(prefix="/cpanelapi/services", tags=["Services"])
logger = logging.getLogger(__name__)

MANAGED_SERVICES = {
    "nginx":  "hostpanel-nginx",
    "api":    "hostpanel-api",
    "dns":    "pdns",
    "ftp":    "hostpanel-ftp",
    "mysql":  "mysql",
}

NGINX_SUPPORTS_RELOAD = {"nginx"}


class ServiceStatus(BaseModel):
    name: str
    unit: str
    status: str  # running | stopped | failed | unknown


def _get_status(unit: str) -> str:
    try:
        result = subprocess.run(
            ["sudo", "systemctl", "is-active", unit],
            capture_output=True, text=True, timeout=5
        )
        state = result.stdout.strip()
        if state == "active":
            return "running"
        if state in ("inactive", "deactivating"):
            return "stopped"
        if state == "failed":
            return "failed"
        return state or "unknown"
    except Exception:
        return "unknown"


def _run_action(unit: str, action: str):
    try:
        result = subprocess.run(
            ["sudo", "systemctl", action, unit],
            capture_output=True, text=True, timeout=15
        )
        if result.returncode != 0:
            raise HTTPException(status_code=500, detail=result.stderr.strip() or f"systemctl {action} failed")
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail=f"systemctl {action} timed out")


@router.get("", response_model=List[ServiceStatus])
async def list_services(_: User = Depends(require_admin)):
    return [
        ServiceStatus(name=name, unit=unit, status=_get_status(unit))
        for name, unit in MANAGED_SERVICES.items()
    ]


@router.post("/{name}/start")
async def start_service(name: str, _: User = Depends(require_admin)):
    if name not in MANAGED_SERVICES:
        raise HTTPException(status_code=404, detail=f"Unknown service '{name}'")
    _run_action(MANAGED_SERVICES[name], "start")
    logger.info(f"Service {name} started")
    return {"name": name, "status": _get_status(MANAGED_SERVICES[name])}


@router.post("/{name}/stop")
async def stop_service(name: str, _: User = Depends(require_admin)):
    if name not in MANAGED_SERVICES:
        raise HTTPException(status_code=404, detail=f"Unknown service '{name}'")
    _run_action(MANAGED_SERVICES[name], "stop")
    logger.info(f"Service {name} stopped")
    return {"name": name, "status": _get_status(MANAGED_SERVICES[name])}


@router.post("/{name}/restart")
async def restart_service(name: str, _: User = Depends(require_admin)):
    if name not in MANAGED_SERVICES:
        raise HTTPException(status_code=404, detail=f"Unknown service '{name}'")
    _run_action(MANAGED_SERVICES[name], "restart")
    logger.info(f"Service {name} restarted")
    return {"name": name, "status": _get_status(MANAGED_SERVICES[name])}


@router.post("/{name}/reload")
async def reload_service(name: str, _: User = Depends(require_admin)):
    if name not in MANAGED_SERVICES:
        raise HTTPException(status_code=404, detail=f"Unknown service '{name}'")
    if name not in NGINX_SUPPORTS_RELOAD:
        raise HTTPException(status_code=400, detail=f"Service '{name}' does not support reload")
    _run_action(MANAGED_SERVICES[name], "reload")
    logger.info(f"Service {name} reloaded")
    return {"name": name, "status": _get_status(MANAGED_SERVICES[name])}


@router.get("/{name}/logs")
async def get_service_logs(name: str, lines: int = 200, _: User = Depends(require_admin)):
    if name not in MANAGED_SERVICES:
        raise HTTPException(status_code=404, detail=f"Unknown service '{name}'")
    unit = MANAGED_SERVICES[name]
    try:
        result = subprocess.run(
            ["sudo", "journalctl", "-u", unit, "-n", str(min(lines, 1000)),
             "--no-pager", "--output=short-iso"],
            capture_output=True, text=True, timeout=10
        )
        log_lines = result.stdout.strip().split("\n") if result.stdout.strip() else []
        return {"name": name, "unit": unit, "lines": log_lines}
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Log fetch timed out")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
