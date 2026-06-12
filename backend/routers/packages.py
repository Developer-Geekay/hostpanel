"""
Dynamic Package & Plugin Installer Router

This module implements dynamic plugin management, including installation, uninstallation,
and manifest extraction for HostPanel extensions.

Path Prefix: `/cpanelapi/packages`

Capabilities:
- Dynamic discovery: Uses `importlib.metadata` entrypoints to load installed modules.
- Zip & Tar installer: Extracts zip archives, builds and installs custom configs, systemd services, sudoers configurations, and frontend SPA assets.
- PIP support: Directly installs extensions from Python Package Index (PyPI) or remote Git repositories.
- Service Auto-restart: Safely terminates the backend server (`sys.exit`) following install/uninstall, relying on the process manager (systemd or Docker daemon) to restart and apply new configurations immediately.
- Lifecycle hooks: Runs custom `.setup` (on-install) and `.lifecycle` (on-uninstall) hook actions for specific extensions.

Endpoints:
- `GET /installed`: Lists metadata (nav items, dashboard blocks, requirements, versions) of all installed plugins.
- `POST /install`: Triggers package installation from remote URL zip or PyPI/Git source name.
- `POST /upload`: Installs custom packages via uploaded zip/tar.gz files.
- `POST /uninstall`: Executes lifecycle cleanups and uninstalls packages via pip.
"""
import asyncio
import importlib.metadata
import importlib.util
import json
import logging
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File
from pydantic import BaseModel

from deps import require_admin

CORE_VERSION = (1, 0, 0)
FRONTEND_DIR = os.environ.get("FRONTEND_DIR", "/opt/hostpanel/frontend")

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/cpanelapi/packages", tags=["Packages"])

class PackageInstallRequest(BaseModel):
    package_source: str  # e.g., 'hostpanel-nginx' or 'git+https://github.com/org/repo.git'

class PackageUninstallRequest(BaseModel):
    package_name: str
    force: bool = False

class PackageRegistryRequest(BaseModel):
    package_name: str
    source: str | None = None
    source_type: str  # 'github_zip' | 'pypi' | 'upload'

class PackageUpdateRequest(BaseModel):
    package_name: str
    source: str  # remote zip URL or pip package name

def get_installed_modules():
    modules = []
    try:
        eps = importlib.metadata.entry_points()
        if hasattr(eps, 'select'):
            hostpanel_eps = eps.select(group='hostpanel.modules')
        else:
            hostpanel_eps = eps.get('hostpanel.modules', [])

        for ep in hostpanel_eps:
            dist = ep.dist
            if dist:
                try:
                    plugin_module = ep.load()
                    manifest = getattr(plugin_module, 'PLUGIN_MANIFEST', {})
                except Exception as load_err:
                    logger.warning(f"Could not load manifest for {ep.name}: {load_err}")
                    manifest = {}

                # Normalize to nav_items[] — support both flat keys (FTP) and nav_items[] (nginx)
                if 'nav_items' in manifest:
                    nav_items = manifest['nav_items']
                elif manifest.get('nav_route'):
                    nav_items = [{
                        "nav_route": manifest['nav_route'],
                        "nav_label": manifest.get('nav_label', ''),
                        "nav_icon": manifest.get('nav_icon', ''),
                        "nav_section": manifest.get('nav_section', ''),
                        "admin_only": manifest.get('admin_only', False),
                    }]
                else:
                    nav_items = []

                requires = manifest.get('requires_core')
                compatible = True
                if requires:
                    compatible = tuple(requires) <= CORE_VERSION

                # Normalize service declaration from manifest
                service = None
                svc_raw = manifest.get('service')
                if isinstance(svc_raw, dict):
                    service = svc_raw
                elif isinstance(svc_raw, str):
                    service = {"name": svc_raw, "unit": svc_raw}

                modules.append({
                    "name": dist.metadata.get('Name') or ep.name,
                    "version": dist.version,
                    "module": ep.module,
                    "description": dist.metadata.get('Summary', ''),
                    "nav_items": nav_items,
                    "dashboard_blocks": manifest.get('dashboard_blocks', []),
                    "requires_core": requires,
                    "compatible": compatible,
                    "service": service,
                    "needs_provisioning": manifest.get('needs_provisioning', False),
                })
    except Exception as e:
        logger.error(f"Error loading entry points: {e}")
    # Merge registry source info
    registry = _load_registry()
    for mod in modules:
        entry = registry.get(mod["name"].lower().replace('_', '-'), {})
        mod["source_type"] = entry.get("source_type", "upload")  # safe default
        mod["source"] = entry.get("source")
    return modules

