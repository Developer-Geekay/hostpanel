"""
Zip/tar.gz package extraction and installation pipeline.
"""
import asyncio
import importlib
import importlib.metadata
import logging
import os
import shutil
import subprocess
import sys
import zipfile
import tarfile

from fastapi import HTTPException

_log = logging.getLogger(__name__)

FRONTEND_DIR = os.environ.get("FRONTEND_DIR", "/opt/hostpanel/frontend")


def _manifest_repository(pkg_slug: str) -> str | None:
    try:
        importlib.invalidate_caches()
        for ep in importlib.metadata.entry_points().select(group="hostpanel.modules"):
            if ep.name == pkg_slug:
                mod = ep.load()
                return getattr(mod, "PLUGIN_MANIFEST", {}).get("repository")
    except Exception:
        pass
    return None


async def process_zip(file_path: str, filename: str, is_update: bool = False) -> list[str]:
    """Extract a HostPanel zip/tar.gz and install all components. Returns log lines."""
    logs: list[str] = []
    extract_dir = file_path.replace(".zip", "").replace(".tar.gz", "") + "_extracted"
    if os.path.exists(extract_dir):
        shutil.rmtree(extract_dir)
    os.makedirs(extract_dir)

    try:
        if filename.endswith(".zip"):
            with zipfile.ZipFile(file_path, "r") as zf:
                for member in zf.infolist():
                    member.filename = member.filename.replace("\\", "/")
                    zf.extract(member, extract_dir)
        else:
            with tarfile.open(file_path, "r:gz") as tf:
                tf.extractall(extract_dir)

        # plugin/ → pip install
        plugin_dir = os.path.join(extract_dir, "plugin")
        src = plugin_dir if os.path.isdir(plugin_dir) else file_path
        result = subprocess.run([sys.executable, "-m", "pip", "install", src],
                                capture_output=True, text=True, check=True)
        logs.append(result.stdout)

        pkg_slug = filename.split("-")[1] if filename.count("-") >= 2 else filename.split(".")[0]
        pkg_root = f"/opt/hostpanel/plugins/{pkg_slug}"

        # bin/
        _copy_dir(extract_dir, "bin", pkg_root, logs, executable=True, is_update=is_update)
        # conf/ (never overwrite on update)
        _copy_conf(extract_dir, pkg_root, logs)
        # service/
        _install_services(extract_dir, logs, is_update=is_update)
        # sudoers/
        _install_sudoers(extract_dir, logs, is_update=is_update)
        # frontend/
        _install_frontend(extract_dir, pkg_slug, logs, is_update=is_update)
        # lifecycle hook
        await _run_install_hook(filename, pkg_slug, is_update, logs)

        return logs

    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Installation failed: {e.stderr}")
    finally:
        if os.path.exists(extract_dir):
            shutil.rmtree(extract_dir)


def _copy_dir(extract_dir: str, subdir: str, pkg_root: str, logs: list,
              executable: bool = False, is_update: bool = False) -> None:
    src_dir = os.path.join(extract_dir, subdir)
    if not os.path.isdir(src_dir):
        return
    real = [f for f in os.listdir(src_dir) if not f.startswith('.')]
    if not real:
        return
    os.makedirs(pkg_root, exist_ok=True)
    for fname in real:
        src = os.path.join(src_dir, fname)
        dst = os.path.join(pkg_root, fname)
        shutil.copy2(src, dst)
        if executable:
            os.chmod(dst, 0o755)
        logs.append(f"{'Updated' if is_update else 'Installed'} {subdir}/{fname}")


def _copy_conf(extract_dir: str, pkg_root: str, logs: list) -> None:
    conf_dir = os.path.join(extract_dir, "conf")
    if not os.path.isdir(conf_dir):
        return
    dest_conf = os.path.join(pkg_root, "conf")
    os.makedirs(dest_conf, exist_ok=True)
    for fname in os.listdir(conf_dir):
        if fname.startswith('.'):
            continue
        dst = os.path.join(dest_conf, fname)
        if not os.path.exists(dst):
            shutil.copy2(os.path.join(conf_dir, fname), dst)
            logs.append(f"Installed config: {dst}")


