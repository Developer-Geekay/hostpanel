import logging
import os
import subprocess
from typing import List
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException

from deps import require_admin
from auth import User

router = APIRouter(prefix="/cpanelapi/services", tags=["Services"])
logger = logging.getLogger(__name__)

# Built-in services — always present, always shown first
BUILTIN_SERVICES = [
    {"name": "api", "unit": "hostpanel-api", "label": "Panel API",   "icon": "api",  "can_reload": False},
    {"name": "dns", "unit": "pdns",           "label": "DNS Server",  "icon": "dns",  "can_reload": False},
]


class ServiceStatus(BaseModel):
    name: str
    unit: str
    status: str  # running | stopped | failed | unknown
    label: str
    icon: str
    can_reload: bool


def _parse_state(state: str) -> str:
    if state == "active":
        return "running"
    if state in ("inactive", "deactivating"):
        return "stopped"
    if state == "failed":
        return "failed"
    return state or "unknown"


def _get_status(unit: str) -> str:
    try:
        # System-level check (no sudo needed for read-only is-active)
        result = subprocess.run(
            ["systemctl", "is-active", unit],
            capture_output=True, text=True, timeout=5
        )
        state = result.stdout.strip()
        if state in ("active", "failed"):
            return _parse_state(state)

        # Fall back to user-level service (e.g. hostpanel-api on RPi installs)
        env = {**os.environ, "XDG_RUNTIME_DIR": f"/run/user/{os.getuid()}"}
        result_user = subprocess.run(
            ["systemctl", "--user", "is-active", unit],
            capture_output=True, text=True, timeout=5, env=env
        )
        user_state = result_user.stdout.strip()
        if user_state:
            return _parse_state(user_state)

        return _parse_state(state)
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


def _all_services() -> List[dict]:
    """Returns builtin services first, then services from installed packages."""
    from routers.packages import get_installed_modules
    services = list(BUILTIN_SERVICES)
    for module in get_installed_modules():
        svc = module.get("service")
        if svc:
            services.append({
                "name": svc["name"],
                "unit": svc["unit"],
                "label": svc.get("label", svc["name"].capitalize()),
                "icon": svc.get("icon", "settings"),
                "can_reload": svc.get("can_reload", False),
            })
    return services


def _lookup(name: str) -> dict | None:
    return next((s for s in _all_services() if s["name"] == name), None)


@router.get("", response_model=List[ServiceStatus])
async def list_services(_: User = Depends(require_admin)):
    return [
        ServiceStatus(
            name=s["name"], unit=s["unit"], status=_get_status(s["unit"]),
            label=s["label"], icon=s["icon"], can_reload=s["can_reload"],
        )
        for s in _all_services()
    ]


@router.post("/{name}/start")
async def start_service(name: str, _: User = Depends(require_admin)):
    svc = _lookup(name)
    if not svc:
        raise HTTPException(status_code=404, detail=f"Unknown service '{name}'")
    _run_action(svc["unit"], "start")
    logger.info(f"Service {name} started")
    return {"name": name, "status": _get_status(svc["unit"])}


@router.post("/{name}/stop")
async def stop_service(name: str, _: User = Depends(require_admin)):
    svc = _lookup(name)
    if not svc:
        raise HTTPException(status_code=404, detail=f"Unknown service '{name}'")
    _run_action(svc["unit"], "stop")
    logger.info(f"Service {name} stopped")
    return {"name": name, "status": _get_status(svc["unit"])}


@router.post("/{name}/restart")
async def restart_service(name: str, _: User = Depends(require_admin)):
    svc = _lookup(name)
    if not svc:
        raise HTTPException(status_code=404, detail=f"Unknown service '{name}'")
    _run_action(svc["unit"], "restart")
    logger.info(f"Service {name} restarted")
    return {"name": name, "status": _get_status(svc["unit"])}


@router.post("/{name}/reload")
async def reload_service(name: str, _: User = Depends(require_admin)):
    svc = _lookup(name)
    if not svc:
        raise HTTPException(status_code=404, detail=f"Unknown service '{name}'")
    if not svc["can_reload"]:
        raise HTTPException(status_code=400, detail=f"Service '{name}' does not support reload")
    _run_action(svc["unit"], "reload")
    logger.info(f"Service {name} reloaded")
    return {"name": name, "status": _get_status(svc["unit"])}


@router.get("/{name}/logs")
async def get_service_logs(name: str, lines: int = 200, _: User = Depends(require_admin)):
    svc = _lookup(name)
    if not svc:
        raise HTTPException(status_code=404, detail=f"Unknown service '{name}'")
    unit = svc["unit"]
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
