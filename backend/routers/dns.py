import logging
from typing import List
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException

from auth import User
from deps import get_current_user, require_admin
from domain_registry import _load_domains, _load_subdomains, _save_subdomains
from hooks import call_hooks
from modules.audit.logger import log_action
from modules.dns import powerdns
from modules.dns.exceptions import DnsServiceError, ZoneNotFound

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cpanelapi/dns", tags=["DNS"])


class ZoneCreateRequest(BaseModel):
    name: str


class RecordCreateRequest(BaseModel):
    name: str
    type: str
    content: str
    ttl: int = 300


def _user_zone_names(linux_user: str) -> set:
    return {d["domain_name"] for d in _load_domains() if d.get("username") == linux_user}


def _check_zone_access(zone_name: str, user: User) -> None:
    if user.role != "admin" and zone_name not in _user_zone_names(user.linux_user):
        raise HTTPException(status_code=403, detail="Access denied")


def _dns_err(e: Exception) -> HTTPException:
    if isinstance(e, ZoneNotFound):
        return HTTPException(status_code=404, detail="Zone not found")
    return HTTPException(status_code=503, detail=str(e))


@router.get("/zones")
async def list_zones(current_user: User = Depends(get_current_user)):
    try:
        zones = await powerdns.list_zones()
    except (DnsServiceError, ZoneNotFound) as e:
        raise _dns_err(e)
    if current_user.role != "admin":
        allowed = _user_zone_names(current_user.linux_user)
        zones = [z for z in zones if z["name"] in allowed]
    return zones


@router.post("/zones", status_code=201)
async def create_zone(req: ZoneCreateRequest, current_user: User = Depends(require_admin)):
    try:
        result = await powerdns.create_zone(req.name)
    except (DnsServiceError, ZoneNotFound) as e:
        raise _dns_err(e)
    log_action(current_user.username, "dns.create_zone", req.name)
    return result


@router.delete("/zones/{zone_name}")
async def delete_zone(zone_name: str, current_user: User = Depends(require_admin)):
    try:
        await powerdns.delete_zone(zone_name)
    except (DnsServiceError, ZoneNotFound) as e:
        raise _dns_err(e)
    log_action(current_user.username, "dns.delete_zone", zone_name)

    domains = _load_domains()
    if any(d["domain_name"] == zone_name for d in domains):
        await call_hooks("hostpanel.hooks.domain_delete", domain=zone_name)
        try:
            from modules.mail import db as mail_db, postfix, dovecot
            mail_db.cascade_delete_domain(zone_name)
            postfix.rebuild(
                [d["domain"] for d in mail_db.list_domains()],
                mail_db.list_accounts(),
                mail_db.list_aliases(),
            )
            dovecot.rebuild(mail_db.list_accounts())
        except Exception as _e:
            logger.warning(f"Mail cascade for deleted domain {zone_name} failed: {_e}")
        return {"message": f"Zone {zone_name} deleted along with all associated hosting resources"}
    return {"message": f"Zone {zone_name} deleted"}


@router.get("/zones/{zone_name}/records")
async def list_records(zone_name: str, current_user: User = Depends(get_current_user)):
    _check_zone_access(zone_name, current_user)
    try:
        return await powerdns.list_records(zone_name)
    except (DnsServiceError, ZoneNotFound) as e:
        raise _dns_err(e)


def _sync_cname_to_subdomains(fqdn: str, zone_name: str, username: str) -> None:
    """Register a CNAME-based subdomain in the subdomains table if not already present."""
    subdomains = _load_subdomains()
    if any(s["fqdn"] == fqdn for s in subdomains):
        return
    label = fqdn[: len(fqdn) - len(zone_name) - 1]
    doc_root = f"/home/{username}/public_html/{fqdn}"
    subdomains.append({
        "fqdn": fqdn,
        "subdomain": label,
        "parent_domain": zone_name,
        "document_root": doc_root,
        "username": username,
        "status": "active",
    })
    _save_subdomains(subdomains)


def _unsync_subdomain(fqdn: str) -> None:
    """Remove a subdomain registry entry when its CNAME DNS record is deleted."""
    subdomains = _load_subdomains()
    filtered = [s for s in subdomains if s["fqdn"] != fqdn]
    if len(filtered) != len(subdomains):
        _save_subdomains(filtered)


@router.post("/zones/{zone_name}/records", status_code=201)
async def add_record(zone_name: str, req: RecordCreateRequest, current_user: User = Depends(get_current_user)):
    _check_zone_access(zone_name, current_user)
    try:
        result = await powerdns.add_record(zone_name, req.name, req.type, req.content, req.ttl)
    except (DnsServiceError, ZoneNotFound) as e:
        raise _dns_err(e)
    log_action(current_user.username, "dns.add_record", zone_name, f"{req.name} {req.type} {req.content}")

    # Auto-register CNAME subdomains in the hosting registry so they appear in plugin dropdowns
    if req.type.upper() == "CNAME" and req.name.endswith(f".{zone_name}"):
        domains = _load_domains()
        domain_record = next((d for d in domains if d["domain_name"] == zone_name), None)
        if domain_record:
            try:
                _sync_cname_to_subdomains(req.name, zone_name, domain_record["username"])
            except Exception as exc:
                logger.warning("Could not auto-register subdomain %s: %s", req.name, exc)

    return result


@router.delete("/zones/{zone_name}/records/{record_type}/{record_name:path}")
async def delete_record(zone_name: str, record_type: str, record_name: str,
                        current_user: User = Depends(get_current_user)):
    _check_zone_access(zone_name, current_user)
    try:
        await powerdns.delete_record(zone_name, record_type, record_name)
    except (DnsServiceError, ZoneNotFound) as e:
        raise _dns_err(e)
    log_action(current_user.username, "dns.delete_record", zone_name, f"{record_name} {record_type}")

    # Remove CNAME subdomains from the hosting registry when their DNS record is deleted
    if record_type.upper() == "CNAME":
        try:
            _unsync_subdomain(record_name)
        except Exception as exc:
            logger.warning("Could not remove subdomain registry entry for %s: %s", record_name, exc)

    return {"message": f"Record {record_name} {record_type} deleted"}
