"""
SSL DB operations — all reads/writes for ssl_certs and ssl_cert_domains.
"""
from datetime import datetime, timezone
from db import get_conn


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def get_cert(root_domain: str) -> dict | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM ssl_certs WHERE root_domain = ?", (root_domain,)
        ).fetchone()
        return dict(row) if row else None


def get_cert_with_domains(root_domain: str) -> dict | None:
    cert = get_cert(root_domain)
    if not cert:
        return None
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM ssl_cert_domains WHERE cert_id = ? ORDER BY is_primary DESC, domain",
            (cert["id"],)
        ).fetchall()
    cert["domains"] = [dict(r) for r in rows]
    return cert


def get_all_certs_with_domains() -> list[dict]:
    with get_conn() as conn:
        certs = conn.execute(
            "SELECT * FROM ssl_certs ORDER BY root_domain"
        ).fetchall()
        result = []
        for cert in certs:
            c = dict(cert)
            rows = conn.execute(
                "SELECT * FROM ssl_cert_domains WHERE cert_id = ? ORDER BY is_primary DESC, domain",
                (cert["id"],)
            ).fetchall()
            c["domains"] = [dict(r) for r in rows]
            result.append(c)
    return result


def upsert_cert(root_domain: str, linux_user: str, status: str = "none",
                cert_path: str | None = None, issued_at: str | None = None,
                expires_at: str | None = None) -> int:
    now = _now()
    with get_conn() as conn:
        existing = conn.execute(
            "SELECT id FROM ssl_certs WHERE root_domain = ?", (root_domain,)
        ).fetchone()
        if existing:
            conn.execute(
                """UPDATE ssl_certs
                   SET linux_user=?, status=?,
                       cert_path=COALESCE(?,cert_path),
                       issued_at=COALESCE(?,issued_at),
                       expires_at=COALESCE(?,expires_at),
                       updated_at=?
                   WHERE root_domain=?""",
                (linux_user, status, cert_path, issued_at, expires_at, now, root_domain),
            )
            return existing["id"]
        cur = conn.execute(
            """INSERT INTO ssl_certs
               (root_domain, linux_user, status, cert_path, issued_at, expires_at, updated_at)
               VALUES (?,?,?,?,?,?,?)""",
            (root_domain, linux_user, status, cert_path, issued_at, expires_at, now),
        )
        return cur.lastrowid


def update_cert_status(root_domain: str, status: str,
                       cert_path: str | None = None,
                       issued_at: str | None = None,
                       expires_at: str | None = None) -> None:
    now = _now()
    with get_conn() as conn:
        conn.execute(
            """UPDATE ssl_certs
               SET status=?,
                   cert_path=COALESCE(?,cert_path),
                   issued_at=COALESCE(?,issued_at),
                   expires_at=COALESCE(?,expires_at),
                   updated_at=?
               WHERE root_domain=?""",
            (status, cert_path, issued_at, expires_at, now, root_domain),
        )


def upsert_cert_domain(cert_id: int, domain: str,
                       is_primary: bool = False, in_cert: bool = False) -> None:
    now = _now()
    with get_conn() as conn:
        existing = conn.execute(
            "SELECT id FROM ssl_cert_domains WHERE cert_id=? AND domain=?",
            (cert_id, domain),
        ).fetchone()
        if existing:
            conn.execute(
                """UPDATE ssl_cert_domains SET is_primary=?, in_cert=?
                   WHERE cert_id=? AND domain=?""",
                (int(is_primary), int(in_cert), cert_id, domain),
            )
        else:
            conn.execute(
                """INSERT INTO ssl_cert_domains
                   (cert_id, domain, is_primary, in_cert, added_at)
                   VALUES (?,?,?,?,?)""",
                (cert_id, domain, int(is_primary), int(in_cert), now),
            )


def set_in_cert_flags(cert_id: int, domains_in_cert: list[str]) -> None:
    with get_conn() as conn:
        conn.execute(
            "UPDATE ssl_cert_domains SET in_cert=0 WHERE cert_id=?", (cert_id,)
        )
        for d in domains_in_cert:
            conn.execute(
                "UPDATE ssl_cert_domains SET in_cert=1 WHERE cert_id=? AND domain=?",
                (cert_id, d),
            )


def remove_cert_domain(cert_id: int, domain: str) -> None:
    with get_conn() as conn:
        conn.execute(
            "DELETE FROM ssl_cert_domains WHERE cert_id=? AND domain=?",
            (cert_id, domain),
        )


def delete_cert(root_domain: str) -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM ssl_certs WHERE root_domain=?", (root_domain,))