def restart_server():
    """Hard exits the server to prevent graceful shutdown hangs,
    relying on the process manager (systemd or docker) to restart it immediately."""
    import time
    logger.info("Restarting server to load new packages...")
    time.sleep(1)  # Allow HTTP response to flush
    os._exit(1)  # Non-zero so systemd Restart=on-failure triggers

REGISTRY_PATH = os.environ.get("PACKAGES_REGISTRY", "/opt/hostpanel/packages.json")

def _load_registry() -> dict:
    if os.path.exists(REGISTRY_PATH):
        try:
            with open(REGISTRY_PATH) as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def _save_registry_entry(package_name: str, source: str | None, source_type: str, is_update: bool = False) -> None:
    package_name = package_name.lower().replace('_', '-')  # normalize to hyphenated form
    registry = _load_registry()
    now = datetime.now(timezone.utc).isoformat()
    existing = registry.get(package_name, {})
    registry[package_name] = {
        "installed_at": existing.get("installed_at", now),
        "updated_at": now if is_update else existing.get("updated_at"),
        "source": source,
        "source_type": source_type,
    }
    try:
        if _dir := os.path.dirname(REGISTRY_PATH):
            os.makedirs(_dir, exist_ok=True)
        with open(REGISTRY_PATH, "w") as f:
            json.dump(registry, f, indent=2)
    except Exception as e:
        logger.warning(f"Failed to write package registry: {e}")

def _detect_source_type(source: str) -> str:
    """Return source type based on the source string format."""
    if source.startswith("http://") or source.startswith("https://"):
        return "github_zip"
    if source.startswith("git+"):
        return "github_zip"
    return "pypi"

def _github_repo_from_url(url: str):
    """Parse owner and repo from a github.com release URL.
    Returns (owner, repo) or (None, None) on failure or non-github URL.
    """
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        if parsed.netloc != "github.com":
            return None, None
        parts = parsed.path.lstrip("/").split("/")
        if len(parts) >= 2:
            return parts[0], parts[1]
    except Exception:
        pass
    return None, None

def _manifest_repository(pkg_slug: str) -> str | None:
    """Load the installed plugin's PLUGIN_MANIFEST and return its repository URL if set."""
    try:
        import importlib as _il
        _il.invalidate_caches()
        for ep in _il.metadata.entry_points().select(group="hostpanel.modules"):
            if ep.name == pkg_slug:
                mod = ep.load()
                return getattr(mod, "PLUGIN_MANIFEST", {}).get("repository")
    except Exception:
        pass
    return None

@router.get("/installed")
async def list_installed_packages():
    return {"status": "success", "data": get_installed_modules()}

@router.post("/registry")
async def upsert_package_registry(request: PackageRegistryRequest, _=Depends(require_admin)):
    """Upsert a package's source information in the registry without reinstalling."""
    allowed = {"github_zip", "pypi", "upload"}
    if request.source_type not in allowed:
        raise HTTPException(status_code=400, detail=f"source_type must be one of {allowed}")
    _save_registry_entry(
        request.package_name,
        request.source,
        request.source_type,
        is_update=False,
    )
    return {"status": "success", "package_name": request.package_name, "source_type": request.source_type}

