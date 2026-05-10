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

                modules.append({
                    "name": dist.metadata.get('Name') or ep.name,
                    "version": dist.version,
                    "module": ep.module,
                    "description": dist.metadata.get('Summary', ''),
                    "nav_items": nav_items,
                    "requires_core": requires,
                    "compatible": compatible,
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
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Run pip install on the uploaded file
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", file_path],
            capture_output=True,
            text=True,
            check=True
        )
        logger.info(f"Pip install output: {result.stdout}")
        
        # Schedule restart to apply changes
        background_tasks.add_task(restart_server)
        
        return {
            "status": "success", 
            "message": f"Successfully installed {file.filename}. Server will restart shortly.",
            "logs": result.stdout + "\n" + result.stderr
        }
    except subprocess.CalledProcessError as e:
        logger.error(f"Failed to install uploaded package: {e.stderr}")
        raise HTTPException(status_code=500, detail=f"Installation failed: {e.stderr}")
    finally:
        # Cleanup
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
