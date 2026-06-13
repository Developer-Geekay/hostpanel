"""
Audit logging for HostPanel.

Call log_action() anywhere in a request handler — it never raises, so
a logging failure never breaks the actual operation.
"""
import logging
from typing import Optional

from db import get_conn

logger = logging.getLogger(__name__)


def log_action(
    actor: str,
    action: str,
    resource: Optional[str] = None,
    detail: Optional[str] = None,
    status: str = "ok",
):
    try:
        with get_conn() as conn:
            conn.execute(
                "INSERT INTO audit_log (actor, action, resource, detail, status) VALUES (?,?,?,?,?)",
                (actor, action, resource, detail, status),
            )
    except Exception as e:
        logger.warning(f"Audit log write failed: {e}")
