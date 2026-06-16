import asyncio
import importlib
import importlib.metadata
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File
from pydantic import BaseModel

from auth import User
from deps import require_admin
from modules.audit.logger import log_action
from modules.packages import installer, lifecycle
from modules.packages.registry import load_registry, save_registry_entry, detect_source_type

CORE_VERSION = (1, 0, 0)
FRONTEND_DIR = os.environ.get("FRONTEND_DIR", "/opt/hostpanel/frontend")

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/cpanelapi/packages", tags=["Packages"])


class PackageInstallRequest(BaseModel):
    package_source: str

class PackageUninstallRequest(BaseModel):
    package_name: str
    force: bool = False

class PackageRegistryRequest(BaseModel):
    package_name: str
    source: str | None = None
    source_type: str

class PackageUpdateRequest(BaseModel):
    package_name: str
    source: str


def _get_installed_modules() -> list[dict]:
    modules = []
    try:
        eps = importlib.metadata.entry_points()
        hostpanel_eps = eps.select(group='hostpanel.modules') if hasattr(eps, 'select') else eps.get('hostpanel.modules', [])
        for ep in hostpanel_eps:
            dist = ep.dist
            if not dist:
                continue
            try:
                plugin_module = ep.load()
                manifest = getattr(plugin_module, 'PLUGIN_MANIFEST', {})
            except Exception as e:
                logger.warning(f"Could not load manifest for {ep.name}: {e}")
                manifest = {}

            if 'nav_items' in manifest:
                nav_items = manifest['nav_items']
            elif manifest.get('nav_route'):
                nav_items = [{"nav_route": manifest['nav_route'], "nav_label": manifest.get('nav_label', ''),
                               "nav_icon": manifest.get('nav_icon', ''), "nav_section": manifest.get('nav_section', ''),
                               "admin_only": manifest.get('admin_only', False)}]
            else:
                nav_items = []

            requires = manifest.get('requires_core')
            svc_raw = manifest.get('service')
            service = svc_raw if isinstance(svc_raw, dict) else ({"name": svc_raw, "unit": svc_raw} if isinstance(svc_raw, str) else None)

            modules.append({
                "name": dist.metadata.get('Name') or ep.name,
                "version": dist.version,
                "module": ep.module,
                "description": dist.metadata.get('Summary', ''),
                "nav_items": nav_items,
                "dashboard_blocks": manifest.get('dashboard_blocks', []),
                "requires_core": requires,
                "compatible": tuple(requires) <= CORE_VERSION if requires else True,
                "service": service,
                "needs_provisioning": manifest.get('needs_provisioning', False),
            })
    except Exception as e:
        logger.error(f"Error loading entry points: {e}")

    registry = load_registry()
    for mod in modules:
        entry = registry.get(mod["name"].lower().replace('_', '-'), {})
        mod["source_type"] = entry.get("source_type", "upload")
        mod["source"] = entry.get("source")
    return modules


def _manifest_repo(pkg_slug: str) -> str | None:
    try:
        importlib.invalidate_caches()
        for ep in importlib.metadata.entry_points().select(group="hostpanel.modules"):
            if ep.name == pkg_slug:
                mod = ep.load()
                return getattr(mod, "PLUGIN_MANIFEST", {}).get("repository")
    except Exception:
        pass
    return None


def _github_repo_from_url(url: str):
    try:
        from urllib.parse import urlparse
        parts = urlparse(url).path.lstrip("/").split("/")
        if urlparse(url).netloc == "github.com" and len(parts) >= 2:
            repo = parts[1].removesuffix(".git")
            return parts[0], repo
    except Exception:
        pass
    return None, None


@router.get("/installed")
async def list_installed_packages():
    return {"status": "success", "data": _get_installed_modules()}


@router.post("/registry")
async def upsert_package_registry(request: PackageRegistryRequest, current_user: User = Depends(require_admin)):
    allowed = {"github_zip", "pypi", "upload"}
    if request.source_type not in allowed:
        raise HTTPException(status_code=400, detail=f"source_type must be one of {allowed}")
    save_registry_entry(request.package_name, request.source, request.source_type)
    log_action(current_user.username, "package.registry_update", request.package_name, f"source_type={request.source_type}")
    return {"status": "success", "package_name": request.package_name}