@router.get("/check-update/{package_name}")
async def check_package_update(package_name: str, _=Depends(require_admin)):
    """Check GitHub Releases or PyPI for a newer version of an installed package."""
    import re as _re2
    if not _re2.fullmatch(r'[A-Za-z0-9_.\-]{1,200}', package_name):
        raise HTTPException(status_code=400, detail="Invalid package name")
    from packaging.version import Version, InvalidVersion
    import urllib.request

    registry = _load_registry()
    entry = registry.get(package_name, {})
    source_type = entry.get("source_type", "upload")
    source = entry.get("source")

    if source_type == "upload" or not source:
        return {"checkable": False, "reason": "installed from local file — link a source URL to enable update checks"}

    # Get installed version
    try:
        current_version = importlib.metadata.version(package_name)
    except importlib.metadata.PackageNotFoundError:
        return {"checkable": False, "reason": "package not found in pip metadata"}

    if source_type == "github_zip":
        owner, repo = _github_repo_from_url(source)
        if not owner:
            return {"checkable": True, "has_update": False, "error": "could not parse GitHub repo from stored URL"}
        api_url = f"https://api.github.com/repos/{owner}/{repo}/releases?per_page=50"
        def _fetch_github():
            req = urllib.request.Request(api_url, headers={"Accept": "application/vnd.github+json", "User-Agent": "hostpanel"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                return json.loads(resp.read())
        try:
            releases = await asyncio.to_thread(_fetch_github)
        except Exception as e:
            return {"checkable": True, "has_update": False, "current_version": current_version, "error": str(e)}

        slug = package_name.replace("hostpanel-", "")
        available_versions = []
        for release in releases:
            if release.get("draft") or release.get("prerelease"):
                continue
            tag = release.get("tag_name", "").lstrip("v")
            try:
                is_newer = Version(tag) > Version(current_version)
            except InvalidVersion:
                is_newer = tag != current_version
            if not is_newer:
                continue
            assets = release.get("assets", [])
            zip_asset = next(
                (a for a in assets if a.get("name", "").startswith(f"hostpanel-{slug}-") and a.get("name", "").endswith(".zip")),
                next((a for a in assets if a.get("name", "").endswith(".zip")), None),
            )
            available_versions.append({
                "tag": release.get("tag_name"),
                "version": tag,
                "download_url": zip_asset["browser_download_url"] if zip_asset else None,
                "release_notes": (release.get("body") or "")[:300],
                "published_at": release.get("published_at", ""),
            })

        # Sort newest first
        try:
            available_versions.sort(key=lambda v: Version(v["version"]), reverse=True)
        except Exception:
            pass

        latest = available_versions[0] if available_versions else None
        return {
            "checkable": True,
            "current_version": current_version,
            "latest_version": latest["version"] if latest else current_version,
            "has_update": bool(available_versions),
            "download_url": latest["download_url"] if latest else None,
            "tag": latest["tag"] if latest else None,
            "release_notes": latest["release_notes"] if latest else "",
            "available_versions": available_versions,
            "error": None if (not latest or latest["download_url"]) else "no zip asset found in latest release",
        }

    if source_type == "pypi":
        def _fetch_pypi():
            req = urllib.request.Request(
                f"https://pypi.org/pypi/{package_name}/json",
                headers={"User-Agent": "hostpanel"},
            )
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

        return {
            "checkable": True,
            "current_version": current_version,
            "latest_version": latest_version,
            "has_update": has_update,
            "download_url": None,  # pip handles its own download
            "tag": f"v{latest_version}",
            "release_notes": "",
            "error": None,
        }

    return {"checkable": False, "reason": f"unknown source_type: {source_type}"}

@router.post("/update")
async def update_package(request: PackageUpdateRequest, background_tasks: BackgroundTasks, _=Depends(require_admin)):
    """Update an installed package from a remote zip URL or pip source, preserving conf/."""
    source = request.source.strip()
    logger.info(f"Updating package {request.package_name} from: {source}")

    # Basic URL safety: require https and known-safe host
    if source.lower().endswith(".zip"):
        from urllib.parse import urlparse as _up
        _parsed = _up(source)
        if _parsed.scheme != "https":
            raise HTTPException(status_code=400, detail="Update source URL must use https://")
        import urllib.request as _urlreq, tempfile
        filename = source.rstrip("/").split("/")[-1]
        tmp_dir = tempfile.mkdtemp(prefix="hpkg_update_")
        file_path = os.path.join(tmp_dir, filename)
        try:
            await asyncio.to_thread(_urlreq.urlretrieve, source, file_path)
            logs = await _process_zip(file_path, filename, is_update=True)
            registry = _load_registry()
            entry = registry.get(request.package_name, {})
            _save_registry_entry(
                request.package_name,
                source,
                entry.get("source_type", "github_zip"),
                is_update=True,
            )
            background_tasks.add_task(restart_server)
            return {
                "status": "success",
                "message": f"Updated {filename}. Server will restart shortly.",
                "logs": "\n".join(logs),
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Update failed: {e}")
            raise HTTPException(status_code=500, detail=f"Update failed: {e}")
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    # pip upgrade path — validate source is a package name or a safe URL
    import re as _re4
    _is_url = source.startswith("http://") or source.startswith("https://") or source.startswith("git+")
    if _is_url:
        if not source.startswith("https://") and not source.startswith("git+https://"):
            raise HTTPException(status_code=400, detail="pip source URL must use https://")
    elif not _re4.fullmatch(r'[A-Za-z0-9_.\-\[\]@/!=~<>]{1,500}', source):
        raise HTTPException(status_code=400, detail="Invalid pip package source")

    def _pip_upgrade():
        return subprocess.run(
            [sys.executable, "-m", "pip", "install", "--upgrade", source],
            capture_output=True, text=True, check=True,
        )
    try:
        result = await asyncio.to_thread(_pip_upgrade)
        _save_registry_entry(
            request.package_name,
            source,
            _detect_source_type(source),
            is_update=True,
        )
        background_tasks.add_task(restart_server)
        return {
            "status": "success",
            "message": f"Updated {source}. Server will restart shortly.",
            "logs": result.stdout + "\n" + result.stderr,
        }
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Update failed: {e.stderr}")

@router.post("/update/upload")
async def update_package_upload(
    background_tasks: BackgroundTasks,
    _=Depends(require_admin),
    package_name: str = "",
    file: UploadFile = File(...),
):
    """Update an installed package from an uploaded zip, preserving conf/."""
    if not file.filename.endswith(".zip") and not file.filename.endswith(".tar.gz"):
        raise HTTPException(status_code=400, detail="Only .zip or .tar.gz files are allowed.")

    # Derive package name from filename if not provided
    if not package_name:
        package_name = file.filename.rsplit('-', 1)[0].lower() if file.filename.count('-') >= 2 else file.filename.split('.')[0]

    import re as _re3
    if not _re3.fullmatch(r'[A-Za-z0-9_.\-]{1,200}', package_name):
        raise HTTPException(status_code=400, detail="Invalid package name")

    # Capture pre-update version
    try:
        pre_version = importlib.metadata.version(package_name)
    except importlib.metadata.PackageNotFoundError:
        pre_version = "0.0.0"

    import tempfile as _tempfile
    upload_dir = _tempfile.mkdtemp(prefix="hpkg_upd_")
    safe_filename = os.path.basename(file.filename.replace("\\", "/"))
    if not safe_filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    file_path = os.path.join(upload_dir, safe_filename)

    try:
        def _write_upload():
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
        await asyncio.to_thread(_write_upload)

        logs = await _process_zip(file_path, safe_filename, is_update=True)

        # Read post-update version
        importlib.invalidate_caches()
        try:
            new_version = importlib.metadata.version(package_name)
        except importlib.metadata.PackageNotFoundError:
            new_version = pre_version

        from packaging.version import Version, InvalidVersion
        try:
            is_upgrade = Version(new_version) > Version(pre_version)
        except InvalidVersion:
            is_upgrade = new_version != pre_version

        _pkg_slug_upd = package_name.split("-")[1] if package_name.count("-") >= 1 else package_name
        _repo_upd = _manifest_repository(_pkg_slug_upd)
        _save_registry_entry(package_name, _repo_upd, "github_zip" if _repo_upd else "upload", is_update=True)
        background_tasks.add_task(restart_server)

        return {
            "status": "success",
            "previous_version": pre_version,
            "new_version": new_version,
            "is_upgrade": is_upgrade,
            "message": f"Updated {safe_filename}. Server will restart shortly.",
            "logs": "\n".join(logs),
        }
    except HTTPException:
        raise
    finally:
        shutil.rmtree(upload_dir, ignore_errors=True)

@router.post("/install")
async def install_package(request: PackageInstallRequest, background_tasks: BackgroundTasks):
    source = request.package_source.strip()
    logger.info(f"Installing package: {source}")

    # ── HostPanel zip via URL (GitHub release, direct link) ───────────────────
    if source.lower().endswith(".zip"):
        import urllib.request, tempfile, zipfile as _zipfile
        filename = source.rstrip("/").split("/")[-1]
        tmp_dir  = tempfile.mkdtemp(prefix="hpkg_")
        file_path = os.path.join(tmp_dir, filename)
        try:
            urllib.request.urlretrieve(source, file_path)
            # Delegate to the shared zip processor (same logic as /upload)
            logs = await _process_zip(file_path, filename)
            background_tasks.add_task(restart_server)
            # derive pkg_name from filename for registry
            _pkg_name_for_reg = filename.rsplit('-', 1)[0].lower() if filename.count('-') >= 2 else filename.split('.')[0]
            _save_registry_entry(_pkg_name_for_reg, source, "github_zip")
            return {
                "status": "success",
                "message": f"Successfully installed {filename}. Server will restart shortly.",
                "logs": "\n".join(logs),
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Failed to install zip from URL: {e}")
            raise HTTPException(status_code=500, detail=f"Installation failed: {e}")
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    # ── pip package name / git+https URL ─────────────────────────────────────
    try:
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", "--upgrade", source],
            capture_output=True, text=True, check=True,
        )
        logger.info(f"Pip install output: {result.stdout}")
        background_tasks.add_task(restart_server)
        import re as _re
        _pip_pkg_name = _re.split(r'[><=!~;@\s]', source)[0].strip()
        _save_registry_entry(_pip_pkg_name, source, _detect_source_type(source))
        return {
            "status": "success",
            "message": f"Successfully installed {source}. Server will restart shortly to apply changes.",
            "logs": result.stdout + "\n" + result.stderr,
        }
    except subprocess.CalledProcessError as e:
        logger.error(f"Failed to install package: {e.stderr}")
        raise HTTPException(status_code=500, detail=f"Installation failed: {e.stderr}")

async def _process_zip(file_path: str, filename: str, is_update: bool = False) -> list:
    """Extract a HostPanel zip and install all its components.
    Returns a list of log strings. Raises HTTPException on hard failure."""
    import zipfile, tarfile, importlib
    logs = []

    extract_dir = file_path.replace(".zip", "").replace(".tar.gz", "") + "_extracted"
    if os.path.exists(extract_dir):
        shutil.rmtree(extract_dir)
    os.makedirs(extract_dir)

    try:
        if filename.endswith(".zip"):
            with zipfile.ZipFile(file_path, "r") as zf:
                # Normalize Windows-style backslash paths so zips built on
                # Windows (e.g. via Compress-Archive) extract correctly on Linux.
                for member in zf.infolist():
                    member.filename = member.filename.replace("\\", "/")
                    zf.extract(member, extract_dir)
        else:
            with tarfile.open(file_path, "r:gz") as tf:
                tf.extractall(extract_dir)

        # ── plugin/ → pip install ─────────────────────────────────────────────
        plugin_dir = os.path.join(extract_dir, "plugin")
        if os.path.isdir(plugin_dir):
            result = subprocess.run(
                [sys.executable, "-m", "pip", "install", plugin_dir],
                capture_output=True, text=True, check=True,
            )
            logs.append(result.stdout)
            logger.info(f"Installed plugin from {plugin_dir}")
        else:
            result = subprocess.run(
                [sys.executable, "-m", "pip", "install", file_path],
                capture_output=True, text=True, check=True,
            )
            logs.append(result.stdout)

        # Derive slug: hostpanel-nginx-1.0.0.zip → nginx
        pkg_slug = filename.split("-")[1] if filename.count("-") >= 2 else filename.split(".")[0]
        pkg_root = f"/opt/hostpanel/plugins/{pkg_slug}"

        # ── bin/ ──────────────────────────────────────────────────────────────
        bin_dir = os.path.join(extract_dir, "bin")
        if os.path.isdir(bin_dir):
            real_files = [f for f in os.listdir(bin_dir) if not f.startswith('.')]
            if real_files:
                os.makedirs(pkg_root, exist_ok=True)
                for fname in real_files:
                    src = os.path.join(bin_dir, fname)
                    dst = os.path.join(pkg_root, fname)
                    shutil.copy2(src, dst)
                    os.chmod(dst, 0o755)
                    logs.append(f"{'Updated' if is_update else 'Installed'} binary: {dst}")

        # ── conf/ ─────────────────────────────────────────────────────────────
        conf_dir = os.path.join(extract_dir, "conf")
        if os.path.isdir(conf_dir):
            real_files = [f for f in os.listdir(conf_dir) if not f.startswith('.')]
            if real_files:
                dest_conf = os.path.join(pkg_root, "conf")
                os.makedirs(dest_conf, exist_ok=True)
                for fname in real_files:
                    dst = os.path.join(dest_conf, fname)
                    if not os.path.exists(dst):
                        shutil.copy2(os.path.join(conf_dir, fname), dst)
                        logs.append(f"Installed config: {dst}")

        # ── service/ ──────────────────────────────────────────────────────────
        service_dir = os.path.join(extract_dir, "service")
        if os.path.isdir(service_dir):
            service_files = [f for f in os.listdir(service_dir) if f.endswith(".service")]
            for fname in service_files:
                src = os.path.join(service_dir, fname)
                dst = f"/etc/systemd/system/{fname}"
                content = open(src).read()
                subprocess.run(["sudo", "tee", dst], input=content, text=True, capture_output=True, check=True)
                subprocess.run(["sudo", "chmod", "644", dst], check=True)
                logs.append(f"{'Updated' if is_update else 'Installed'} service: {dst}")
            if service_files:
                subprocess.run(["sudo", "systemctl", "daemon-reload"], check=False)
                for fname in service_files:
                    subprocess.run(["sudo", "systemctl", "enable", fname[:-8]], check=False)
                    logs.append(f"Enabled service: {fname[:-8]}")

        # ── sudoers/ ──────────────────────────────────────────────────────────
        sudoers_dir = os.path.join(extract_dir, "sudoers")
        if os.path.isdir(sudoers_dir):
            for fname in os.listdir(sudoers_dir):
                if fname.startswith('.'):
                    continue
                src = os.path.join(sudoers_dir, fname)
                # Skip empty files — they pass visudo but have no rules to install
                if os.path.getsize(src) == 0:
                    continue
                dst = f"/etc/sudoers.d/{fname}"
                validate = subprocess.run(["sudo", "visudo", "-c", "-f", src], capture_output=True, text=True)
                if validate.returncode == 0:
                    content = open(src).read()
                    subprocess.run(["sudo", "tee", dst], input=content, text=True, capture_output=True, check=True)
                    subprocess.run(["sudo", "chmod", "440", dst], check=True)
                    logs.append(f"{'Updated' if is_update else 'Installed'} sudoers: {dst}")
                else:
                    logs.append(f"Warning: sudoers {fname} failed validation, skipped")

        # ── frontend/ ─────────────────────────────────────────────────────────
        frontend_src = os.path.join(extract_dir, "frontend")
        if os.path.isdir(frontend_src):
            dest_frontend = os.path.join(FRONTEND_DIR, "packages", pkg_slug)
            os.makedirs(dest_frontend, exist_ok=True)
            for fname in os.listdir(frontend_src):
                src = os.path.join(frontend_src, fname)
                dst = os.path.join(dest_frontend, fname)
                if os.path.isfile(src):
                    shutil.copy2(src, dst)
                    logs.append(f"{'Updated' if is_update else 'Installed'} frontend asset: packages/{pkg_slug}/{fname}")

        # ── lifecycle hook: on_update (falls back to on_install if not defined) ──
        importlib.invalidate_caches()
        hook_group = "hostpanel.update" if is_update else "hostpanel.setup"
        fallback_group = "hostpanel.setup" if is_update else None
        try:
            pkg_name = filename.rsplit('-', 1)[0].lower()
            hook_called = False
            for group in ([hook_group] + ([fallback_group] if fallback_group else [])):
                if hook_called:
                    break
                for ep in importlib.metadata.entry_points().select(group=group):
                    dist = ep.dist
                    if dist:
                        dist_name = (dist.metadata.get('Name') or '').lower().replace('_', '-')
                        if dist_name == pkg_name or dist_name == f"hostpanel-{pkg_slug}":
                            label = "on_update" if group == "hostpanel.update" else "on_install"
                            logger.info(f"Running {label} hook for {dist_name}")
                            hook_func = ep.load()
                            if asyncio.iscoroutinefunction(hook_func):
                                await hook_func()
                            else:
                                hook_func()
                            logs.append(f"{label} hook completed for {dist_name}")
                            hook_called = True
                            break
        except Exception as setup_err:
            logger.warning(f"lifecycle hook failed: {setup_err}")
            logs.append(f"Warning: lifecycle hook failed: {setup_err}")

        return logs

    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Installation failed: {e.stderr}")
    finally:
        if os.path.exists(extract_dir):
            shutil.rmtree(extract_dir)


@router.post("/upload")
async def upload_package(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    if not file.filename.endswith(".zip") and not file.filename.endswith(".tar.gz"):
        raise HTTPException(status_code=400, detail="Only .zip or .tar.gz files are allowed.")

    logger.info(f"Uploading package: {file.filename}")
    upload_dir = "/tmp/hostpanel_uploads"
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, file.filename)

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        logs = await _process_zip(file_path, file.filename)
        background_tasks.add_task(restart_server)
        _pkg_name_upload = file.filename.rsplit('-', 1)[0].lower() if file.filename.count('-') >= 2 else file.filename.split('.')[0]
        _pkg_slug_upload = _pkg_name_upload.split("-")[1] if _pkg_name_upload.count("-") >= 1 else _pkg_name_upload
        _repo_upload = _manifest_repository(_pkg_slug_upload)
        _save_registry_entry(_pkg_name_upload, _repo_upload, "github_zip" if _repo_upload else "upload")
        return {
            "status": "success",
            "message": f"Successfully installed {file.filename}. Server will restart shortly.",
            "logs": "\n".join(logs),
        }
    except HTTPException:
        raise
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)

@router.post("/uninstall")
async def uninstall_package(request: PackageUninstallRequest, background_tasks: BackgroundTasks):
    logger.info(f"Uninstalling package: {request.package_name} (force={request.force})")

    # 1. Look for lifecycle hooks
    try:
        eps = importlib.metadata.entry_points()
        if hasattr(eps, 'select'):
            lifecycle_eps = eps.select(group='hostpanel.lifecycle')
        else:
            lifecycle_eps = eps.get('hostpanel.lifecycle', [])

        for ep in lifecycle_eps:
            dist = ep.dist
            if dist:
                dist_name = dist.metadata.get('Name', '')
                if (dist_name.lower().replace('_', '-') == request.package_name.lower().replace('_', '-') or
                    ep.name.lower() == request.package_name.lower()):
                    # We found the hook for this package!
                    logger.info(f"Found lifecycle hook for {request.package_name}")
                    hook_func = ep.load()
                    if asyncio.iscoroutinefunction(hook_func):
                        await hook_func(force=request.force)
                    else:
                        hook_func(force=request.force)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during package uninstallation hook: {e}")
        raise HTTPException(status_code=500, detail=f"Uninstall hook failed: {e}")

    # 2. Proceed with pip uninstall
    try:
        result = subprocess.run(
            [sys.executable, "-m", "pip", "uninstall", "-y", request.package_name],
            capture_output=True,
            text=True,
            check=True
        )
        logger.info(f"Pip uninstall output: {result.stdout}")

        # Schedule restart to apply changes
        background_tasks.add_task(restart_server)

        return {
            "status": "success",
            "message": f"Successfully uninstalled {request.package_name}. Server will restart shortly to apply changes.",
            "logs": result.stdout + "\n" + result.stderr
        }
    except subprocess.CalledProcessError as e:
        logger.error(f"Failed to uninstall package: {e.stderr}")
        raise HTTPException(status_code=500, detail=f"Uninstallation failed: {e.stderr}")
