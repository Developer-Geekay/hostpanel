"""
Package registry — tracks installed package source URLs in SQLite.
Replaces the JSON-based packages.json flat file.
"""
from datetime import datetime, timezone

from db import get_conn


def _ensure_table() -> None:
    with get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS package_registry (
                package_name TEXT PRIMARY KEY,
                source       TEXT,
                source_type  TEXT NOT NULL DEFAULT 'upload',
                installed_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at   TEXT
            )
        """)


def load_registry() -> dict:
    _ensure_table()
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM package_registry").fetchall()
    return {r["package_name"]: dict(r) for r in rows}


def save_registry_entry(package_name: str, source: str | None, source_type: str,
                        is_update: bool = False) -> None:
    _ensure_table()
    name = package_name.lower().replace('_', '-')
    now = datetime.now(timezone.utc).isoformat()
    with get_conn() as conn:
        existing = conn.execute(
            "SELECT installed_at FROM package_registry WHERE package_name=?", (name,)
        ).fetchone()
        if existing:
            conn.execute(
                "UPDATE package_registry SET source=?, source_type=?, updated_at=? WHERE package_name=?",
                (source, source_type, now if is_update else existing["installed_at"], name),
            )
        else:
            conn.execute(
                "INSERT INTO package_registry (package_name, source, source_type, installed_at) VALUES (?,?,?,?)",
                (name, source, source_type, now),
            )


def detect_source_type(source: str) -> str:
    if source.startswith("http://") or source.startswith("https://") or source.startswith("git+"):
        return "github_zip"
    return "pypi"
