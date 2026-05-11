import asyncio
import importlib.metadata
import importlib.util
import logging
import os
import shutil
import subprocess
import sys
from fastapi import APIRouter, HTTPException, BackgroundTasks, UploadFile, File
from pydantic import BaseModel

CORE_VERSION = (1, 0, 0)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/cpanelapi/packages", tags=["Packages"])

class PackageInstallRequest(BaseModel):
    package_source: str  # e.g., 'hostpanel-nginx' or 'git+https://github.com/org/repo.git'

class PackageUninstallRequest(BaseModel):
    package_name: str
    force: bool = False

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
                    "requires_core": requires,
                    "compatible": compatible,
                    "service": service,
                })
    except Exception as e:
        logger.error(f"Error loading entry points: {e}")
    return modules

def restart_server():
    """Hard exits the server to prevent graceful shutdown hangs, 
    relying on the process manager (systemd or docker) to restart it immediately."""
    import time
    logger.info("Restarting server to load new packages...")
    time.sleep(1)  # Allow HTTP response to flush
    os._exit(1)  # Non-zero so systemd Restart=on-failure triggers

@router.get("/installed")
async def list_installed_packages():
    return {"status": "success", "data": get_installed_modules()}

@router.post("/install")
async def install_package(request: PackageInstallRequest, background_tasks: BackgroundTasks):
    logger.info(f"Installing package: {request.package_source}")
    try:
        # Run pip install
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", "--upgrade", request.package_source],
            capture_output=True,
            text=True,
            check=True
        )
        logger.info(f"Pip install output: {result.stdout}")
        
        # Schedule restart to apply changes
        background_tasks.add_task(restart_server)
        
        return {
            "status": "success", 
            "message": f"Successfully installed {request.package_source}. Server will restart shortly to apply changes.",
            "logs": result.stdout + "\n" + result.stderr
        }
    except subprocess.CalledProcessError as e:
        logger.error(f"Failed to install package: {e.stderr}")
        raise HTTPException(status_code=500, detail=f"Installation failed: {e.stderr}")

