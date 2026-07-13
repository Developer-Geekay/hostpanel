import re
import subprocess
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from pathlib import Path

from auth import User
from deps import get_current_user
from modules.audit.logger import log_action
from modules.files import fs
from modules.files.exceptions import PathForbidden, PathNotFound, FileTooLarge, BinaryFile

router = APIRouter(prefix="/cpanelapi/files", tags=["Files"])


def _args(user: User) -> tuple[Optional[str], str]:
    return (user.linux_user if user.role != "admin" else None), (user.role or "admin")


def _path_err(e: Exception) -> HTTPException:
    if isinstance(e, PathForbidden):
        return HTTPException(status_code=403, detail=str(e))
    if isinstance(e, FileTooLarge):
        return HTTPException(status_code=413, detail=str(e))
    if isinstance(e, BinaryFile):
        return HTTPException(status_code=422, detail=str(e))
    return HTTPException(status_code=404, detail=str(e))


def _default_path(user: User) -> str:
    if user.role != "admin" and user.linux_user:
        return f"/home/{user.linux_user}"
    return "/home"


@router.get("/list")
async def list_directory(path: Optional[str] = None, current_user: User = Depends(get_current_user)):
    lu, role = _args(current_user)
    try:
        return fs.list_dir(path or _default_path(current_user), lu, role)
    except (PathForbidden, PathNotFound) as e:
        raise _path_err(e)


@router.get("/tree")
async def get_tree(path: Optional[str] = None, current_user: User = Depends(get_current_user)):
    lu, role = _args(current_user)
    try:
        return fs.build_tree(path or _default_path(current_user), lu, role)
    except (PathForbidden, PathNotFound) as e:
        raise _path_err(e)


@router.get("/read")
async def read_file(path: str, current_user: User = Depends(get_current_user)):
    lu, role = _args(current_user)
    try:
        return fs.read_file(path, lu, role)
    except (PathForbidden, PathNotFound, FileTooLarge, BinaryFile) as e:
        raise _path_err(e)


@router.post("/write")
async def write_file(
    body: dict,
    current_user: User = Depends(get_current_user),
):
    path = body.get("path", "")
    content = body.get("content", "")
    lu, role = _args(current_user)
    try:
        fs.write_file(path, content, lu, role)
    except (PathForbidden, PathNotFound) as e:
        raise _path_err(e)
    log_action(current_user.username, "file.write", path)
    return {"message": "File saved"}


@router.post("/mkdir")
async def create_directory(body: dict, current_user: User = Depends(get_current_user)):
    path = body.get("path", "")
    lu, role = _args(current_user)
    try:
        fs.create_dir(path, lu, role)
    except PathForbidden as e:
        raise HTTPException(status_code=403, detail=str(e))
    except PathNotFound as e:
        raise HTTPException(status_code=409, detail=str(e))
    log_action(current_user.username, "file.mkdir", path)
    return {"message": f"Directory created"}


@router.delete("/delete")
async def delete_path(path: str, current_user: User = Depends(get_current_user)):
    lu, role = _args(current_user)
    try:
        fs.delete_path(path, lu, role)
    except (PathForbidden, PathNotFound) as e:
        raise _path_err(e)
    log_action(current_user.username, "file.delete", path)
    return {"message": f"Deleted"}


@router.post("/upload")
async def upload_file(
    path: str = Form(...),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    lu, role = _args(current_user)
    content = await file.read()
    try:
        dest = fs.upload_file(path, file.filename or "upload", content, lu, role)
    except (PathForbidden, PathNotFound, FileTooLarge) as e:
        raise _path_err(e)
    log_action(current_user.username, "file.upload", dest)
    return {"message": f"Uploaded {file.filename}", "path": dest}


@router.post("/upload/chunk")
async def upload_file_chunk(
    path: str = Form(...),
    filename: str = Form(...),
    file_id: str = Form(...),
    chunk_index: int = Form(...),
    total_chunks: int = Form(...),
    chunk: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    if not re.match(r'^[a-zA-Z0-9_-]{1,64}$', file_id):
        raise HTTPException(status_code=400, detail="Invalid file_id.")
    if not (0 <= chunk_index < total_chunks <= 2000):
        raise HTTPException(status_code=400, detail="Invalid chunk parameters.")

    lu, role = _args(current_user)
    safe_filename = Path(filename).name
    if not safe_filename:
        raise HTTPException(status_code=400, detail="Invalid filename.")

    try:
        dest_dir = fs.safe_path(path, lu, role)
    except Exception as e:
        raise _path_err(e)
    if not dest_dir.is_dir():
        raise HTTPException(status_code=400, detail="Destination is not a directory.")

    dest = dest_dir / safe_filename
    try:
        fs.safe_path(str(dest), lu, role)
    except Exception as e:
        raise _path_err(e)

    chunk_data = await chunk.read()
    chunk_path = Path(f"/tmp/hp_upload_{file_id}_{chunk_index:04d}.part")
    try:
        chunk_path.write_bytes(chunk_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to store chunk: {str(e)}")

    if chunk_index < total_chunks - 1:
        return {"complete": False, "chunk": chunk_index}

    # Last chunk — assemble all parts into the destination file
    parts = [Path(f"/tmp/hp_upload_{file_id}_{i:04d}.part") for i in range(total_chunks)]
    missing = [str(i) for i, p in enumerate(parts) if not p.exists()]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing chunks: {', '.join(missing)}")

    total_size = sum(p.stat().st_size for p in parts)
    max_bytes = fs._get_upload_limit()
    if total_size > max_bytes:
        for p in parts:
            p.unlink(missing_ok=True)
        limit_mb = max_bytes // (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"File exceeds {limit_mb} MB upload limit.")

    def _stream_assemble(out_path: str):
        with open(out_path, 'wb') as out_f:
            for p in parts:
                with open(str(p), 'rb') as pf:
                    while True:
                        buf = pf.read(65536)
                        if not buf:
                            break
                        out_f.write(buf)

    try:
        try:
            _stream_assemble(str(dest))
        except PermissionError:
            import tempfile
            with tempfile.NamedTemporaryFile(delete=False, dir='/tmp', suffix='.hp_asm') as tmp_f:
                tmp_path = tmp_f.name
            _stream_assemble(tmp_path)
            r = subprocess.run(
                ["sudo", "-n", "/usr/bin/mv", tmp_path, str(dest)],
                capture_output=True, check=False,
            )
            if r.returncode != 0:
                Path(tmp_path).unlink(missing_ok=True)
                raise HTTPException(status_code=403, detail="Permission denied writing assembled file.")
    finally:
        for p in parts:
            p.unlink(missing_ok=True)

    log_action(current_user.username, "file.upload", str(dest))
    return {"complete": True, "message": f"Uploaded {safe_filename}", "path": str(dest)}


@router.get("/download")
async def download_file(path: str, current_user: User = Depends(get_current_user)):
    lu, role = _args(current_user)
    try:
        p = fs.safe_path(path, lu, role)
    except PathForbidden as e:
        raise HTTPException(status_code=403, detail=str(e))
    if not p.exists() or p.is_dir():
        raise HTTPException(status_code=404, detail="File not found.")
    return FileResponse(path=str(p), filename=p.name, media_type="application/octet-stream")

# Backward-compat alias — plugins that imported _safe_path from this module before Phase 7
_safe_path = fs.safe_path
