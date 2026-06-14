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
