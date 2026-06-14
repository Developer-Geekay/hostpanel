"""
PowerDNS API interaction — zone existence checks and zone listing.
Reuses the PDNS_URL / PDNS_API_KEY env pattern already established in the panel.
"""
import logging

import httpx

from .exceptions import DomainNotInPowerDNSError, PowerDNSConnectionError

logger = logging.getLogger(__name__)

_TIMEOUT = 5.0


def _client(pdns_url: str, pdns_api_key: str) -> httpx.Client:
    return httpx.Client(
        base_url=f"{pdns_url}/api/v1/servers/localhost",
        headers={"X-API-Key": pdns_api_key},
        timeout=_TIMEOUT,
    )


def get_zone_list(pdns_url: str, pdns_api_key: str) -> list[str]:
    """Return list of all zone names (trailing dot stripped) from PowerDNS."""
    try:
        with _client(pdns_url, pdns_api_key) as client:
            resp = client.get("/zones")
            resp.raise_for_status()
            return [z["name"].rstrip(".") for z in resp.json()]
    except httpx.HTTPStatusError as e:
        raise PowerDNSConnectionError(
            f"PowerDNS returned {e.response.status_code} when listing zones."
        )
    except httpx.RequestError as e:
        raise PowerDNSConnectionError(f"Could not reach PowerDNS at {pdns_url}: {e}")


def check_zone_exists(root_domain: str, pdns_url: str, pdns_api_key: str) -> None:
    """
    Confirm root_domain zone exists in PowerDNS.
    Raises DomainNotInPowerDNSError if missing, PowerDNSConnectionError on network failure.
    """
    try:
        zones = get_zone_list(pdns_url, pdns_api_key)
    except PowerDNSConnectionError:
        raise

    if root_domain not in zones:
        raise DomainNotInPowerDNSError(
            f"Zone '{root_domain}' not found in PowerDNS. "
            "Create the DNS zone before issuing a certificate."
        )
    logger.debug(f"Zone '{root_domain}' confirmed in PowerDNS.")


def get_zone_records(root_domain: str, pdns_url: str, pdns_api_key: str) -> list[dict]:
    """Return all RRsets for a zone. Useful for debugging."""
    zone_name = root_domain if root_domain.endswith(".") else f"{root_domain}."
    try:
        with _client(pdns_url, pdns_api_key) as client:
            resp = client.get(f"/zones/{zone_name}")
            resp.raise_for_status()
            return resp.json().get("rrsets", [])
    except httpx.RequestError as e:
        raise PowerDNSConnectionError(f"Could not reach PowerDNS: {e}")
