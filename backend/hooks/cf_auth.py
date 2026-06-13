#!/usr/bin/env python3
"""
Certbot manual auth hook — Cloudflare DNS-01.

Called by certbot before validation. Creates a _acme-challenge TXT record.
Env vars set by certbot: CERTBOT_DOMAIN, CERTBOT_VALIDATION.
Argv[1]: Cloudflare API token.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

PROPAGATION_WAIT = int(os.environ.get("CF_PROPAGATION_SECONDS", "30"))

token   = sys.argv[1]
domain  = os.environ["CERTBOT_DOMAIN"]
value   = os.environ["CERTBOT_VALIDATION"]
record  = f"_acme-challenge.{domain}"
headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type":  "application/json",
}


def cf(method: str, path: str, body=None):
    url  = f"https://api.cloudflare.com/client/v4{path}"
    data = json.dumps(body).encode() if body else None
    req  = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        print(f"CF API {method} {path} → {e.code}: {e.read().decode()}", file=sys.stderr)
        sys.exit(1)


def get_zone_id(domain: str) -> str:
    """Find zone ID by trying apex parts of the domain."""
    parts = domain.split(".")
    for i in range(len(parts) - 1, 0, -1):
        name = ".".join(parts[i:])
        res  = cf("GET", f"/zones?name={name}&status=active")
        if res.get("result"):
            return res["result"][0]["id"]
    print(f"No Cloudflare zone found for {domain}", file=sys.stderr)
    sys.exit(1)


zone_id = get_zone_id(domain)
cf("POST", f"/zones/{zone_id}/dns_records", {
    "type":    "TXT",
    "name":    record,
    "content": value,
    "ttl":     60,
})
print(f"Created TXT {record} = {value}")
print(f"Waiting {PROPAGATION_WAIT}s for DNS propagation…")
time.sleep(PROPAGATION_WAIT)
