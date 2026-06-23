import os
import shutil
import stat
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Optional

from modules.files.exceptions import PathForbidden, PathNotFound, FileTooLarge, BinaryFile

ALLOWED_ROOTS = ["/home", "/var/www", "/opt/hostpanel/plugins/nginx/vhosts", "/data"]
MAX_READ_BYTES = 1 * 1024 * 1024    # 1 MB
_DEFAULT_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB fallback


def _parse_nginx_size(value: str) -> int:
    """Parse nginx-style size string (e.g. '50m', '1g', '500k') to bytes."""
    v = value.strip().lower()
    if v.endswith('g'):
        return int(v[:-1]) * 1024 * 1024 * 1024
    if v.endswith('m'):
        return int(v[:-1]) * 1024 * 1024
    if v.endswith('k'):
        return int(v[:-1]) * 1024
    return int(v)


def _get_upload_limit() -> int:
    """Read client_max_body_size from nginx_settings DB. Falls back to 50 MB."""
    try:
        from db import get_conn
        with get_conn() as conn:
            row = conn.execute(
                "SELECT value FROM nginx_settings WHERE key = 'client_max_body_size'"
            ).fetchone()
            if row:
                return _parse_nginx_size(row["value"])
    except Exception:
        pass
    return _DEFAULT_UPLOAD_BYTES


def safe_path(path: str, linux_user: Optional[str] = None, role: str = "admin") -> Path:
    resolved = Path(os.path.realpath(path))
    if role != "admin" and linux_user:
        roots = [f"/home/{linux_user}"]
    else:
        roots = ALLOWED_ROOTS
    for root in roots:
        try:
            resolved.relative_to(root)
            return resolved
        except ValueError:
            continue
    raise PathForbidden("Path outside allowed directories.")


def human_size(n: int) -> str:
    for unit in ["B", "KB", "MB", "GB"]:
        if n < 1024:
            return f"{n:.0f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"


def list_dir(path: str, linux_user: Optional[str] = None, role: str = "admin") -> list[dict]:
    p = safe_path(path, linux_user, role)
    if not p.exists():
        raise PathNotFound(f"Path not found: {path}")
    if not p.is_dir():
        raise PathNotFound("Path is not a directory.")
    entries = []
    try:
        for item in sorted(p.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower())):
            try:
                s = item.stat()
                entries.append({
                    "name": item.name,
                    "type": "dir" if item.is_dir() else "file",
                    "size": "—" if item.is_dir() else human_size(s.st_size),
                    "modified": datetime.fromtimestamp(s.st_mtime).strftime("%b %d, %Y"),
                    "permissions": stat.filemode(s.st_mode),
                })
            except (PermissionError, OSError):
                pass
    except PermissionError:
        raise PathForbidden("Permission denied.")
    return entries


def build_tree(path: str, linux_user: Optional[str] = None, role: str = "admin") -> dict:
    p = safe_path(path, linux_user, role)
    if not p.exists() or not p.is_dir():
        raise PathNotFound(f"Path not found: {path}")
    return _tree_node(p, 0, 3)


def _tree_node(path: Path, depth: int, max_depth: int) -> dict:
    node: dict = {"name": path.name or str(path), "path": str(path)}
    if depth < max_depth and path.is_dir():
        children = []
        try:
            for child in sorted(path.iterdir()):
                if child.is_dir() and not child.name.startswith("."):
                    children.append(_tree_node(child, depth + 1, max_depth))
        except PermissionError:
            pass
        if children:
            node["children"] = children
    return node


def read_file(path: str, linux_user: Optional[str] = None, role: str = "admin") -> dict:
    p = safe_path(path, linux_user, role)
    if not p.exists():
        raise PathNotFound(f"File not found: {path}")
    if p.is_dir():
        raise PathNotFound("Path is a directory.")
    if p.stat().st_size > MAX_READ_BYTES:
        raise FileTooLarge(f"File exceeds {MAX_READ_BYTES // 1024} KB read limit.")
    try:
        return {"path": str(p), "content": p.read_text(encoding="utf-8", errors="strict")}
    except (UnicodeDecodeError, PermissionError):
        raise BinaryFile("File is binary or not readable as text.")


def write_file(path: str, content: str, linux_user: Optional[str] = None, role: str = "admin") -> None:
    p = safe_path(path, linux_user, role)
    if p.is_dir():
        raise PathNotFound("Path is a directory.")
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
    except PermissionError:
        r = subprocess.run(["sudo", "-n", "mkdir", "-p", str(p.parent)], capture_output=True, timeout=10)
        if r.returncode != 0:
            raise PathForbidden("Permission denied creating directory.")
    try:
        p.write_text(content, encoding="utf-8")
    except PermissionError:
        r = subprocess.run(["sudo", "-n", "tee", str(p)], input=content, text=True, capture_output=True, timeout=10)
        if r.returncode != 0:
            raise PathForbidden(f"Permission denied: {r.stderr.strip()}")


def create_dir(path: str, linux_user: Optional[str] = None, role: str = "admin") -> None:
    p = safe_path(path, linux_user, role)
    if p.exists():
        raise PathNotFound("Directory already exists.")
    try:
        p.mkdir(parents=True, exist_ok=False)
    except PermissionError:
        r = subprocess.run(["sudo", "-n", "mkdir", "-p", str(p)], capture_output=True, timeout=10)
        if r.returncode != 0:
            raise PathForbidden("Permission denied.")


def delete_path(path: str, linux_user: Optional[str] = None, role: str = "admin") -> None:
    p = safe_path(path, linux_user, role)
    if not p.exists():
        raise PathNotFound(f"Path not found: {path}")
    try:
        shutil.rmtree(p) if p.is_dir() else p.unlink()
    except PermissionError:
        cmd = ["sudo", "-n", "rm", "-rf", str(p)] if p.is_dir() else ["sudo", "-n", "rm", "-f", str(p)]
        r = subprocess.run(cmd, capture_output=True, timeout=10)
        if r.returncode != 0:
            raise PathForbidden("Permission denied.")


def upload_file(dest_dir_path: str, filename: str, content: bytes,
                linux_user: Optional[str] = None, role: str = "admin") -> str:
    dest_dir = safe_path(dest_dir_path, linux_user, role)
    if not dest_dir.is_dir():
        raise PathNotFound("Destination is not a directory.")
    max_bytes = _get_upload_limit()
    if len(content) > max_bytes:
        limit_mb = max_bytes // (1024 * 1024)
        raise FileTooLarge(f"File exceeds {limit_mb} MB upload limit.")
    dest = dest_dir / filename
    safe_path(str(dest), linux_user, role)  # re-validate dest
    try:
        dest.write_bytes(content)
    except PermissionError:
        r = subprocess.run(["sudo", "-n", "tee", str(dest)], input=content, capture_output=True, timeout=30)
        if r.returncode != 0:
            raise PathForbidden("Permission denied writing file.")
    return str(dest)
