#!/usr/bin/env python3
"""
Certbot deploy hook — runs after every successful cert issuance/renewal.

Copies cert files from certbot's live dir to /home/<user>/<domain>/ssl/
and updates ssl_certs DB: status=valid, cert_path, issued_at, expires_at.
Also marks all renewed domains as in_cert=1 in ssl_cert_domains.

Certbot env vars used:
  RENEWED_LINEAGE  — path to the live cert directory, e.g. /opt/hostpanel/certs/live/example.com
  RENEWED_DOMAINS  — space-separated list of domains in the renewed cert
"""
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone

# Add backend dir to sys.path so we can import the DB helpers
_backend = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _backend)

from modules.ssl.db import get_cert, update_cert_status, set_in_cert_flags


def main() -> None:
    lineage = os.environ.get("RENEWED_LINEAGE", "").strip()
    domains_str = os.environ.get("RENEWED_DOMAINS", "").strip()

    if not lineage:
        print("ssl_deploy: RENEWED_LINEAGE not set — nothing to do", file=sys.stderr)
        return

    root_domain = os.path.basename(lineage)
    domains = [d for d in domains_str.split() if d]

    cert = get_cert(root_domain)
    if not cert:
        print(f"ssl_deploy: no DB record for '{root_domain}' — skipping", file=sys.stderr)
        return

    linux_user = cert["linux_user"]
    ssl_dir = f"/home/{linux_user}/{root_domain}/ssl"
    os.makedirs(ssl_dir, exist_ok=True)

    for fname in ("fullchain.pem", "privkey.pem", "cert.pem", "chain.pem"):
        src = os.path.join(lineage, fname)
        if not os.path.exists(src):
            continue
        dst = os.path.join(ssl_dir, fname)
        shutil.copy2(src, dst)
        os.chmod(dst, 0o640 if fname != "privkey.pem" else 0o600)

    cert_path = os.path.join(ssl_dir, "fullchain.pem")
    issued_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    expires_at = _parse_expiry(cert_path)

    update_cert_status(
        root_domain,
        status="valid",
        cert_path=cert_path,
        issued_at=issued_at,
        expires_at=expires_at,
    )

    if domains:
        set_in_cert_flags(cert["id"], domains)

    _update_nginx_cpanel_vhost(root_domain, ssl_dir)
    _update_nginx_main_vhost(root_domain, linux_user, ssl_dir)

    print(f"ssl_deploy: cert for '{root_domain}' deployed to {ssl_dir}")


def _update_nginx_cpanel_vhost(root_domain: str, ssl_dir: str) -> None:
    """Write the HTTPS nginx vhost for cpanel.<domain> and reload nginx."""
    vhosts_dir  = "/opt/hostpanel/plugins/nginx/vhosts"
    nginx_bin   = "/opt/hostpanel/plugins/nginx/nginx"
    nginx_conf  = "/opt/hostpanel/plugins/nginx/nginx.conf"
    cpanel_fqdn = f"cpanel.{root_domain}"
    vhost_path  = os.path.join(vhosts_dir, f"{cpanel_fqdn}.conf")

    if not os.path.isdir(vhosts_dir):
        return  # nginx plugin not installed

    cert_path = os.path.join(ssl_dir, "fullchain.pem")
    key_path  = os.path.join(ssl_dir, "privkey.pem")
    if not os.path.exists(cert_path) or not os.path.exists(key_path):
        return

    panel_port         = int(os.environ.get("PANEL_PORT",         "2082"))
    panel_ssl_port     = int(os.environ.get("PANEL_SSL_PORT",     "2083"))
    panel_backend_port = int(os.environ.get("PANEL_BACKEND_PORT", "2081"))

    proxy_block = f"""    error_page 502 503 =200 /502.html;
    location = /502.html {{
        root /opt/hostpanel/frontend;
        internal;
    }}

    client_max_body_size 50m;

    location / {{
        proxy_pass http://127.0.0.1:{panel_backend_port};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }}"""

    vhost_config = f"""# Redirect panel HTTP port → panel HTTPS port
server {{
    listen {panel_port};
    server_name {cpanel_fqdn};
    location / {{
        return 301 https://$host:{panel_ssl_port}$request_uri;
    }}
}}

# Panel HTTPS — SSL termination, proxy to backend
server {{
    listen {panel_ssl_port} ssl;
    server_name {cpanel_fqdn};

    ssl_certificate     {cert_path};
    ssl_certificate_key {key_path};

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    add_header Strict-Transport-Security "max-age=31536000" always;

{proxy_block}
}}
"""

    try:
        with open(vhost_path, "w") as f:
            f.write(vhost_config)
        subprocess.run(
            [nginx_bin, "-p", "/opt/hostpanel/plugins/nginx",
             "-c", nginx_conf, "-s", "reload"],
            capture_output=True, timeout=10,
        )
        print(f"ssl_deploy: nginx cpanel vhost updated to HTTPS on port {panel_ssl_port}")
    except Exception as e:
        print(f"ssl_deploy: could not update nginx cpanel vhost: {e}", file=sys.stderr)


def _update_nginx_main_vhost(root_domain: str, linux_user: str, ssl_dir: str) -> None:
    """Write the nginx vhost for the main domain using the central renderer."""
    vhosts_dir = "/opt/hostpanel/plugins/nginx/vhosts"
    nginx_bin  = "/opt/hostpanel/plugins/nginx/nginx"
    nginx_conf = "/opt/hostpanel/plugins/nginx/nginx.conf"
    vhost_path = os.path.join(vhosts_dir, f"{root_domain}.conf")

    if not os.path.isdir(vhosts_dir):
        return

    cert_path = os.path.join(ssl_dir, "fullchain.pem")
    key_path  = os.path.join(ssl_dir, "privkey.pem")
    if not os.path.exists(cert_path) or not os.path.exists(key_path):
        return

    try:
        from nginx_vhost import render_domain_vhost
        vhost_config = render_domain_vhost(root_domain, linux_user, cert_path, key_path)
        with open(vhost_path, "w") as f:
            f.write(vhost_config)
        subprocess.run(
            [nginx_bin, "-p", "/opt/hostpanel/plugins/nginx",
             "-c", nginx_conf, "-s", "reload"],
            capture_output=True, timeout=10,
        )
        print(f"ssl_deploy: nginx main vhost updated for {root_domain}")
    except Exception as e:
        print(f"ssl_deploy: could not update nginx main vhost: {e}", file=sys.stderr)


def _parse_expiry(cert_path: str) -> str | None:
    try:
        r = subprocess.run(
            ["openssl", "x509", "-in", cert_path, "-noout", "-enddate"],
            capture_output=True, text=True, timeout=10,
        )
        if r.returncode != 0:
            return None
        date_str = r.stdout.strip().split("=", 1)[1]
        dt = datetime.strptime(date_str, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
        return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    except Exception as e:
        print(f"ssl_deploy: could not parse expiry: {e}", file=sys.stderr)
        return None


if __name__ == "__main__":
    main()
