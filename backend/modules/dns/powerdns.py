import os
import httpx

from modules.dns.exceptions import DnsServiceError, ZoneNotFound

PDNS_URL = "http://127.0.0.1:8053/api/v1/servers/localhost"
PDNS_API_KEY = os.environ.get("PDNS_API_KEY", "hostpanel-dns-api-key")

_ns1 = os.environ.get("PDNS_NS1", "ns1.hostpanel.local.")
_ns2 = os.environ.get("PDNS_NS2", "ns2.hostpanel.local.")
NS1 = _ns1 if _ns1.endswith('.') else f"{_ns1}."
NS2 = _ns2 if _ns2.endswith('.') else f"{_ns2}."
SERVER_IP = os.environ.get("SERVER_IP", "")


def fqdn(name: str) -> str:
    return name if name.endswith('.') else f"{name}."


async def _pdns(method: str, path: str, json=None):
    url = f"{PDNS_URL}{path}"
    headers = {"X-API-Key": PDNS_API_KEY}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.request(method, url, headers=headers, json=json)
        if resp.status_code == 204:
            return None
        if resp.status_code == 404:
            raise ZoneNotFound(path)
        if resp.status_code in (200, 201):
            return resp.json()
        error_msg = resp.json().get("error", resp.text) if resp.content else resp.text
        raise DnsServiceError(f"PowerDNS {resp.status_code}: {error_msg}")
    except httpx.ConnectError:
        raise DnsServiceError("DNS server is not reachable. Is PowerDNS running?")
    except httpx.TimeoutException:
        raise DnsServiceError("DNS server request timed out.")


async def list_zones() -> list[dict]:
    data = await _pdns("GET", "/zones")
    return [
        {
            "name": z["name"].rstrip("."),
            "kind": z["kind"],
            "serial": z.get("serial", 0),
            "record_count": len(z.get("rrsets", [])),
        }
        for z in data
    ]


async def create_zone(name: str) -> dict:
    zone = fqdn(name)
    payload = {"name": zone, "kind": "Native", "nameservers": [NS1, NS2]}
    data = await _pdns("POST", "/zones", json=payload)

    if SERVER_IP:
        try:
            a_payload = {
                "rrsets": [
                    {"name": zone, "type": "A", "ttl": 3600, "changetype": "REPLACE",
                     "records": [{"content": SERVER_IP, "disabled": False}]},
                    {"name": fqdn(f"www.{name}"), "type": "A", "ttl": 3600, "changetype": "REPLACE",
                     "records": [{"content": SERVER_IP, "disabled": False}]},
                    {"name": fqdn(f"cpanel.{name}"), "type": "A", "ttl": 3600, "changetype": "REPLACE",
                     "records": [{"content": SERVER_IP, "disabled": False}]},
                ]
            }
            await _pdns("PATCH", f"/zones/{zone}", json=a_payload)
        except Exception:
            pass

    return {"name": name, "kind": data["kind"]}


async def delete_zone(name: str) -> None:
    await _pdns("DELETE", f"/zones/{fqdn(name)}")


async def list_records(zone_name: str) -> list[dict]:
    data = await _pdns("GET", f"/zones/{fqdn(zone_name)}")
    records = []
    for rrset in data.get("rrsets", []):
        for rec in rrset.get("records", []):
            records.append({
                "name": rrset["name"].rstrip("."),
                "type": rrset["type"],
                "ttl": rrset["ttl"],
                "content": rec["content"],
            })
    records.sort(key=lambda r: (r["type"] != "A", r["name"]))
    return records


async def add_record(zone_name: str, name: str, rtype: str, content: str, ttl: int) -> dict:
    zone = fqdn(zone_name)
    raw = name.strip()
    if not raw or raw == "@":
        raw = zone_name
    rec_name = fqdn(raw)
    payload = {
        "rrsets": [{
            "name": rec_name,
            "type": rtype.upper(),
            "ttl": ttl,
            "changetype": "REPLACE",
            "records": [{"content": content, "disabled": False}],
        }]
    }
    await _pdns("PATCH", f"/zones/{zone}", json=payload)
    return {"name": name, "type": rtype.upper(), "content": content, "ttl": ttl}


async def delete_record(zone_name: str, record_type: str, record_name: str) -> None:
    zone = fqdn(zone_name)
    payload = {
        "rrsets": [{
            "name": fqdn(record_name),
            "type": record_type.upper(),
            "changetype": "DELETE",
        }]
    }
    await _pdns("PATCH", f"/zones/{zone}", json=payload)