@router.post("/upload")
async def upload_package(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    if not file.filename.endswith(".zip") and not file.filename.endswith(".tar.gz"):
        raise HTTPException(status_code=400, detail="Only .zip or .tar.gz files are allowed.")

    logger.info(f"Uploading package: {file.filename}")
    upload_dir = "/tmp/hostpanel_uploads"
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, file.filename)
    logs = []

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Extract archive to a working directory
        extract_dir = os.path.join(upload_dir, file.filename.replace(".zip", "").replace(".tar.gz", ""))
        if os.path.exists(extract_dir):
            shutil.rmtree(extract_dir)
        os.makedirs(extract_dir)

        if file.filename.endswith(".zip"):
            import zipfile
            with zipfile.ZipFile(file_path, "r") as zf:
                zf.extractall(extract_dir)
        else:
            import tarfile
            with tarfile.open(file_path, "r:gz") as tf:
                tf.extractall(extract_dir)

        # ── plugin/ → pip install ─────────────────────────────────────────────
        plugin_dir = os.path.join(extract_dir, "plugin")
        if os.path.isdir(plugin_dir):
            result = subprocess.run(
                [sys.executable, "-m", "pip", "install", plugin_dir],
                capture_output=True, text=True, check=True
            )
            logs.append(result.stdout)
            logger.info(f"Installed plugin from {plugin_dir}")
        else:
            # Fallback: treat the whole archive as a pip package (legacy behaviour)
            result = subprocess.run(
                [sys.executable, "-m", "pip", "install", file_path],
                capture_output=True, text=True, check=True
            )
            logs.append(result.stdout)

        # Derive slug from filename: hostpanel-nginx-1.0.0.zip → nginx
        pkg_slug = file.filename.split("-")[1] if file.filename.count("-") >= 2 else file.filename.split(".")[0]

        # ── bin/ → /opt/hostpanel/<pkg>/bin/ ─────────────────────────────────
        bin_dir = os.path.join(extract_dir, "bin")
        if os.path.isdir(bin_dir):
            dest_bin = f"/opt/hostpanel/{pkg_slug}/bin"
            os.makedirs(dest_bin, exist_ok=True)
            for fname in os.listdir(bin_dir):
                src = os.path.join(bin_dir, fname)
                dst = os.path.join(dest_bin, fname)
                shutil.copy2(src, dst)
                os.chmod(dst, 0o755)
                logs.append(f"Installed binary: {dst}")
                logger.info(f"Installed binary {fname} → {dst}")

        # ── conf/ → /opt/hostpanel/<pkg>/conf/ ───────────────────────────────
        conf_dir = os.path.join(extract_dir, "conf")
        if os.path.isdir(conf_dir):
            dest_conf = f"/opt/hostpanel/{pkg_slug}/conf"
            os.makedirs(dest_conf, exist_ok=True)
            for fname in os.listdir(conf_dir):
                dst = os.path.join(dest_conf, fname)
                if not os.path.exists(dst):  # don't overwrite existing configs
                    shutil.copy2(os.path.join(conf_dir, fname), dst)
                    logs.append(f"Installed config: {dst}")
                    logger.info(f"Installed config {fname} → {dst}")
            # nginx needs mime.types alongside nginx.conf
            mime_dst = os.path.join(dest_conf, "mime.types")
            if not os.path.exists(mime_dst):
                for candidate in ["/etc/nginx/mime.types", "/usr/share/nginx/mime.types"]:
                    if os.path.exists(candidate):
                        shutil.copy2(candidate, mime_dst)
                        logs.append(f"Installed mime.types from {candidate}")
                        break

        # ── service/ → /etc/systemd/system/ + enable ─────────────────────────
        service_dir = os.path.join(extract_dir, "service")
        if os.path.isdir(service_dir):
            for fname in os.listdir(service_dir):
                if fname.endswith(".service"):
                    src = os.path.join(service_dir, fname)
                    dst = f"/etc/systemd/system/{fname}"
                    subprocess.run(["sudo", "cp", src, dst], check=True)
                    subprocess.run(["sudo", "chmod", "644", dst], check=True)
                    logs.append(f"Installed service: {dst}")
                    logger.info(f"Installed service file {fname} → {dst}")
            subprocess.run(["sudo", "systemctl", "daemon-reload"], check=False)
            for fname in os.listdir(service_dir):
                if fname.endswith(".service"):
                    unit = fname[:-8]  # strip .service
                    subprocess.run(["sudo", "systemctl", "enable", unit], check=False)
                    logs.append(f"Enabled service: {unit}")

        # ── hostpanel.setup → on_install hook ─────────────────────────────────
        import importlib
        importlib.invalidate_caches()
        try:
            setup_eps = importlib.metadata.entry_points().select(group='hostpanel.setup')
            for ep in setup_eps:
                dist = ep.dist
                if dist:
                    dist_name = (dist.metadata.get('Name') or '').lower().replace('_', '-')
                    pkg_name = file.filename.rsplit('-', 1)[0].lower()  # hostpanel-ftp-1.0.0.zip → hostpanel-ftp
                    if dist_name == pkg_name or dist_name == f"hostpanel-{pkg_slug}":
                        logger.info(f"Running on_install hook for {dist_name}")
                        hook_func = ep.load()
                        if asyncio.iscoroutinefunction(hook_func):
                            await hook_func()
                        else:
                            hook_func()
                        logs.append(f"on_install hook completed for {dist_name}")
        except Exception as setup_err:
            logger.warning(f"on_install hook failed: {setup_err}")
            logs.append(f"Warning: on_install hook failed: {setup_err}")

        background_tasks.add_task(restart_server)

        return {
            "status": "success",
            "message": f"Successfully installed {file.filename}. Server will restart shortly.",
            "logs": "\n".join(logs),
        }
    except subprocess.CalledProcessError as e:
        logger.error(f"Failed to install uploaded package: {e.stderr}")
        raise HTTPException(status_code=500, detail=f"Installation failed: {e.stderr}")
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)
        if os.path.exists(extract_dir):
            shutil.rmtree(extract_dir)

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
