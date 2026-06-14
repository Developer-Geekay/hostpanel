import logging
from db import get_conn

_log = logging.getLogger(__name__)


def log_action(
    actor: str,
    action: str,
    resource: str | None = None,
    detail: str | None = None,
    status: str = "ok",
) -> None:
    """Write one row to audit_log. Never raises — log errors only."""
    try:
        with get_conn() as conn:
            conn.execute(
                "INSERT INTO audit_log (actor, action, resource, detail, status) "
                "VALUES (?, ?, ?, ?, ?)",
                (actor, action, resource, detail, status),
            )
    except Exception as exc:
        _log.error("audit.log_action failed: %s", exc)
