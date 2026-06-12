"""
PowerDNS Management API Router

Exposes CRUD endpoints for managing DNS zones and records via PowerDNS HTTP API.

Path Prefix: `/cpanelapi/dns`
Access Control: Injected current user dependency (standard users are scoped to zones matching their domains).

Capabilities:
- API Integration: Communicates with PowerDNS HTTP API (`/api/v1/servers/localhost`) using a configurable API Key.
- Automated Zone Setup: Auto-populates SOA and A records pointing to the hosting server IP upon zone creation.
- Extensible Cascading: Fires dynamic `domain_delete` hook on zone deletion to coordinate other web plugins (like NGINX vhosts).

Endpoints:
- `GET /zones`: Lists DNS zones (scoped by domain ownership for regular users).
- `POST /zones`: Creates a new zone (SOA and nameserver records initialized; Admin-only).
- `DELETE /zones/{zone_name}`: Deletes a zone and cascade-clears local hosting configurations.
- `GET /zones/{zone_name}/records`: Returns all DNS records (A, AAAA, CNAME, TXT, MX, etc.) within a zone.
- `POST /zones/{zone_name}/records`: Inserts or replaces an individual resource record (using PATCH).
- `DELETE /zones/{zone_name}/records/{record_type}/{record_name}`: Deletes an individual resource record set.
"""
import os
import logging
import httpx
from typing import List
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException

from auth import User
from deps import get_current_user, require_admin
from domain_registry import _load_domains
from hooks import call_hooks

router = APIRouter(prefix="/cpanelapi/dns", tags=["DNS"])
logger = logging.getLogger(__name__)

PDNS_URL = "http://127.0.0.1:8053/api/v1/servers/localhost"
PDNS_API_KEY = os.environ.get("PDNS_API_KEY", "hostpanel-dns-api-key")

_ns1 = os.environ.get("PDNS_NS1", "ns1.hostpanel.local.")
_ns2 = os.environ.get("PDNS_NS2", "ns2.hostpanel.local.")
NS1 = _ns1 if _ns1.endswith('.') else f"{_ns1}."
NS2 = _ns2 if _ns2.endswith('.') else f"{_ns2}."
SERVER_IP = os.environ.get("SERVER_IP", "")


# ── Models ─────────────────────────────────────────────────────────────────────

class ZoneCreateRequest(BaseModel):
    name: str


class RecordCreateRequest(BaseModel):
    name: str
    type: str
    content: str
    ttl: int = 300


# ── Helpers ────────────────────────────────────────────────────────────────────

def _fqdn(name: str) -> str:
    """Ensure name ends with a dot (FQDN format for PowerDNS)."""
    return name if name.endswith('.') else f"{name}."


async def _pdns(method: str, path: str, json=None):
    """Make a request to the PowerDNS HTTP API."""
    url = f"{PDNS_URL}{path}"
    headers = {"X-API-Key": PDNS_API_KEY}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.request(method, url, headers=headers, json=json)
        if resp.status_code == 204:
            return None
        if resp.status_code in (200, 201):
            return resp.json()
        error_msg = resp.json().get("error", resp.text) if resp.content else resp.text
        raise HTTPException(status_code=resp.status_code, detail=f"PowerDNS: {error_msg}")
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="DNS server is not reachable. Is PowerDNS running?")
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="DNS server request timed out.")


def _get_user_zone_names(linux_user: str) -> set:
    """Return the set of domain names owned by a Linux user."""
    return {d["domain_name"] for d in _load_domains() if d.get("username") == linux_user}


def _check_zone_access(zone_name: str, current_user: User):
    """Raise 403 if a standard user does not own this zone."""
    if current_user.role != "admin":
        allowed = _get_user_zone_names(current_user.linux_user)
        if zone_name not in allowed:
            raise HTTPException(status_code=403, detail="Access denied")


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("/zones")
async def list_zones(current_user: User = Depends(get_current_user)):
    """List DNS zones. Standard users see only zones for their own domains."""
    data = await _pdns("GET", "/zones")
    zones = [
        {
            "name": z["name"].rstrip("."),
            "kind": z["kind"],
            "serial": z.get("serial", 0),
            "record_count": len(z.get("rrsets", [])),
        }
        for z in data
    ]
    if current_user.role != "admin":
        allowed = _get_user_zone_names(current_user.linux_user)
        zones = [z for z in zones if z["name"] in allowed]
    return zones


