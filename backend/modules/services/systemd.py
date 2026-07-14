import os
import subprocess

from modules.services.exceptions import ServiceActionFailed, ServiceActionTimeout

BUILTIN_SERVICES: list[dict] = [
    {"name": "api",     "unit": "hostpanel-api", "label": "Panel API",    "icon": "api",  "can_reload": False},
    {"name": "dns",     "unit": "pdns",          "label": "DNS Server",   "icon": "dns",  "can_reload": False},
    {"name": "postfix", "unit": "postfix",        "label": "Mail (SMTP)",  "icon": "mail", "can_reload": True},
    {"name": "dovecot", "unit": "dovecot",        "label": "Mail (IMAP)",  "icon": "mail", "can_reload": True},
]


def parse_state(state: str) -> str:
    if state == "active":
        return "running"
    if state in ("inactive", "deactivating"):
        return "stopped"
    if state == "failed":
        return "failed"
    return state or "unknown"


def get_status(unit: str) -> str:
    try:
        result = subprocess.run(
            ["systemctl", "is-active", unit],
            capture_output=True, text=True, timeout=5,
        )
        state = result.stdout.strip()
        if state in ("active", "failed"):
            return parse_state(state)

        env = {**os.environ, "XDG_RUNTIME_DIR": f"/run/user/{os.getuid()}"}
        result_user = subprocess.run(
            ["systemctl", "--user", "is-active", unit],
            capture_output=True, text=True, timeout=5, env=env,
        )
        user_state = result_user.stdout.strip()
        if user_state:
            return parse_state(user_state)

        return parse_state(state)
    except Exception:
        return "unknown"


def run_action(unit: str, action: str) -> None:
    try:
        result = subprocess.run(
            ["sudo", "systemctl", action, unit],
            capture_output=True, text=True, timeout=15,
        )
        if result.returncode != 0:
            raise ServiceActionFailed(result.stderr.strip() or f"systemctl {action} failed")
    except subprocess.TimeoutExpired:
        raise ServiceActionTimeout(f"systemctl {action} timed out")


def all_services() -> list[dict]:
    from routers.packages import get_installed_modules
    services = list(BUILTIN_SERVICES)
    for module in get_installed_modules():
        svc = module.get("service")
        if svc:
            services.append({
                "name":        svc["name"],
                "unit":        svc["unit"],
                "label":       svc.get("label", svc["name"].capitalize()),
                "icon":        svc.get("icon", "settings"),
                "can_reload":  svc.get("can_reload", False),
                "config_path": svc.get("config_path"),
            })
    return services


def lookup(name: str) -> dict | None:
    return next((s for s in all_services() if s["name"] == name), None)
