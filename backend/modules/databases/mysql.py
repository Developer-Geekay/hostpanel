import random
import re
import string
import subprocess
from datetime import datetime
from typing import Optional

from db import get_conn
from modules.databases.exceptions import DatabaseNotFound, DatabaseAlreadyExists, DatabaseOperationFailed

MYSQL_CMD = ["mysql", "--defaults-extra-file=/root/.my.cnf"]
_DB_NAME_RE = re.compile(r'^[a-z0-9_]{1,64}$')


def _run_mysql(sql: str) -> subprocess.CompletedProcess:
    result = subprocess.run(MYSQL_CMD + ["-e", sql], capture_output=True, text=True)
    if result.returncode != 0:
        raise DatabaseOperationFailed(result.stderr.strip())
    return result


def random_password(length: int = 20) -> str:
    chars = string.ascii_letters + string.digits + "!@#$%^&*"
    return "".join(random.choices(chars, k=length))


def validate_db_name(name: str) -> None:
    if not _DB_NAME_RE.match(name):
        raise DatabaseOperationFailed("DB name must be lowercase letters, digits, or underscores (max 64 chars).")


def db_size(db_name: str) -> str:
    sql = (
        f"SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS size_mb "
        f"FROM information_schema.tables WHERE table_schema = '{db_name}';"
    )
    try:
        result = subprocess.run(MYSQL_CMD + ["-e", sql], capture_output=True, text=True)
        lines = result.stdout.strip().splitlines()
        if len(lines) >= 2:
            val = lines[1].strip()
            if val and val != "NULL":
                mb = float(val)
                return f"{round(mb / 1024, 2)} GB" if mb >= 1024 else f"{mb} MB"
    except Exception:
        pass
    return "0 MB"


def list_databases(owner: Optional[str] = None) -> list[dict]:
    with get_conn() as conn:
        if owner:
            rows = conn.execute("SELECT * FROM mysql_databases WHERE owner=?", (owner,)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM mysql_databases").fetchall()
    return [dict(r) for r in rows]


def create_database(name: str, owner: Optional[str]) -> dict:
    validate_db_name(name)
    existing = list_databases()
    if any(r["name"] == name for r in existing):
        raise DatabaseAlreadyExists(f"Database '{name}' already exists.")

    db_user = name[:16]
    password = random_password()
    try:
        _run_mysql(f"CREATE DATABASE `{name}`;")
        _run_mysql(f"CREATE USER '{db_user}'@'localhost' IDENTIFIED BY '{password}';")
        _run_mysql(f"GRANT ALL PRIVILEGES ON `{name}`.* TO '{db_user}'@'localhost';")
        _run_mysql("FLUSH PRIVILEGES;")
    except DatabaseOperationFailed:
        raise

    created_at = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO mysql_databases (name, db_user, created_at, owner) VALUES (?,?,?,?)",
            (name, db_user, created_at, owner),
        )
    return {"name": name, "db_user": db_user, "created_at": created_at, "owner": owner, "password": password}


def delete_database(name: str) -> dict:
    records = list_databases()
    target = next((r for r in records if r["name"] == name), None)
    if not target:
        raise DatabaseNotFound(f"Database '{name}' not found.")

    db_user = target["db_user"]
    try:
        _run_mysql(f"DROP DATABASE IF EXISTS `{name}`;")
        _run_mysql(f"DROP USER IF EXISTS '{db_user}'@'localhost';")
        _run_mysql("FLUSH PRIVILEGES;")
    except DatabaseOperationFailed:
        raise

    with get_conn() as conn:
        conn.execute("DELETE FROM mysql_databases WHERE name=?", (name,))
    return target


# kept for cross-router use (users.py cascade delete)
def run_mysql(sql: str) -> None:
    _run_mysql(sql)
