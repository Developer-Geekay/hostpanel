"""
DNS Credentials API Router

Path Prefix: `/cpanelapi/ssl/dns-credentials`

Stores per-user DNS provider credentials in SQLite (dns_credentials table).
Used by ssl.py to run DNS-01 ACME challenges via certbot manual hooks —
no certbot DNS plugin required.

Endpoints:
- GET  /  : return configured provider (token never returned to client)
- PUT  /  : save or replace credentials
- DELETE / : remove credentials
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from audit import log_action
from auth import User
from db import get_conn
from deps import get_current_user

router = APIRouter(prefix="/cpanelapi/ssl/dns-credentials", tags=["SSL"])
logger = logging.getLogger(__name__)

SUPPORTED_PROVIDERS = {"cloudflare"}


class DnsCredRequest(BaseModel):
    provider: str
    api_token: str


class DnsCredResponse(BaseModel):
    configured: bool
    provider: Optional[str] = None


# ── Internal helpers used by ssl.py ───────────────────────────────────────────

def get_dns_creds(linux_user: str) -> DnsCredResponse:
    """Check whether DNS credentials exist for this linux user."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT provider FROM dns_credentials WHERE linux_user = ?", (linux_user,)
        ).fetchone()
    if row:
        return DnsCredResponse(configured=True, provider=row["provider"])
    return DnsCredResponse(configured=False)


def get_token_for_user(linux_user: str) -> Optional[str]:
    """Return the stored API token, or None if not configured."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT api_token FROM dns_credentials WHERE linux_user = ?", (linux_user,)
        ).fetchone()
    return row["api_token"] if row else None


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("", response_model=DnsCredResponse)
async def get_credentials(current_user: User = Depends(get_current_user)):
    return get_dns_creds(current_user.linux_user)


@router.put("", response_model=DnsCredResponse)
async def set_credentials(request: DnsCredRequest, current_user: User = Depends(get_current_user)):
    if request.provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported provider '{request.provider}'. Supported: {', '.join(SUPPORTED_PROVIDERS)}"
        )
    if not request.api_token.strip():
        raise HTTPException(status_code=400, detail="api_token is required")

    with get_conn() as conn:
        conn.execute(
            """INSERT INTO dns_credentials (linux_user, provider, api_token)
               VALUES (?, ?, ?)
               ON CONFLICT(linux_user) DO UPDATE SET
                 provider   = excluded.provider,
                 api_token  = excluded.api_token,
                 updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')""",
            (current_user.linux_user, request.provider, request.api_token.strip()),
        )

    log_action(current_user.username, "ssl.dns_creds_save", resource=request.provider)
    return DnsCredResponse(configured=True, provider=request.provider)


@router.delete("", response_model=DnsCredResponse)
async def delete_credentials(current_user: User = Depends(get_current_user)):
    with get_conn() as conn:
        conn.execute(
            "DELETE FROM dns_credentials WHERE linux_user = ?", (current_user.linux_user,)
        )
    log_action(current_user.username, "ssl.dns_creds_delete")
    return DnsCredResponse(configured=False)
