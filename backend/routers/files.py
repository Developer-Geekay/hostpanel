import logging
import os
import shutil
import stat
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel

from auth import User
from deps import get_current_user

router = APIRouter(prefix="/cpanelapi/files", tags=["Files"])
logger = logging.getLogger(__name__)

# Allowed root paths — only these prefixes are accessible
ALLOWED_ROOTS = ["/home", "/var/www", "/opt/hostpanel/nginx/vhosts"]
MAX_READ_BYTES = 1 * 1024 * 1024   # 1 MB text file limit
MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB upload limit


# ── Security ───────────────────────────────────────────────────────────────────

def _safe_path(path: str, current_user: Optional[User] = None) -> Path:
    """Resolve path, raise 403 if it escapes allowed roots.
    Standard users are restricted to their own home directory."""
    resolved = Path(os.path.realpath(path))
    if current_user and current_user.role != "admin" and current_user.linux_user:
        allowed_roots = [f"/home/{current_user.linux_user}"]
    else:
        allowed_roots = ALLOWED_ROOTS
    for root in allowed_roots:
        try:
            resolved.relative_to(root)
            return resolved
        except ValueError:
            continue
    raise HTTPException(status_code=403, detail="Access denied: path outside allowed directories.")


# ── Models ─────────────────────────────────────────────────────────────────────

class FileEntry(BaseModel):
    name: str
    type: str       # "file" | "dir"
    size: str
    modified: str
    permissions: str


class DirNode(BaseModel):
    name: str
    path: str
    children: Optional[List["DirNode"]] = None


class WriteRequest(BaseModel):
    path: str
    content: str


class MkdirRequest(BaseModel):
    path: str


class DeleteRequest(BaseModel):
    path: str


# ── Helpers ────────────────────────────────────────────────────────────────────

def _human_size(n_bytes: int) -> str:
    for unit in ["B", "KB", "MB", "GB"]:
        if n_bytes < 1024:
            return f"{n_bytes:.0f} {unit}"
        n_bytes /= 1024
    return f"{n_bytes:.1f} TB"


def _permissions(p: Path) -> str:
    try:
        mode = p.stat().st_mode
        return stat.filemode(mode)
    except Exception:
        return "----------"


def _modified(p: Path) -> str:
    try:
        ts = p.stat().st_mtime
        return datetime.fromtimestamp(ts).strftime("%b %d, %Y")
    except Exception:
        return "—"


def _build_tree(path: Path, depth: int = 0, max_depth: int = 3) -> DirNode:
    node = DirNode(name=path.name or str(path), path=str(path))
    if depth < max_depth and path.is_dir():
        children = []
        try:
            for child in sorted(path.iterdir()):
                if child.is_dir() and not child.name.startswith("."):
                    children.append(_build_tree(child, depth + 1, max_depth))
        except PermissionError:
            pass
        node.children = children if children else None
    return node


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("/list", response_model=List[FileEntry])
async def list_directory(path: Optional[str] = None, current_user: User = Depends(get_current_user)):
    if path is None:
        path = f"/home/{current_user.linux_user}" if (current_user.role != "admin" and current_user.linux_user) else "/home"
    p = _safe_path(path, current_user)
    if not p.exists():
        raise HTTPException(status_code=404, detail="Path not found.")
    if not p.is_dir():
        raise HTTPException(status_code=400, detail="Path is not a directory.")

    entries: List[FileEntry] = []
    try:
        items = sorted(p.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower()))
        for item in items:
            try:
                s = item.stat()
                entries.append(FileEntry(
                    name=item.name,
                    type="dir" if item.is_dir() else "file",
                    size="—" if item.is_dir() else _human_size(s.st_size),
                    modified=datetime.fromtimestamp(s.st_mtime).strftime("%b %d, %Y"),
                    permissions=stat.filemode(s.st_mode),
                ))
            except (PermissionError, OSError):
                pass
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied.")
    return entries


@router.get("/tree")
async def get_tree(path: Optional[str] = None, current_user: User = Depends(get_current_user)):
    if path is None:
        path = f"/home/{current_user.linux_user}" if (current_user.role != "admin" and current_user.linux_user) else "/home"
    p = _safe_path(path, current_user)
    if not p.exists() or not p.is_dir():
        raise HTTPException(status_code=404, detail="Path not found.")
    return _build_tree(p, max_depth=3)


@router.get("/read")
async def read_file(path: str, current_user: User = Depends(get_current_user)):
    p = _safe_path(path, current_user)
    if not p.exists():
        raise HTTPException(status_code=404, detail="File not found.")
    if p.is_dir():
        raise HTTPException(status_code=400, detail="Path is a directory.")

    size = p.stat().st_size
    if size > MAX_READ_BYTES:
        raise HTTPException(status_code=413, detail=f"File too large to read in browser (>{MAX_READ_BYTES // 1024}KB).")

    try:
        content = p.read_text(encoding="utf-8", errors="strict")
        return {"path": str(p), "content": content}
    except (UnicodeDecodeError, PermissionError):
        raise HTTPException(status_code=422, detail="File is binary or not readable as text.")


@router.post("/write")
async def write_file(req: WriteRequest, current_user: User = Depends(get_current_user)):
    p = _safe_path(req.path, current_user)
    if p.is_dir():
        raise HTTPException(status_code=400, detail="Path is a directory.")
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(req.content, encoding="utf-8")
        logger.info(f"File written: {p}")
        return {"message": "File saved"}
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied.")


@router.post("/mkdir")
async def create_directory(req: MkdirRequest, current_user: User = Depends(get_current_user)):
    p = _safe_path(req.path, current_user)
    if p.exists():
        raise HTTPException(status_code=409, detail="Directory already exists.")
    try:
        p.mkdir(parents=True, exist_ok=False)
        logger.info(f"Directory created: {p}")
        return {"message": f"Directory {p.name} created"}
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied.")


@router.delete("/delete")
async def delete_path(path: str, current_user: User = Depends(get_current_user)):
    p = _safe_path(path, current_user)
    if not p.exists():
        raise HTTPException(status_code=404, detail="Path not found.")
    try:
        if p.is_dir():
            shutil.rmtree(p)
        else:
            p.unlink()
        logger.info(f"Deleted: {p}")
        return {"message": f"Deleted {p.name}"}
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied.")


@router.post("/upload")
async def upload_file(
    path: str = Form(...),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    dest_dir = _safe_path(path, current_user)
    if not dest_dir.is_dir():
        raise HTTPException(status_code=400, detail="Destination is not a directory.")

    dest = dest_dir / (file.filename or "upload")
    _safe_path(str(dest), current_user)  # ensure dest itself is within allowed roots

    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 50 MB upload limit.")

    dest.write_bytes(content)
    logger.info(f"Uploaded {file.filename} → {dest}")
    return {"message": f"Uploaded {file.filename}", "path": str(dest)}


@router.get("/download")
async def download_file(path: str, current_user: User = Depends(get_current_user)):
    p = _safe_path(path, current_user)
    if not p.exists() or p.is_dir():
        raise HTTPException(status_code=404, detail="File not found.")
    return FileResponse(path=str(p), filename=p.name, media_type="application/octet-stream")