@router.get("/check-update/{package_name}")
async def check_package_update(package_name: str, _=Depends(require_admin)):
    if not re.fullmatch(r'[A-Za-z0-9_.\-]{1,200}', package_name):
        raise HTTPException(status_code=400, detail="Invalid package name")
    from packaging.version import Version, InvalidVersion

    registry = load_registry()
    entry = registry.get(package_name, {})
    source_type = entry.get("source_type", "upload")
    source = entry.get("source")

    if source_type == "upload" or not source:
        return {"checkable": False, "reason": "installed from local file — link a source URL to enable update checks"}

    try:
        current_version = importlib.metadata.version(package_name)
    except importlib.metadata.PackageNotFoundError:
        return {"checkable": False, "reason": "package not found in pip metadata"}

    if source_type == "github_zip":
        owner, repo = _github_repo_from_url(source)
        if not owner:
            return {"checkable": True, "has_update": False, "error": "could not parse GitHub repo from stored URL"}
        api_url = f"https://api.github.com/repos/{owner}/{repo}/releases?per_page=50"
        def _fetch():
            req = urllib.request.Request(api_url, headers={"Accept": "application/vnd.github+json", "User-Agent": "hostpanel"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                return json.loads(resp.read())
        try:
            releases = await asyncio.to_thread(_fetch)
        except Exception as e:
            return {"checkable": True, "has_update": False, "current_version": current_version, "error": str(e)}

        slug = package_name.replace("hostpanel-", "")
        available = []
        for rel in releases:
            if rel.get("draft") or rel.get("prerelease"):
                continue
            tag = rel.get("tag_name", "").lstrip("v")
            try:
                newer = Version(tag) > Version(current_version)
            except InvalidVersion:
                newer = tag != current_version
            if not newer:
                continue
            assets = rel.get("assets", [])
            zip_asset = next(
                (a for a in assets if a.get("name", "").startswith(f"hostpanel-{slug}-") and a.get("name", "").endswith(".zip")),
                next((a for a in assets if a.get("name", "").endswith(".zip")), None),
            )
            available.append({"tag": rel.get("tag_name"), "version": tag,
                              "download_url": zip_asset["browser_download_url"] if zip_asset else None,
                              "release_notes": (rel.get("body") or "")[:300],
                              "published_at": rel.get("published_at", "")})
        try:
            available.sort(key=lambda v: Version(v["version"]), reverse=True)
        except Exception:
            pass
        latest = available[0] if available else None
        return {"checkable": True, "current_version": current_version,
                "latest_version": latest["version"] if latest else current_version,
                "has_update": bool(available), "download_url": latest["download_url"] if latest else None,
                "tag": latest["tag"] if latest else None,
                "release_notes": latest["release_notes"] if latest else "",
                "available_versions": available, "error": None}

    if source_type == "pypi":
        def _fetch_pypi():
            req = urllib.request.Request(f"https://pypi.org/pypi/{package_name}/json", headers={"User-Agent": "hostpanel"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                return json.loads(resp.read())
        try:
            data = await asyncio.to_thread(_fetch_pypi)
            latest_version = data["info"]["version"]
        except Exception as e:
            return {"checkable": True, "has_update": False, "current_version": current_version, "error": str(e)}
        try:
            has_update = Version(latest_version) > Version(current_version)
        except InvalidVersion:
            has_update = latest_version != current_version
        return {"checkable": True, "current_version": current_version, "latest_version": latest_version,
                "has_update": has_update, "download_url": None, "tag": f"v{latest_version}", "release_notes": "", "error": None}

    return {"checkable": False, "reason": f"unknown source_type: {source_type}"}


@router.post("/update")
async def update_package(request: PackageUpdateRequest, background_tasks: BackgroundTasks, current_user: User = Depends(require_admin)):
    source = request.source.strip()
    if source.lower().endswith(".zip"):
        from urllib.parse import urlparse as _up
        if _up(source).scheme != "https":
            raise HTTPException(status_code=400, detail="Update source URL must use https://")
        tmp_dir = tempfile.mkdtemp(prefix="hpkg_update_")
        filename = source.rstrip("/").split("/")[-1]
        file_path = os.path.join(tmp_dir, filename)
        try:
            await asyncio.to_thread(urllib.request.urlretrieve, source, file_path)
            logs = await installer.process_zip(file_path, filename, is_update=True)
            entry = load_registry().get(request.package_name, {})
            save_registry_entry(request.package_name, source, entry.get("source_type", "github_zip"), is_update=True)
            background_tasks.add_task(lifecycle.restart_server)
            log_action(current_user.username, "package.update", request.package_name, f"source={filename}")
            return {"status": "success", "message": f"Updated {filename}. Server will restart shortly.", "logs": "\n".join(logs)}
        except HTTPException:
            raise
        except Exception as e:
            log_action(current_user.username, "package.update", request.package_name, str(e), status="error")
            raise HTTPException(status_code=500, detail=f"Update failed: {e}")
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    _is_url = source.startswith("http://") or source.startswith("https://") or source.startswith("git+")
    if _is_url and not (source.startswith("https://") or source.startswith("git+https://")):
        raise HTTPException(status_code=400, detail="pip source URL must use https://")
    if not _is_url and not re.fullmatch(r'[A-Za-z0-9_.\-\[\]@/!=~<>]{1,500}', source):
        raise HTTPException(status_code=400, detail="Invalid pip package source")
    try:
        logs = await asyncio.to_thread(lifecycle.pip_install, source)
        pkg_slug = request.package_name.split("-")[1] if request.package_name.count("-") >= 1 else request.package_name
        fe_logs: list[str] = []
        installer.deploy_frontend_from_dist(request.package_name, pkg_slug, fe_logs)
        save_registry_entry(request.package_name, source, detect_source_type(source), is_update=True)
        background_tasks.add_task(lifecycle.restart_server)
        log_action(current_user.username, "package.update", request.package_name, f"source={source}")
        return {"status": "success", "message": f"Updated {source}. Server will restart shortly.", "logs": logs + "\n" + "\n".join(fe_logs)}
    except subprocess.CalledProcessError as e:
        log_action(current_user.username, "package.update", request.package_name, e.stderr, status="error")
        raise HTTPException(status_code=500, detail=f"Update failed: {e.stderr}")


@router.post("/update/upload")
async def update_package_upload(background_tasks: BackgroundTasks, current_user: User = Depends(require_admin),
                                 package_name: str = "", file: UploadFile = File(...)):
    if not file.filename.endswith(".zip") and not file.filename.endswith(".tar.gz"):
        raise HTTPException(status_code=400, detail="Only .zip or .tar.gz files are allowed.")
    if not package_name:
        package_name = file.filename.rsplit('-', 1)[0].lower() if file.filename.count('-') >= 2 else file.filename.split('.')[0]
    if not re.fullmatch(r'[A-Za-z0-9_.\-]{1,200}', package_name):
        raise HTTPException(status_code=400, detail="Invalid package name")
    from packaging.version import Version, InvalidVersion
    try:
        pre_version = importlib.metadata.version(package_name)
    except importlib.metadata.PackageNotFoundError:
        pre_version = "0.0.0"

    upload_dir = tempfile.mkdtemp(prefix="hpkg_upd_")
    safe_filename = os.path.basename((file.filename or "").replace("\\", "/"))
    if not safe_filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    file_path = os.path.join(upload_dir, safe_filename)
    try:
        def _write():
            with open(file_path, "wb") as buf:
                shutil.copyfileobj(file.file, buf)
        await asyncio.to_thread(_write)
        logs = await installer.process_zip(file_path, safe_filename, is_update=True)
        importlib.invalidate_caches()
        try:
            new_version = importlib.metadata.version(package_name)
        except importlib.metadata.PackageNotFoundError:
            new_version = pre_version
        try:
            is_upgrade = Version(new_version) > Version(pre_version)
        except InvalidVersion:
            is_upgrade = new_version != pre_version
        pkg_slug = package_name.split("-")[1] if package_name.count("-") >= 1 else package_name
        save_registry_entry(package_name, _manifest_repo(pkg_slug), "github_zip" if _manifest_repo(pkg_slug) else "upload", is_update=True)
        background_tasks.add_task(lifecycle.restart_server)
        log_action(current_user.username, "package.update", package_name, f"{pre_version} → {new_version}")
        return {"status": "success", "previous_version": pre_version, "new_version": new_version,
                "is_upgrade": is_upgrade, "message": f"Updated {safe_filename}. Server will restart shortly.",
                "logs": "\n".join(logs)}
    except HTTPException:
        raise
    finally:
        shutil.rmtree(upload_dir, ignore_errors=True)


@router.post("/install")
async def install_package(request: PackageInstallRequest, background_tasks: BackgroundTasks, current_user: User = Depends(require_admin)):
    source = request.package_source.strip()
    if source.lower().endswith(".zip"):
        filename = source.rstrip("/").split("/")[-1]
        tmp_dir = tempfile.mkdtemp(prefix="hpkg_")
        file_path = os.path.join(tmp_dir, filename)
        try:
            await asyncio.to_thread(urllib.request.urlretrieve, source, file_path)
            logs = await installer.process_zip(file_path, filename)
            background_tasks.add_task(lifecycle.restart_server)
            pkg_name = filename.rsplit('-', 1)[0].lower() if filename.count('-') >= 2 else filename.split('.')[0]
            save_registry_entry(pkg_name, source, "github_zip")
            log_action(current_user.username, "package.install", pkg_name, f"source={filename}")
            return {"status": "success", "message": f"Successfully installed {filename}. Server will restart shortly.", "logs": "\n".join(logs)}
        except HTTPException:
            raise
        except Exception as e:
            log_action(current_user.username, "package.install", source, str(e), status="error")
            raise HTTPException(status_code=500, detail=f"Installation failed: {e}")
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    try:
        logs = await asyncio.to_thread(lifecycle.pip_install, source)
        pkg_name = re.split(r'[><=!~;@\s]', source)[0].strip()
        pkg_slug = pkg_name.split("-")[1] if pkg_name.count("-") >= 1 else pkg_name
        fe_logs: list[str] = []
        installer.deploy_frontend_from_dist(pkg_name, pkg_slug, fe_logs)
        save_registry_entry(pkg_name, source, detect_source_type(source))
        background_tasks.add_task(lifecycle.restart_server)
        log_action(current_user.username, "package.install", pkg_name, f"source={source}")
        return {"status": "success", "message": f"Successfully installed {source}. Server will restart shortly.", "logs": logs + "\n" + "\n".join(fe_logs)}
    except subprocess.CalledProcessError as e:
        log_action(current_user.username, "package.install", source, e.stderr, status="error")
        raise HTTPException(status_code=500, detail=f"Installation failed: {e.stderr}")


@router.post("/upload")
async def upload_package(background_tasks: BackgroundTasks, current_user: User = Depends(require_admin), file: UploadFile = File(...)):
    if not file.filename.endswith(".zip") and not file.filename.endswith(".tar.gz"):
        raise HTTPException(status_code=400, detail="Only .zip or .tar.gz files are allowed.")
    upload_dir = tempfile.mkdtemp(prefix="hpkg_upload_")
    file_path = os.path.join(upload_dir, file.filename)
    try:
        with open(file_path, "wb") as buf:
            shutil.copyfileobj(file.file, buf)
        logs = await installer.process_zip(file_path, file.filename)
        background_tasks.add_task(lifecycle.restart_server)
        pkg_name = file.filename.rsplit('-', 1)[0].lower() if file.filename.count('-') >= 2 else file.filename.split('.')[0]
        pkg_slug = pkg_name.split("-")[1] if pkg_name.count("-") >= 1 else pkg_name
        save_registry_entry(pkg_name, _manifest_repo(pkg_slug), "github_zip" if _manifest_repo(pkg_slug) else "upload")
        log_action(current_user.username, "package.install", pkg_name, f"upload={file.filename}")
        return {"status": "success", "message": f"Successfully installed {file.filename}. Server will restart shortly.", "logs": "\n".join(logs)}
    except HTTPException:
        raise
    finally:
        shutil.rmtree(upload_dir, ignore_errors=True)


@router.post("/uninstall")
async def uninstall_package(request: PackageUninstallRequest, background_tasks: BackgroundTasks, current_user: User = Depends(require_admin)):
    try:
        await lifecycle.run_uninstall_hooks(request.package_name, request.force)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Uninstall hook failed: {e}")
    try:
        logs = lifecycle.pip_uninstall(request.package_name)
        pkg_slug = request.package_name.split("-")[1] if request.package_name.count("-") >= 1 else request.package_name
        lifecycle.remove_frontend_bundle(pkg_slug)
        background_tasks.add_task(lifecycle.restart_server)
        log_action(current_user.username, "package.uninstall", request.package_name)
        return {"status": "success", "message": f"Successfully uninstalled {request.package_name}. Server will restart shortly.", "logs": logs}
    except subprocess.CalledProcessError as e:
        log_action(current_user.username, "package.uninstall", request.package_name, e.stderr, status="error")
        raise HTTPException(status_code=500, detail=f"Uninstallation failed: {e.stderr}")


# Public alias — consumed by modules/services/systemd.py
get_installed_modules = _get_installed_modules
