"""
DNS Credentials API Router

Path Prefix: `/cpanelapi/ssl/dns-credentials`
Stores per-user DNS provider credentials used for DNS-01 ACME challenges.

Supported providers: cloudflare
Storage: /opt/hostpanel/dns-credentials/{linux_user}.json  (token encrypted at-rest is out of scope)
         /opt/hostpanel/dns-credentials/{linux_user}-cloudflare.ini  (certbot-dns-cloudflare format, mode 600)

Endpoints:
- GET  /  : return configured provider (token never returned)
- PUT  /  : save/replace credentials, write .ini for certbot
- DELETE / : remove credentials and .ini file
"""
import os
import json
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from audit import log_action
from auth import User
from deps import get_current_user

router = APIRouter(prefix="/cpanelapi/ssl/dns-credentials", tags=["SSL"])
logger = logging.getLogger(__name__)

DNS_CREDS_DIR = os.environ.get("DNS_CREDS_DIR", "/opt/hostpanel/dns-credentials")

SUPPORTED_PROVIDERS = {"cloudflare"}


class DnsCredRequest(BaseModel):
    provider: str   # "cloudflare"
    api_token: str


class DnsCredResponse(BaseModel):
    configured: bool
    provider: Optional[str] = None


def _cred_path(linux_user: str) -> str:
    return os.path.join(DNS_CREDS_DIR, f"{linux_user}.json")

def _ini_path(linux_user: str, provider: str) -> str:
    return os.path.join(DNS_CREDS_DIR, f"{linux_user}-{provider}.ini")

def _write_cloudflare_ini(linux_user: str, token: str):
    path = _ini_path(linux_user, "cloudflare")
    os.makedirs(DNS_CREDS_DIR, exist_ok=True)
    with open(path, "w") as f:
        f.write(f"dns_cloudflare_api_token = {token}\n")
    os.chmod(path, 0o600)

def get_dns_creds(linux_user: str) -> DnsCredResponse:
    """Used internally by ssl.py to check if DNS creds are configured."""
    path = _cred_path(linux_user)
    if not os.path.exists(path):
        return DnsCredResponse(configured=False)
    try:
        with open(path) as f:
            data = json.load(f)
        return DnsCredResponse(configured=True, provider=data.get("provider"))
    except Exception:
        return DnsCredResponse(configured=False)

def get_cloudflare_ini_path(linux_user: str) -> Optional[str]:
    """Return path to cloudflare .ini if it exists."""
    path = _ini_path(linux_user, "cloudflare")
    return path if os.path.exists(path) else None


@router.get("", response_model=DnsCredResponse)
async def get_credentials(current_user: User = Depends(get_current_user)):
    return get_dns_creds(current_user.linux_user)


@router.put("", response_model=DnsCredResponse)
async def set_credentials(request: DnsCredRequest, current_user: User = Depends(get_current_user)):
    if request.provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unsupported provider '{request.provider}'. Supported: {', '.join(SUPPORTED_PROVIDERS)}")
    if not request.api_token.strip():
        raise HTTPException(status_code=400, detail="api_token is required")

    os.makedirs(DNS_CREDS_DIR, exist_ok=True)
    with open(_cred_path(current_user.linux_user), "w") as f:
        json.dump({"provider": request.provider, "api_token": request.api_token.strip()}, f)

    if request.provider == "cloudflare":
        _write_cloudflare_ini(current_user.linux_user, request.api_token.strip())

    log_action(current_user.username, "ssl.dns_creds_save", resource=request.provider)
    return DnsCredResponse(configured=True, provider=request.provider)


@router.delete("", response_model=DnsCredResponse)
async def delete_credentials(current_user: User = Depends(get_current_user)):
    for path in [
        _cred_path(current_user.linux_user),
        _ini_path(current_user.linux_user, "cloudflare"),
    ]:
        if os.path.exists(path):
            try:
                os.remove(path)
            except Exception as e:
                logger.warning(f"Could not remove {path}: {e}")

    log_action(current_user.username, "ssl.dns_creds_delete")
    return DnsCredResponse(configured=False)
