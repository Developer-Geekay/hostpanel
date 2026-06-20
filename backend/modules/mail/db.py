from db import get_conn
from modules.mail.exceptions import MailAccountExists, MailAccountNotFound, MailDomainExists, MailDomainNotFound


# ── Domains ───────────────────────────────────────────────────────────────────

def list_domains(owner: str | None = None) -> list[dict]:
    with get_conn() as conn:
        if owner:
            rows = conn.execute(
                "SELECT domain, owner, created_at FROM mail_domains WHERE owner = ? ORDER BY domain",
                (owner,)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT domain, owner, created_at FROM mail_domains ORDER BY domain"
            ).fetchall()
    return [dict(r) for r in rows]


def add_domain(domain: str, owner: str) -> None:
    with get_conn() as conn:
        existing = conn.execute(
            "SELECT 1 FROM mail_domains WHERE domain = ?", (domain,)
        ).fetchone()
        if existing:
            raise MailDomainExists(f"Mail domain '{domain}' already exists")
        conn.execute(
            "INSERT INTO mail_domains (domain, owner) VALUES (?, ?)",
            (domain, owner)
        )


def remove_domain(domain: str) -> None:
    with get_conn() as conn:
        existing = conn.execute(
            "SELECT 1 FROM mail_domains WHERE domain = ?", (domain,)
        ).fetchone()
        if not existing:
            raise MailDomainNotFound(f"Mail domain '{domain}' not found")
        conn.execute("DELETE FROM mail_accounts WHERE domain = ?", (domain,))
        conn.execute("DELETE FROM mail_aliases WHERE domain = ?", (domain,))
        conn.execute("DELETE FROM mail_domains WHERE domain = ?", (domain,))


def cascade_delete_domain(domain: str) -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM mail_accounts WHERE domain = ?", (domain,))
        conn.execute("DELETE FROM mail_aliases WHERE domain = ?", (domain,))
        conn.execute("DELETE FROM mail_domains WHERE domain = ?", (domain,))


def cascade_delete_owner(owner: str) -> None:
    with get_conn() as conn:
        domains = [
            r[0] for r in conn.execute(
                "SELECT domain FROM mail_domains WHERE owner = ?", (owner,)
            ).fetchall()
        ]
        for domain in domains:
            conn.execute("DELETE FROM mail_accounts WHERE domain = ?", (domain,))
            conn.execute("DELETE FROM mail_aliases WHERE domain = ?", (domain,))
        conn.execute("DELETE FROM mail_domains WHERE owner = ?", (owner,))


# ── Accounts ──────────────────────────────────────────────────────────────────

def list_accounts(owner: str | None = None, domain: str | None = None) -> list[dict]:
    with get_conn() as conn:
        if owner and domain:
            rows = conn.execute(
                "SELECT email, domain, owner, quota_mb, created_at FROM mail_accounts "
                "WHERE owner = ? AND domain = ? ORDER BY email",
                (owner, domain)
            ).fetchall()
        elif owner:
            rows = conn.execute(
                "SELECT email, domain, owner, quota_mb, created_at FROM mail_accounts "
                "WHERE owner = ? ORDER BY email",
                (owner,)
            ).fetchall()
        elif domain:
            rows = conn.execute(
                "SELECT email, domain, owner, quota_mb, created_at FROM mail_accounts "
                "WHERE domain = ? ORDER BY email",
                (domain,)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT email, domain, owner, quota_mb, created_at FROM mail_accounts ORDER BY email"
            ).fetchall()
    return [dict(r) for r in rows]


def count_accounts(owner: str | None = None) -> int:
    with get_conn() as conn:
        if owner:
            return conn.execute(
                "SELECT COUNT(*) FROM mail_accounts WHERE owner = ?", (owner,)
            ).fetchone()[0]
        return conn.execute("SELECT COUNT(*) FROM mail_accounts").fetchone()[0]


def get_account_hash(email: str) -> str | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT passwd_hash FROM mail_accounts WHERE email = ?", (email,)
        ).fetchone()
    return row[0] if row else None


def add_account(email: str, domain: str, owner: str, passwd_hash: str, quota_mb: int = 1024) -> None:
    with get_conn() as conn:
        if conn.execute("SELECT 1 FROM mail_accounts WHERE email = ?", (email,)).fetchone():
            raise MailAccountExists(f"Mail account '{email}' already exists")
        conn.execute(
            "INSERT INTO mail_accounts (email, domain, owner, passwd_hash, quota_mb) VALUES (?,?,?,?,?)",
            (email, domain, owner, passwd_hash, quota_mb)
        )


def update_account_password(email: str, passwd_hash: str) -> None:
    with get_conn() as conn:
        if not conn.execute("SELECT 1 FROM mail_accounts WHERE email = ?", (email,)).fetchone():
            raise MailAccountNotFound(f"Mail account '{email}' not found")
        conn.execute(
            "UPDATE mail_accounts SET passwd_hash = ? WHERE email = ?",
            (passwd_hash, email)
        )


def remove_account(email: str) -> None:
    with get_conn() as conn:
        if not conn.execute("SELECT 1 FROM mail_accounts WHERE email = ?", (email,)).fetchone():
            raise MailAccountNotFound(f"Mail account '{email}' not found")
        conn.execute("DELETE FROM mail_accounts WHERE email = ?", (email,))


# ── Aliases ───────────────────────────────────────────────────────────────────

def list_aliases(domain: str | None = None) -> list[dict]:
    with get_conn() as conn:
        if domain:
            rows = conn.execute(
                "SELECT alias, target, domain, owner, created_at FROM mail_aliases "
                "WHERE domain = ? ORDER BY alias",
                (domain,)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT alias, target, domain, owner, created_at FROM mail_aliases ORDER BY alias"
            ).fetchall()
    return [dict(r) for r in rows]


def add_alias(alias: str, target: str, domain: str, owner: str) -> None:
    with get_conn() as conn:
        if conn.execute("SELECT 1 FROM mail_aliases WHERE alias = ?", (alias,)).fetchone():
            from modules.mail.exceptions import MailError
            raise MailError(f"Alias '{alias}' already exists")
        conn.execute(
            "INSERT INTO mail_aliases (alias, target, domain, owner) VALUES (?,?,?,?)",
            (alias, target, domain, owner)
        )


def remove_alias(alias: str) -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM mail_aliases WHERE alias = ?", (alias,))
