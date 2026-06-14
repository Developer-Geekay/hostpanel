from db import get_conn


def list_entries(limit: int = 100, offset: int = 0) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, ts, actor, action, resource, detail, status "
            "FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?",
            (limit, offset),
        ).fetchall()
    return [dict(r) for r in rows]


def count_entries() -> int:
    with get_conn() as conn:
        return conn.execute("SELECT COUNT(*) FROM audit_log").fetchone()[0]


def clear_entries() -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM audit_log")
