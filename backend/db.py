"""
SQLite persistence layer for HostPanel.

Single database at /opt/hostpanel/hostpanel.db (overridable via HOSTPANEL_DB env var).
WAL mode is enabled so concurrent FastAPI requests don't block each other.

Tables: portal_users, domains, subdomains, mysql_databases

Call init_db() once at startup — it creates tables and auto-migrates any existing
JSON files the first time (idempotent; JSON files are kept as a backup).
"""
import contextlib
import json
import logging
import os
import sqlite3

logger = logging.getLogger(__name__)

DB_PATH = os.environ.get("HOSTPANEL_DB", "/opt/hostpanel/hostpanel.db")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS portal_users (
    username        TEXT PRIMARY KEY,
    hashed_password TEXT NOT NULL,
    role            TEXT NOT NULL CHECK(role IN ('admin', 'user')),
    linux_user      TEXT,
    disabled        INTEGER NOT NULL DEFAULT 0,
    protected       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS domains (
    domain_name   TEXT PRIMARY KEY,
    username      TEXT NOT NULL,
    document_root TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'active',
    created_at    TEXT
);

CREATE TABLE IF NOT EXISTS subdomains (
    fqdn          TEXT PRIMARY KEY,
    subdomain     TEXT NOT NULL,
    parent_domain TEXT NOT NULL,
    document_root TEXT NOT NULL,
    username      TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS mysql_databases (
    name       TEXT PRIMARY KEY,
    db_user    TEXT NOT NULL,
    created_at TEXT,
    owner      TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    ts       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    actor    TEXT    NOT NULL,
    action   TEXT    NOT NULL,
    resource TEXT,
    detail   TEXT,
    status   TEXT    NOT NULL DEFAULT 'ok'
);

CREATE TABLE IF NOT EXISTS dns_credentials (
    linux_user TEXT PRIMARY KEY,
    provider   TEXT NOT NULL,
    api_token  TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS ssh_keys (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    linux_user  TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    label       TEXT NOT NULL DEFAULT '',
    added_at    TEXT NOT NULL DEFAULT (date('now')),
    UNIQUE(linux_user, fingerprint)
);

CREATE TABLE IF NOT EXISTS ssl_certs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    root_domain TEXT    NOT NULL UNIQUE,
    linux_user  TEXT    NOT NULL,
    cert_path   TEXT,
    status      TEXT    NOT NULL DEFAULT 'none',
    issued_at   TEXT,
    expires_at  TEXT,
    updated_at  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS ssl_cert_domains (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    cert_id    INTEGER NOT NULL REFERENCES ssl_certs(id) ON DELETE CASCADE,
    domain     TEXT    NOT NULL,
    is_primary INTEGER NOT NULL DEFAULT 0,
    in_cert    INTEGER NOT NULL DEFAULT 0,
    added_at   TEXT    NOT NULL,
    UNIQUE (cert_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_ssl_certs_domain   ON ssl_certs(root_domain);
CREATE INDEX IF NOT EXISTS idx_ssl_cert_domains_c ON ssl_cert_domains(cert_id);

CREATE TABLE IF NOT EXISTS mail_domains (
    domain     TEXT PRIMARY KEY,
    owner      TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS mail_accounts (
    email       TEXT PRIMARY KEY,
    domain      TEXT NOT NULL REFERENCES mail_domains(domain) ON DELETE CASCADE,
    owner       TEXT NOT NULL,
    passwd_hash TEXT NOT NULL,
    quota_mb    INTEGER NOT NULL DEFAULT 1024,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS mail_aliases (
    alias      TEXT PRIMARY KEY,
    target     TEXT NOT NULL,
    domain     TEXT NOT NULL,
    owner      TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_mail_accounts_domain ON mail_accounts(domain);
CREATE INDEX IF NOT EXISTS idx_mail_accounts_owner  ON mail_accounts(owner);
CREATE INDEX IF NOT EXISTS idx_mail_aliases_domain  ON mail_aliases(domain);

CREATE TABLE IF NOT EXISTS wg_peers (
    public_key  TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    allowed_ips TEXT,
    enabled     INTEGER NOT NULL DEFAULT 1,
    imported    INTEGER NOT NULL DEFAULT 0,
    private_key TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
"""


@contextlib.contextmanager
def get_conn():
    """Context manager yielding a committed (or rolled-back) sqlite3 connection."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    """Create schema and migrate JSON data on first run."""
    with get_conn() as conn:
        conn.executescript(_SCHEMA)
    _add_columns()
    _migrate_json()


def _add_columns():
    """Add columns that were introduced after initial schema creation."""
    with get_conn() as conn:
        try:
            conn.execute("ALTER TABLE wg_peers ADD COLUMN private_key TEXT")
        except Exception:
            pass  # column already exists


# ── JSON → SQLite one-time migration ──────────────────────────────────────────

def _migrate_json():
    _migrate_portal_users()
    _migrate_domains()
    _migrate_subdomains()
    _migrate_mysql_databases()
    _migrate_wg_peers()


def _migrate_portal_users():
    path = os.environ.get("PORTAL_USERS_FILE", "/opt/hostpanel/portal_users.json")
    if not os.path.exists(path):
        return
    with get_conn() as conn:
        if conn.execute("SELECT COUNT(*) FROM portal_users").fetchone()[0] > 0:
            os.remove(path)
            return
        try:
            with open(path) as f:
                users = json.load(f)
            for u in users:
                conn.execute(
                    "INSERT OR IGNORE INTO portal_users VALUES (?,?,?,?,?,?)",
                    (u["username"], u["hashed_password"], u["role"],
                     u.get("linux_user"), int(u.get("disabled", False)),
                     int(u.get("protected", False))),
                )
            logger.info(f"Migrated {len(users)} portal user(s) from JSON → SQLite")
            os.remove(path)
        except Exception as e:
            logger.error(f"portal_users JSON migration failed: {e}")


def _migrate_domains():
    path = "/opt/hostpanel/domains.json"
    if not os.path.exists(path):
        return
    with get_conn() as conn:
        if conn.execute("SELECT COUNT(*) FROM domains").fetchone()[0] > 0:
            os.remove(path)
            return
        try:
            with open(path) as f:
                domains = json.load(f)
            for d in domains:
                conn.execute(
                    "INSERT OR IGNORE INTO domains VALUES (?,?,?,?,?)",
                    (d["domain_name"], d.get("username", ""), d.get("document_root", ""),
                     d.get("status", "active"), d.get("created_at")),
                )
            logger.info(f"Migrated {len(domains)} domain(s) from JSON → SQLite")
            os.remove(path)
        except Exception as e:
            logger.error(f"domains JSON migration failed: {e}")


def _migrate_subdomains():
    path = "/opt/hostpanel/subdomains.json"
    if not os.path.exists(path):
        return
    with get_conn() as conn:
        if conn.execute("SELECT COUNT(*) FROM subdomains").fetchone()[0] > 0:
            os.remove(path)
            return
        try:
            with open(path) as f:
                subs = json.load(f)
            for s in subs:
                conn.execute(
                    "INSERT OR IGNORE INTO subdomains VALUES (?,?,?,?,?,?)",
                    (s["fqdn"], s.get("subdomain", s["fqdn"].split(".")[0]),
                     s.get("parent_domain", ""), s.get("document_root", ""),
                     s.get("username", ""), s.get("status", "active")),
                )
            logger.info(f"Migrated {len(subs)} subdomain(s) from JSON → SQLite")
            os.remove(path)
        except Exception as e:
            logger.error(f"subdomains JSON migration failed: {e}")


def _migrate_mysql_databases():
    path = "/opt/hostpanel/databases.json"
    if not os.path.exists(path):
        return
    with get_conn() as conn:
        if conn.execute("SELECT COUNT(*) FROM mysql_databases").fetchone()[0] > 0:
            return
        try:
            with open(path) as f:
                dbs = json.load(f)
            for d in dbs:
                conn.execute(
                    "INSERT OR IGNORE INTO mysql_databases VALUES (?,?,?,?)",
                    (d["name"], d["db_user"], d.get("created_at"), d.get("owner")),
                )
            logger.info(f"Migrated {len(dbs)} MySQL database record(s) from JSON → SQLite")
        except Exception as e:
            logger.error(f"mysql_databases JSON migration failed: {e}")


def _migrate_wg_peers():
    path = "/opt/hostpanel/plugins/wireguard/peers.json"
    if not os.path.exists(path):
        return
    with get_conn() as conn:
        if conn.execute("SELECT COUNT(*) FROM wg_peers").fetchone()[0] > 0:
            os.remove(path)
            return
        try:
            with open(path) as f:
                raw = json.load(f)
            count = 0
            for pubkey, v in raw.items():
                if isinstance(v, str):
                    name, allowed_ips, enabled, imported_ = v, None, 1, 0
                else:
                    name = v.get("name", pubkey[:8])
                    allowed_ips = v.get("allowed_ips")
                    enabled = int(v.get("enabled", True))
                    imported_ = int(v.get("imported", False))
                conn.execute(
                    "INSERT OR IGNORE INTO wg_peers (public_key, name, allowed_ips, enabled, imported) VALUES (?,?,?,?,?)",
                    (pubkey, name, allowed_ips, enabled, imported_),
                )
                count += 1
            logger.info(f"Migrated {count} WireGuard peer(s) from JSON → SQLite")
            os.remove(path)
        except Exception as e:
            logger.error(f"wg_peers JSON migration failed: {e}")
