import json
import logging
import os
import random
import string
import subprocess
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional

from auth import User
from deps import get_current_user

router = APIRouter(prefix="/cpanelapi/databases", tags=["Databases"])
logger = logging.getLogger(__name__)

DB_STORE = "/opt/hostpanel/databases.json"
MYSQL_CMD = ["mysql", "--defaults-extra-file=/root/.my.cnf"]


# ── Models ─────────────────────────────────────────────────────────────────────

class DbRecord(BaseModel):
    name: str
    db_user: str
    size: str
    created_at: str
    owner: Optional[str] = None  # linux_user who owns this database


class CreateDbRequest(BaseModel):
    name: str   # lowercase letters, digits, underscores only


class CreateDbResponse(DbRecord):
    password: str   # one-time reveal


# ── Helpers ────────────────────────────────────────────────────────────────────

def _load_store() -> List[dict]:
    if not os.path.exists(DB_STORE):
        return []
    with open(DB_STORE, "r") as f:
        records = json.load(f)
    for r in records:
        r.setdefault("owner", None)  # back-compat migration
    return records


def _save_store(records: List[dict]):
    os.makedirs(os.path.dirname(DB_STORE), exist_ok=True)
    with open(DB_STORE, "w") as f:
        json.dump(records, f, indent=2)


def _random_password(length: int = 20) -> str:
    chars = string.ascii_letters + string.digits + "!@#$%^&*"
    return "".join(random.choices(chars, k=length))


def _mysql(sql: str, check: bool = True) -> subprocess.CompletedProcess:
    result = subprocess.run(
        MYSQL_CMD + ["-e", sql],
        capture_output=True, text=True
    )
    if check and result.returncode != 0:
        raise RuntimeError(result.stderr.strip())
    return result


def _db_size(db_name: str) -> str:
    """Query information_schema for total DB size. Returns human-readable string."""
    sql = (
        f"SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS size_mb "
        f"FROM information_schema.tables WHERE table_schema = '{db_name}';"
    )
    try:
        result = _mysql(sql, check=False)
        lines = result.stdout.strip().splitlines()
        if len(lines) >= 2:
            val = lines[1].strip()
            if val and val != "NULL":
                mb = float(val)
                if mb >= 1024:
                    return f"{round(mb / 1024, 2)} GB"
                return f"{mb} MB"
    except Exception:
        pass
    return "0 MB"


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("/mysql", response_model=List[DbRecord])
async def list_mysql_databases(current_user: User = Depends(get_current_user)):
    records = _load_store()
    if current_user.role != "admin":
        records = [r for r in records if r.get("owner") == current_user.linux_user]
    result = []
    for r in records:
        size = _db_size(r["name"])
        result.append(DbRecord(
            name=r["name"],
            db_user=r["db_user"],
            size=size,
            created_at=r.get("created_at", ""),
            owner=r.get("owner"),
        ))
    return result


@router.post("/mysql", response_model=CreateDbResponse, status_code=201)
async def create_mysql_database(req: CreateDbRequest, current_user: User = Depends(get_current_user)):
    import re
    if not re.match(r'^[a-z0-9_]{1,64}$', req.name):
        raise HTTPException(status_code=422, detail="DB name must be lowercase letters, digits, or underscores (max 64 chars).")

    records = _load_store()
    if any(r["name"] == req.name for r in records):
        raise HTTPException(status_code=409, detail=f"Database '{req.name}' already exists.")

    # Derive user: first 16 chars of db name
    db_user = req.name[:16]
    password = _random_password()

    try:
        _mysql(f"CREATE DATABASE `{req.name}`;")
        _mysql(f"CREATE USER '{db_user}'@'localhost' IDENTIFIED BY '{password}';")
        _mysql(f"GRANT ALL PRIVILEGES ON `{req.name}`.* TO '{db_user}'@'localhost';")
        _mysql("FLUSH PRIVILEGES;")
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=f"MySQL error: {e}")

    record = {
        "name": req.name,
        "db_user": db_user,
        "created_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M"),
        "owner": current_user.linux_user,
    }
    records.append(record)
    _save_store(records)

    logger.info(f"MySQL database created: {req.name} (user: {db_user}, owner: {current_user.linux_user})")
    return CreateDbResponse(
        name=req.name,
        db_user=db_user,
        size="0 MB",
        created_at=record["created_at"],
        owner=record["owner"],
        password=password,
    )


@router.delete("/mysql/{db_name}")
async def delete_mysql_database(db_name: str, current_user: User = Depends(get_current_user)):
    records = _load_store()
    target = next((r for r in records if r["name"] == db_name), None)
    if not target:
        raise HTTPException(status_code=404, detail="Database not found.")

    if current_user.role != "admin" and target.get("owner") != current_user.linux_user:
        raise HTTPException(status_code=403, detail="Access denied")

    db_user = target["db_user"]
    try:
        _mysql(f"DROP DATABASE IF EXISTS `{db_name}`;")
        _mysql(f"DROP USER IF EXISTS '{db_user}'@'localhost';")
        _mysql("FLUSH PRIVILEGES;")
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=f"MySQL error: {e}")

    _save_store([r for r in records if r["name"] != db_name])
    logger.info(f"MySQL database deleted: {db_name}")
    return {"message": f"Database {db_name} and user {db_user} deleted"}