def _install_services(extract_dir: str, logs: list, is_update: bool = False) -> None:
    service_dir = os.path.join(extract_dir, "service")
    if not os.path.isdir(service_dir):
        return
    files = [f for f in os.listdir(service_dir) if f.endswith(".service")]
    for fname in files:
        content = open(os.path.join(service_dir, fname)).read()
        subprocess.run(["sudo", "tee", f"/etc/systemd/system/{fname}"],
                       input=content, text=True, capture_output=True, check=True)
        subprocess.run(["sudo", "chmod", "644", f"/etc/systemd/system/{fname}"], check=True)
        logs.append(f"{'Updated' if is_update else 'Installed'} service: {fname}")
    if files:
        subprocess.run(["sudo", "systemctl", "daemon-reload"], check=False)
        for fname in files:
            subprocess.run(["sudo", "systemctl", "enable", fname[:-8]], check=False)


def _install_sudoers(extract_dir: str, logs: list, is_update: bool = False) -> None:
    sudoers_dir = os.path.join(extract_dir, "sudoers")
    if not os.path.isdir(sudoers_dir):
        return
    for fname in os.listdir(sudoers_dir):
        if fname.startswith('.'):
            continue
        src = os.path.join(sudoers_dir, fname)
        if os.path.getsize(src) == 0:
            continue
        v = subprocess.run(["sudo", "visudo", "-c", "-f", src], capture_output=True, text=True)
        if v.returncode == 0:
            content = open(src).read()
            subprocess.run(["sudo", "tee", f"/etc/sudoers.d/{fname}"],
                           input=content, text=True, capture_output=True, check=True)
            subprocess.run(["sudo", "chmod", "440", f"/etc/sudoers.d/{fname}"], check=True)
            logs.append(f"{'Updated' if is_update else 'Installed'} sudoers: {fname}")
        else:
            logs.append(f"Warning: sudoers {fname} failed validation, skipped")


def _install_frontend(extract_dir: str, pkg_slug: str, logs: list, is_update: bool = False) -> None:
    src = os.path.join(extract_dir, "frontend")
    if not os.path.isdir(src):
        return
    dest = os.path.join(FRONTEND_DIR, "packages", pkg_slug)
    os.makedirs(dest, exist_ok=True)
    for fname in os.listdir(src):
        src_f = os.path.join(src, fname)
        if os.path.isfile(src_f):
            shutil.copy2(src_f, os.path.join(dest, fname))
            logs.append(f"{'Updated' if is_update else 'Installed'} frontend: packages/{pkg_slug}/{fname}")


async def _run_install_hook(filename: str, pkg_slug: str, is_update: bool, logs: list) -> None:
    importlib.invalidate_caches()
    pkg_name = filename.rsplit('-', 1)[0].lower()
    groups = ["hostpanel.update", "hostpanel.setup"] if is_update else ["hostpanel.setup"]
    called = False
    for group in groups:
        if called:
            break
        try:
            for ep in importlib.metadata.entry_points().select(group=group):
                dist = ep.dist
                if not dist:
                    continue
                dist_name = (dist.metadata.get('Name') or '').lower().replace('_', '-')
                if dist_name in (pkg_name, f"hostpanel-{pkg_slug}"):
                    hook = ep.load()
                    if asyncio.iscoroutinefunction(hook):
                        await hook()
                    else:
                        hook()
                    label = "on_update" if group == "hostpanel.update" else "on_install"
                    logs.append(f"{label} hook completed for {dist_name}")
                    called = True
                    break
        except Exception as e:
            logs.append(f"Warning: lifecycle hook failed: {e}")
            _log.warning("lifecycle hook failed: %s", e)
