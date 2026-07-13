"""
Domain Registry Persistence & Access Controller

Manages storage, loading, and access-control for domains and subdomains.
Backed by SQLite via db.py — previously used domains.json / subdomains.json
(migrated automatically on first startup).

Callers (core routers and nginx plugin) use the same function signatures as before.
"""
from typing import List

from fastapi import HTTPException

from db import get_conn


def _load_domains() -> List[dict]:
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM domains").fetchall()
    return [dict(r) for r in rows]


def _save_domains(domains: List[dict]):
    """Replace all domain records atomically."""
    with get_conn() as conn:
        conn.execute("DELETE FROM domains")
        for d in domains:
            conn.execute(
                "INSERT INTO domains (domain_name, username, document_root, status, created_at) "
                "VALUES (?,?,?,?,?)",
                (d["domain_name"], d.get("username", ""), d.get("document_root", ""),
                 d.get("status", "active"), d.get("created_at")),
            )


def _load_subdomains() -> List[dict]:
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM subdomains").fetchall()
    return [dict(r) for r in rows]


def _save_subdomains(subdomains: List[dict]):
    """Replace all subdomain records atomically."""
    with get_conn() as conn:
        conn.execute("DELETE FROM subdomains")
        for s in subdomains:
            conn.execute(
                "INSERT INTO subdomains (fqdn, subdomain, parent_domain, document_root, username, status) "
                "VALUES (?,?,?,?,?,?)",
                (s["fqdn"], s.get("subdomain", s["fqdn"].split(".")[0]),
                 s.get("parent_domain", ""), s.get("document_root", ""),
                 s.get("username", ""), s.get("status", "active")),
            )


def check_domain_access(domain_record: dict, current_user) -> None:
    # Delegates to the shared ownership primitive so the rule lives in one place.
    from deps import assert_owner
    assert_owner(current_user, domain_record.get("username"))
