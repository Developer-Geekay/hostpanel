#!/usr/bin/env python3
"""
Certbot manual auth hook — PowerDNS DNS-01.

Creates _acme-challenge TXT record via the local PowerDNS API.
Certbot env vars: CERTBOT_DOMAIN, CERTBOT_VALIDATION.
argv[1]: PowerDNS API base URL  (e.g. http://127.0.0.1:8053)
argv[2]: PowerDNS API key
"""
import json
import os
import sys
import time
import urllib.request

pdns_url = sys.argv[1].rstrip("/")
api_key  = sys.argv[2]
domain   = os.environ["CERTBOT_DOMAIN"].rstrip(".")
value    = os.environ["CERTBOT_VALIDATION"]

headers = {"X-API-Key": api_key, "Content-Type": "application/json"}


def pdns(method: str, path: str, body=None):
    url  = f"{pdns_url}/api/v1/servers/localhost{path}"
    data = json.dumps(body).encode() if body is not None else None
    req  = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.request.HTTPError as e:
        print(f"PowerDNS {method} {path} → {e.code}: {e.read().decode()}", file=sys.stderr)
        sys.exit(1)


def find_zone(fqdn: str) -> str:
    """Walk up domain labels to find the PowerDNS zone that owns this FQDN."""
    parts = fqdn.split(".")
    for i in range(len(parts) - 1):
        candidate = ".".join(parts[i:]) + "."
        req = urllib.request.Request(
            f"{pdns_url}/api/v1/servers/localhost/zones/{candidate}",
            headers=headers, method="GET"
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                if r.status == 200:
                    return candidate
        except urllib.request.HTTPError:
            continue
    return parts[-2] + "." + parts[-1] + "."


zone_name   = find_zone(domain)
record_name = f"_acme-challenge.{domain}."

pdns("PATCH", f"/zones/{zone_name}", {
    "rrsets": [{
        "name":       record_name,
        "type":       "TXT",
        "ttl":        60,
        "changetype": "REPLACE",
        "records":    [{"content": f'"{value}"', "disabled": False}],
    }]
})

print(f"Created TXT {record_name} in zone {zone_name} = {value}")
# Brief wait for PowerDNS to publish — local so propagation is near-instant
time.sleep(3)
