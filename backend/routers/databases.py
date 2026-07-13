from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException

from auth import User
from deps import get_current_user, assert_owner
from modules.audit.logger import log_action
from modules.databases import mysql as db_mysql
from modules.databases.exceptions import DatabaseNotFound, DatabaseAlreadyExists, DatabaseOperationFailed

router = APIRouter(prefix="/cpanelapi/databases", tags=["Databases"])


class DbRecord(BaseModel):
    name: str
    db_user: str
    size: str
    created_at: str
    owner: Optional[str] = None


class CreateDbRequest(BaseModel):
    name: str


class CreateDbResponse(DbRecord):
    password: str


def _db_err(e: Exception) -> HTTPException:
    if isinstance(e, DatabaseNotFound):
        return HTTPException(status_code=404, detail=str(e))
    if isinstance(e, DatabaseAlreadyExists):
        return HTTPException(status_code=409, detail=str(e))
    return HTTPException(status_code=500, detail=f"MySQL error: {e}")


@router.get("/mysql", response_model=List[DbRecord])
async def list_mysql_databases(current_user: User = Depends(get_current_user)):
    owner = current_user.linux_user if current_user.role != "admin" else None
    records = db_mysql.list_databases(owner)
    return [DbRecord(size=db_mysql.db_size(r["name"]), **{k: r[k] for k in ("name", "db_user", "created_at", "owner")}) for r in records]


@router.post("/mysql", response_model=CreateDbResponse, status_code=201)
async def create_mysql_database(req: CreateDbRequest, current_user: User = Depends(get_current_user)):
    try:
        result = db_mysql.create_database(req.name, current_user.linux_user)
    except (DatabaseAlreadyExists, DatabaseOperationFailed) as e:
        raise _db_err(e)
    log_action(current_user.username, "db.create", req.name)
    return CreateDbResponse(size="0 MB", **{k: result[k] for k in ("name", "db_user", "created_at", "owner", "password")})


@router.delete("/mysql/{db_name}")
async def delete_mysql_database(db_name: str, current_user: User = Depends(get_current_user)):
    try:
        records = db_mysql.list_databases()
        target = next((r for r in records if r["name"] == db_name), None)
    except Exception:
        target = None

    if not target:
        raise HTTPException(status_code=404, detail="Database not found.")
    assert_owner(current_user, target.get("owner"))

    try:
        db_mysql.delete_database(db_name)
    except (DatabaseNotFound, DatabaseOperationFailed) as e:
        raise _db_err(e)

    log_action(current_user.username, "db.delete", db_name)
    return {"message": f"Database {db_name} and user {target['db_user']} deleted"}


# kept for backward compatibility with users.py cascade delete
def _load_store() -> List[dict]:
    return db_mysql.list_databases()


def _save_store(records: List[dict]):
    from db import get_conn
    with get_conn() as conn:
        conn.execute("DELETE FROM mysql_databases")
        for r in records:
            conn.execute(
                "INSERT INTO mysql_databases (name, db_user, created_at, owner) VALUES (?,?,?,?)",
                (r["name"], r["db_user"], r.get("created_at"), r.get("owner")),
            )


def _mysql(sql: str) -> None:
    db_mysql.run_mysql(sql)
