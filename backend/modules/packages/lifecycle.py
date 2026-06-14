"""
Server restart + uninstall lifecycle hooks for packages.
"""
import asyncio
import importlib
import importlib.metadata
import logging
import os
import subprocess
import sys
import time

_log = logging.getLogger(__name__)

FRONTEND_DIR = os.environ.get("FRONTEND_DIR", "/opt/hostpanel/frontend")


def restart_server() -> None:
    _log.info("Restarting server to load new packages...")
    time.sleep(1)
    os._exit(1)


async def run_uninstall_hooks(package_name: str, force: bool = False) -> None:
    try:
        eps = importlib.metadata.entry_points()
        lifecycle_eps = eps.select(group='hostpanel.lifecycle') if hasattr(eps, 'select') else eps.get('hostpanel.lifecycle', [])
        for ep in lifecycle_eps:
            dist = ep.dist
            if not dist:
                continue
            dist_name = dist.metadata.get('Name', '')
            if (dist_name.lower().replace('_', '-') == package_name.lower().replace('_', '-') or
                    ep.name.lower() == package_name.lower()):
                hook = ep.load()
                if asyncio.iscoroutinefunction(hook):
                    await hook(force=force)
                else:
                    hook(force=force)
    except Exception as e:
        _log.error("Uninstall hook failed: %s", e)
        raise


def pip_uninstall(package_name: str) -> str:
    result = subprocess.run(
        [sys.executable, "-m", "pip", "uninstall", "-y", package_name],
        capture_output=True, text=True, check=True,
    )
    return result.stdout + "\n" + result.stderr


def pip_install(source: str) -> str:
    result = subprocess.run(
        [sys.executable, "-m", "pip", "install", "--upgrade", source],
        capture_output=True, text=True, check=True,
    )
    return result.stdout + "\n" + result.stderr