@router.post("/zones", status_code=201)
async def create_zone(req: ZoneCreateRequest, current_user: User = Depends(require_admin)):
    """Create a new DNS zone with default SOA and NS records. Admin only."""
    name = _fqdn(req.name)
    payload = {
        "name": name,
        "kind": "Native",
        "nameservers": [NS1, NS2],
    }
    data = await _pdns("POST", "/zones", json=payload)
    logger.info(f"DNS zone created: {req.name}")

    if SERVER_IP:
        try:
            a_payload = {
                "rrsets": [
                    {
                        "name": name,
                        "type": "A",
                        "ttl": 3600,
                        "changetype": "REPLACE",
                        "records": [{"content": SERVER_IP, "disabled": False}],
                    },
                    {
                        "name": _fqdn(f"www.{req.name}"),
                        "type": "A",
                        "ttl": 3600,
                        "changetype": "REPLACE",
                        "records": [{"content": SERVER_IP, "disabled": False}],
                    },
                    {
                        "name": _fqdn(f"cpanel.{req.name}"),
                        "type": "A",
                        "ttl": 3600,
                        "changetype": "REPLACE",
                        "records": [{"content": SERVER_IP, "disabled": False}],
                    },
                ]
            }
            await _pdns("PATCH", f"/zones/{name}", json=a_payload)
            logger.info(f"Auto-created A records for {req.name} → {SERVER_IP}")
        except Exception as e:
            logger.warning(f"Failed to auto-create A records for {req.name}: {e}")

    return {"name": req.name, "kind": data["kind"]}


@router.delete("/zones/{zone_name}")
async def delete_zone(zone_name: str, current_user: User = Depends(require_admin)):
    """Delete a DNS zone and cascade-clean any associated hosted website. Admin only."""
    name = _fqdn(zone_name)
    await _pdns("DELETE", f"/zones/{name}")
    logger.info(f"DNS zone deleted: {zone_name}")

    # Fire domain_delete hooks so installed plugins (nginx) can cascade-clean hosting resources
    domains = _load_domains()
    has_hosted = any(d["domain_name"] == zone_name for d in domains)
    if has_hosted:
        await call_hooks("hostpanel.hooks.domain_delete", domain=zone_name)
        logger.info(f"Cascade-cleaned hosting resources for {zone_name}")
        return {"message": f"Zone {zone_name} deleted along with all associated hosting resources"}

    return {"message": f"Zone {zone_name} deleted"}


@router.get("/zones/{zone_name}/records")
async def list_records(zone_name: str, current_user: User = Depends(get_current_user)):
    """List all DNS records in a zone."""
    _check_zone_access(zone_name, current_user)
    name = _fqdn(zone_name)
    data = await _pdns("GET", f"/zones/{name}")
    records = []
    for rrset in data.get("rrsets", []):
        for rec in rrset.get("records", []):
            records.append({
                "name": rrset["name"].rstrip("."),
                "type": rrset["type"],
                "ttl": rrset["ttl"],
                "content": rec["content"],
            })
    # Sort: A records first, then by name
    records.sort(key=lambda r: (r["type"] != "A", r["name"]))
    return records


@router.post("/zones/{zone_name}/records", status_code=201)
async def add_record(zone_name: str, req: RecordCreateRequest, current_user: User = Depends(get_current_user)):
    """Add a DNS record to a zone."""
    _check_zone_access(zone_name, current_user)
    zone = _fqdn(zone_name)
    # Resolve @ / empty name to the zone apex FQDN — PowerDNS requires a real FQDN
    raw_name = req.name.strip()
    if not raw_name or raw_name == "@":
        raw_name = zone_name
    rec_name = _fqdn(raw_name)
    payload = {
        "rrsets": [
            {
                "name": rec_name,
                "type": req.type.upper(),
                "ttl": req.ttl,
                "changetype": "REPLACE",
                "records": [{"content": req.content, "disabled": False}],
            }
        ]
    }
    await _pdns("PATCH", f"/zones/{zone}", json=payload)
    logger.info(f"DNS record added: {req.name} {req.type} {req.content} in {zone_name}")
    return {"name": req.name, "type": req.type, "content": req.content, "ttl": req.ttl}


@router.delete("/zones/{zone_name}/records/{record_type}/{record_name:path}")
async def delete_record(zone_name: str, record_type: str, record_name: str, current_user: User = Depends(get_current_user)):
    """Delete a DNS record from a zone."""
    _check_zone_access(zone_name, current_user)
    zone = _fqdn(zone_name)
    rec_name = _fqdn(record_name)
    payload = {
        "rrsets": [
            {
                "name": rec_name,
                "type": record_type.upper(),
                "changetype": "DELETE",
            }
        ]
    }
    await _pdns("PATCH", f"/zones/{zone}", json=payload)
    logger.info(f"DNS record deleted: {record_name} {record_type} from {zone_name}")
    return {"message": f"Record {record_name} {record_type} deleted"}
