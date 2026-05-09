# HostPanel — Server Setup & Deployment Guide

## Overview

HostPanel is a self-hosted web control panel for managing Linux hosting accounts.
It runs on Ubuntu and consists of:

| Component     | Technology          | Path                              | Port(s)                               |
|---------------|---------------------|-----------------------------------|---------------------------------------|
| Backend API + Panel UI | FastAPI (Python) | `/opt/hostpanel/backend`   | **2082** (self-contained, no Nginx)   |
| Frontend      | Angular             | `/opt/hostpanel/frontend`         | — (served by FastAPI on port 2082)    |
| Web Server    | Custom Nginx build  | `/opt/hostpanel/nginx`            | 80, 443 (hosted sites only)           |
| FTP Server    | PureFTPd            | `/opt/hostpanel/ftp`              | 21, 40000–40100 (passive)             |
| DNS Server    | PowerDNS            | `/opt/hostpanel/dns`              | 53 (public), 8053 (API/internal)      |

Panel is accessible at: `http://<server-ip>:2082/cpanel/`

> **Architecture note:** The panel runs entirely on port 2082 — FastAPI serves both the
> API (`/cpanelapi/`) and the Angular frontend (`/cpanel/`) directly. Nginx is **not**
> involved in serving the panel and can be restarted/stopped without affecting it.

---

## Quick Start (fresh server)

```bash
# 1. On the server — run the automated setup script
scp -i <your.pem> deployment/setup.sh ubuntu@<server-ip>:/tmp/
ssh -i <your.pem> ubuntu@<server-ip> "chmod +x /tmp/setup.sh && sudo /tmp/setup.sh"

# 2. From your local machine — deploy the code
cd deployment && ./deploy.sh
```

`setup.sh` builds all tools from source, installs systemd services, configures sudoers, and writes the `.env`. `deploy.sh` pushes code and frontend on every update. Read on for manual steps or troubleshooting.

---

## 1. Server Requirements

- Ubuntu 22.04 LTS (tested on AWS EC2 t2.micro / t3.small)
- At least 1 GB RAM, 10 GB disk

### 1.1 Required Open Ports (AWS Security Group / Firewall)

| Port(s)       | Protocol | Direction | Purpose                                      |
|---------------|----------|-----------|----------------------------------------------|
| 22            | TCP      | Inbound   | SSH — server management                      |
| 2082          | TCP      | Inbound   | HostPanel — API + Angular UI (self-contained)|
| 80            | TCP      | Inbound   | HTTP — hosted domains (Nginx only)           |
| 443           | TCP      | Inbound   | HTTPS — SSL-enabled hosted domains           |
| 21            | TCP      | Inbound   | FTP — control connection (login/commands)    |
| 40000–40100   | TCP      | Inbound   | FTP — passive mode data connections (PASV)   |
| 53            | UDP      | Inbound   | DNS — nameserver queries for hosted zones    |
| 53            | TCP      | Inbound   | DNS — large responses / zone transfers       |

**Ports that must NOT be exposed publicly:**

| Port | Purpose                             | Why private                                      |
|------|-------------------------------------|--------------------------------------------------|
| 8053 | PowerDNS HTTP API                   | Internal API key auth only — not for public DNS  |

> **AWS note:** Add all inbound rules to the EC2 instance's Security Group.
> For FTP passive mode, ports 40000–40100 are mandatory — without them, FTP logins
> succeed but directory listings time out (PASV data connection blocked).
> For DNS to work as a public nameserver, port 53 UDP+TCP must be open.

---

## 2. Directory Structure

```
/opt/hostpanel/
├── backend/              # FastAPI backend (serves panel on :2082)
│   ├── main.py
│   ├── auth.py
│   ├── deps.py
│   ├── portal_users.py
│   ├── routers/
│   ├── venv/
│   ├── .env
│   └── logs/
├── frontend/             # Angular build output (served by FastAPI)
├── nginx/                # Custom Nginx build (hosted sites only)
│   ├── sbin/nginx        # Binary
│   ├── conf/nginx.conf   # Main config
│   ├── vhosts/           # Per-domain virtual hosts
│   └── logs/
├── ftp/                  # PureFTPd build
│   ├── bin/pure-pw
│   ├── sbin/pure-ftpd
│   └── etc/
│       ├── pureftpd.passwd
│       └── pureftpd.pdb
├── dns/                  # PowerDNS
│   ├── sbin/pdns_server
│   ├── etc/pdns/pdns.conf
│   └── var/lib/pdns.sqlite3
└── portal_users.json     # Portal user accounts (chmod 600)
```

---

## 3. Backend Setup

### 3.1 Create virtual environment and install dependencies

```bash
cd /opt/hostpanel/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3.2 Configure environment

Copy the example env file and edit values:

```bash
cp .env.example .env
chmod 600 .env
nano .env
```

Key variables to set:

| Variable                    | Description                          | Example                        |
|-----------------------------|--------------------------------------|--------------------------------|
| `SECRET_KEY`                | JWT signing secret (use random str)  | `openssl rand -hex 32`         |
| `DEFAULT_USERNAME`          | Initial admin login                  | `admin`                        |
| `DEFAULT_PASSWORD`          | Initial admin password               | `changeme`                     |
| `FRONTEND_URLS`             | CORS allowed origins (comma-sep)     | `http://yourdomain.com`         |
| `PDNS_API_KEY`              | PowerDNS HTTP API key                | `hostpanel-dns-api-key`        |
| `PDNS_NS1`                  | Primary nameserver FQDN (with dot)   | `ns1.yourdomain.com.`           |
| `PDNS_NS2`                  | Secondary nameserver FQDN            | `ns2.yourdomain.com.`           |
| `CERTBOT_EMAIL`             | Email for Let's Encrypt certs        | `admin@yourdomain.com`          |
| `SERVER_DOMAIN`             | Primary panel domain (reserved)      | `yourdomain.com`                |
| `SERVER_IP`                 | Public IPv4 — auto-creates A records on zone creation | `<your-server-ip>` |
| `PANEL_PORT`                | Port the panel listens on            | `2082`                         |

### 3.3 Install systemd service

```bash
sudo cp deployment/configs/hostpanel-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable hostpanel-api
sudo systemctl start hostpanel-api
```

---

## 4. Nginx Setup

> **Role:** Nginx only serves **hosted sites** (user domains). It does NOT serve the
> panel — the panel runs on port 2082 via FastAPI. Nginx can be stopped/restarted
> without affecting the panel.

### 4.1 Config

The custom Nginx binary lives at `/opt/hostpanel/nginx/sbin/nginx`.  
The config lives at `/opt/hostpanel/nginx/conf/nginx.conf`.

Copy the config template:
```bash
sudo cp deployment/configs/nginx.conf /opt/hostpanel/nginx/conf/nginx.conf
```

Test and reload:
```bash
sudo /opt/hostpanel/nginx/sbin/nginx -t
sudo systemctl reload hostpanel-nginx
```

The config includes all per-domain vhosts from `/opt/hostpanel/nginx/vhosts/*.conf`.
A default `server { return 444; }` block rejects requests to unknown domains.

### 4.2 Install systemd service

```bash
sudo cp deployment/configs/hostpanel-nginx.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable hostpanel-nginx
sudo systemctl start hostpanel-nginx
```

### 4.3 Verify

```bash
# Panel runs on 2082, not through Nginx
curl -I http://localhost:2082/cpanel/
# Should return HTTP/1.1 200 OK

# Nginx health check — hosted sites
curl -o /dev/null -s -w "%{http_code}" http://localhost/
# Returns 444 (expected — no default domain configured)
```

---

## 5. FTP Setup (PureFTPd)

### 5.1 Edit the service file before installing

Before copying the service file, set your server's **public IP** in the passive IP flag:

```bash
nano deployment/configs/hostpanel-ftp.service
# Replace YOUR_SERVER_PUBLIC_IP with your actual public IP (e.g. <your-server-ip>)
# The -P flag tells PureFTPd what IP to advertise in PASV responses
```

The `-P <public-ip>` flag is required on any cloud/NAT host (AWS EC2, etc.) — without it,
PureFTPd advertises its private IP and FTP clients time out during directory listings.

### 5.2 Install systemd service

```bash
sudo cp deployment/configs/hostpanel-ftp.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable hostpanel-ftp
sudo systemctl start hostpanel-ftp
```

### 5.3 Open passive ports in AWS Security Group

In EC2 Console → Security Groups → Inbound Rules, add:

| Type       | Port range    | Source    |
|------------|---------------|-----------|
| Custom TCP | 40000 – 40100 | 0.0.0.0/0 |

Without this, FTP logins succeed but directory listings time out (PASV data connection blocked).

FTP accounts are managed via the panel. Files are stored in:
- Passwd: `/opt/hostpanel/ftp/etc/pureftpd.passwd`
- Database: `/opt/hostpanel/ftp/etc/pureftpd.pdb`

---

## 6. Sudoers — Privileged Commands

The backend service runs as `ubuntu` but needs to run system commands as root. Install the sudoers rule:

```bash
sudo cp deployment/configs/sudoers-hostpanel /etc/sudoers.d/hostpanel
sudo chmod 440 /etc/sudoers.d/hostpanel
# Verify syntax
sudo visudo -cf /etc/sudoers.d/hostpanel
```

This grants `ubuntu` passwordless sudo for only the specific commands HostPanel needs (useradd, userdel, usermod, chpasswd, nginx, pure-pw, mkdir, chown, chmod, rm, mysql).

---

## 7. Frontend Deployment

### 7.1 Build

From your local machine (requires Node.js + Angular CLI):

```bash
cd frontend
npm install
npx ng build --base-href /cpanel/
```

### 7.2 Deploy

```bash
rsync -avz --delete -e "ssh -i <keyfile>" \
  dist/frontend/browser/ \
  ubuntu@<server-ip>:/opt/hostpanel/frontend/
```

Or use the deployment script (handles both backend + frontend):
```bash
cd deployment
chmod +x deploy.sh
./deploy.sh
```

> **Important:** Run `deploy.sh` from the `deployment/` directory, not the project root.
> The script uses relative paths (`../backend/`, `../frontend/`).

FastAPI serves the built frontend directly from `/opt/hostpanel/frontend/` via its
`SPAFiles` mount at `/cpanel`. Angular's client-side routes (e.g. `/cpanel/app/dashboard`)
fall back to `index.html` automatically.

---

## 8. DNS Configuration

### 8.1 PowerDNS is running on port 8053 (internal only)

PowerDNS API is accessible at `http://127.0.0.1:8053/api/v1/servers/localhost`.
The API key is set in `.env` as `PDNS_API_KEY`.

### 8.2 Set up primary domain DNS zone

Set `SERVER_DOMAIN=yourdomain.com` in `/opt/hostpanel/backend/.env` so the panel knows its own domain and blocks it from being provisioned as a hosting domain.

Set `SERVER_IP=<your-server-ip>` in `/opt/hostpanel/backend/.env` so that A and `www` A records are automatically created whenever a new DNS zone is provisioned.

After logging in as admin, go to **DNS** and create a zone for your domain. If `SERVER_IP` is set, the zone will be created with apex and `www` A records already pointing to your server. You still need to add NS glue records manually:

| Name                  | Type | Value           |
|-----------------------|------|-----------------|
| `yourdomain.com`      | A    | `<server-ip>`   | ← auto-created if SERVER_IP is set
| `www.yourdomain.com`  | A    | `<server-ip>`   | ← auto-created if SERVER_IP is set
| `ns1.yourdomain.com`  | A    | `<server-ip>`   | ← add manually
| `ns2.yourdomain.com`  | A    | `<server-ip>`   | ← add manually

### 8.3 Register nameservers at your domain registrar

Set your domain's nameservers to:
```
ns1.yourdomain.com → <server-ip>
ns2.yourdomain.com → <server-ip>
```

---

## 9. RBAC — User Roles

| Role    | Who                    | Access                                              |
|---------|------------------------|-----------------------------------------------------|
| `admin` | `DEFAULT_USERNAME`     | Full access — all pages including Services, DNS, Websites, SSH, SSL |
| `user`  | Provisioned hosting accounts | Files (own dir) + Databases + FTP only |

**Protected admin account** (`protected: true` in `portal_users.json`) cannot be deleted or disabled through the panel.

**Granting portal access to a hosting user:**
When creating a user, set a **Portal password** — this creates a `portal_users.json` entry with `role: user`.
Standard users land on the Files page after login and cannot access DNS, Websites, SSH Keys, SSL, Dashboard, Users, or Services.

---

## 9.1 Service Manager

Admin-only page (`/app/services`) to start/stop/restart the five managed services:

| Name  | systemd unit    |
|-------|-----------------|
| nginx | hostpanel-nginx |
| api   | hostpanel-api   |
| dns   | hostpanel-dns   |
| ftp   | hostpanel-ftp   |
| mysql | mysql           |

The API is at `GET /cpanelapi/services` and `POST /cpanelapi/services/{name}/{start|stop|restart|reload}`.

**Required sudoers rules** (already in `deployment/configs/sudoers-hostpanel`):
```
ubuntu ALL=(ALL) NOPASSWD: /bin/systemctl start hostpanel-*
ubuntu ALL=(ALL) NOPASSWD: /bin/systemctl stop hostpanel-*
ubuntu ALL=(ALL) NOPASSWD: /bin/systemctl restart hostpanel-*
ubuntu ALL=(ALL) NOPASSWD: /bin/systemctl reload hostpanel-*
ubuntu ALL=(ALL) NOPASSWD: /bin/systemctl start mysql
ubuntu ALL=(ALL) NOPASSWD: /bin/systemctl stop mysql
ubuntu ALL=(ALL) NOPASSWD: /bin/systemctl restart mysql
ubuntu ALL=(ALL) NOPASSWD: /bin/systemctl is-active *
```

After updating sudoers on the server:
```bash
sudo cp deployment/configs/sudoers-hostpanel /etc/sudoers.d/hostpanel
sudo chmod 440 /etc/sudoers.d/hostpanel
sudo visudo -cf /etc/sudoers.d/hostpanel
```

---

## 9.2 Subdomain Management

From the Websites page → click a domain → **Subdomains** section at the bottom.

Each subdomain creates:
- Nginx vhost at `/opt/hostpanel/nginx/vhosts/{fqdn}.conf`
- Directory `/home/{user}/public_html/{fqdn}` with default `index.html`
- DNS A record → `SERVER_IP` (if set)
- Entry in `/opt/hostpanel/subdomains.json`

Deleting a subdomain removes the vhost and DNS record but **preserves the files**.

---

## 10. Deployment Script

`deployment/deploy.sh` handles full backend + frontend deployment:

```bash
# Edit these variables at the top of deploy.sh before first use:
SERVER_IP="<your-server-ip>"
SSH_KEY="<path-to-pem-file>"

./deployment/deploy.sh
```

The script:
1. Rsyncs backend to `/opt/hostpanel/backend/`
2. Installs Python dependencies
3. Restarts `hostpanel-api` service
4. Builds Angular frontend with correct base-href (`/cpanel/`)
5. Rsyncs frontend to `/opt/hostpanel/frontend/`

After deploy, the panel is at: `http://<SERVER_IP>:2082/cpanel/`

---

## 11. Service Management Cheat Sheet

```bash
# Status of all HostPanel services
systemctl status hostpanel-api hostpanel-nginx hostpanel-ftp hostpanel-dns mysql

# Restart panel API
sudo systemctl restart hostpanel-api

# Reload Nginx (hosted site config changes)
sudo /opt/hostpanel/nginx/sbin/nginx -t && sudo systemctl reload hostpanel-nginx

# View backend logs (live)
journalctl -u hostpanel-api -f

# View Nginx access/error logs
tail -f /opt/hostpanel/nginx/logs/access.log
tail -f /opt/hostpanel/nginx/logs/error.log

# View backend application logs
tail -f /opt/hostpanel/backend/logs/hostpanel.log

# Panel URL
# http://<server-ip>:2082/cpanel/
```

---

## 12. One-Time Migration (port 8000 → port 2082)

If you're upgrading an existing deployment that ran the panel through Nginx on port 8000, run these commands on the server **before** running `deploy.sh`:

```bash
# 1. Open panel port in firewall
sudo ufw allow 2082/tcp
sudo ufw status  # confirm 2082 ALLOW

# 2. Create the new frontend directory (FastAPI serves from here)
sudo mkdir -p /opt/hostpanel/frontend
sudo chown ubuntu:ubuntu /opt/hostpanel/frontend

# 3. Strip the old /cpanel/ and /api/ proxy blocks from Nginx
#    (Nginx now only serves hosted sites — panel is on 2082)
sudo cp /opt/hostpanel/backend/../deployment/configs/nginx.conf \
    /opt/hostpanel/nginx/conf/nginx.conf
sudo /opt/hostpanel/nginx/sbin/nginx -t
sudo systemctl reload hostpanel-nginx

# 4. Update the systemd unit (adds FRONTEND_DIR env + journal logging)
sudo cp /opt/hostpanel/backend/../deployment/configs/hostpanel-api.service \
    /etc/systemd/system/
sudo systemctl daemon-reload

# 5. Add PANEL_PORT to .env
grep -q PANEL_PORT /opt/hostpanel/backend/.env || \
    echo "PANEL_PORT=2082" >> /opt/hostpanel/backend/.env

# 6. Apply updated sudoers (adds journalctl + systemctl is-active rules)
sudo cp /opt/hostpanel/backend/../deployment/configs/sudoers-hostpanel \
    /etc/sudoers.d/hostpanel
sudo chmod 440 /etc/sudoers.d/hostpanel
sudo visudo -cf /etc/sudoers.d/hostpanel
```

Then from your **local machine**:
```bash
cd /path/to/project/deployment && ./deploy.sh
```

After deploy, access the panel at `http://<SERVER_IP>:2082/cpanel/`.

---

## 13. Portal Users File

`/opt/hostpanel/portal_users.json` stores panel login accounts (hashed passwords).

- Permissions: `chmod 600` (owner: ubuntu)
- The admin account is bootstrapped automatically on first start from `.env`
- Back this file up alongside `.env` when migrating servers

---

## 14. Troubleshooting

### `PermissionError` writing `index.html` when provisioning a domain

**Symptom:** `POST /cpanelapi/domains` returns 500. Journal shows:
```
PermissionError: [Errno 13] Permission denied: '/home/<user>/public_html/<domain>/index.html'
```

**Cause:** `sudo mkdir` creates the directory owned by `root`. The service runs as `ubuntu`,
which cannot write into a `root`-owned directory. The original code ran `chown` to the hosting
user before writing `index.html`, so `ubuntu` still had no access.

**Fix (applied in code):** `chmod 777` the document root immediately after `mkdir` so the
service user can write `index.html`, then `chown`/`chmod` the full tree to the hosting user
afterwards to restore correct permissions.

---

### FTP login succeeds but directory listing times out (PASV timeout)

**Symptom:** FileZilla (or any FTP client) logs in successfully, sends `PASV`, then:
```
Error: Connection timed out after 20 seconds of inactivity
Error: Failed to retrieve directory listing
```

**Cause:** Two separate problems, both required:
1. PureFTPd advertises its **private IP** (e.g. `172.31.x.x`) in PASV responses. The FTP client tries to open a data connection to that private IP, which is unreachable from outside AWS.
2. Passive ports 40000–40100 are not open in the EC2 Security Group.

**Fix:**
1. Add `-P <your-public-ip>` to the `ExecStart` line in `/etc/systemd/system/hostpanel-ftp.service`:
```ini
ExecStart=/opt/hostpanel/ftp/sbin/pure-ftpd \
  ...
  -p 40000:40100 \
  -P <your-server-ip> \
  ...
```
Then: `sudo systemctl daemon-reload && sudo systemctl restart hostpanel-ftp`

2. In AWS Console → EC2 → Security Groups → Inbound Rules, add TCP 40000–40100 from `0.0.0.0/0`.

---

### FTP toggle always shows disabled even after successful enable

**Symptom:** `PUT /cpanelapi/users/{username}/ftp/enable` returns 200 "FTP enabled", but the user list still shows `ftp_enabled: false`.

**Cause:** `pure-pw list -f pureftpd.passwd` was called without `sudo`. Since `/opt/hostpanel/ftp/etc/pureftpd.passwd` is root-owned 600, the service user cannot read it. The command silently returns empty output, so every user shows as FTP-disabled regardless of actual state.

**Fix (applied in code):** `sudo` added to the `pure-pw list` call in both `routers/users.py` (`_ftp_enabled_users()`) and `routers/ftp.py` (list accounts endpoint).

---

### `PermissionError` on `pureftpd.passwd` when enabling/disabling FTP

**Symptom:** Enabling FTP via Users page or FTP page returns 500. Error:
```
Check that [username] doesn't already exist,
and that [/opt/hostpanel/ftp/etc/pureftpd.passwd.tmp] can be written.
```

**Cause:** `/opt/hostpanel/ftp/etc/pureftpd.passwd` is owned by `root:root 600`.
The `pure-pw` commands were not prefixed with `sudo`.

**Fix (applied in code):** All `pure-pw` and `mkdb` calls in `ftp.py` and `users.py`
are now prefixed with `sudo`. The sudoers rule in `deployment/configs/sudoers-hostpanel`
includes `/opt/hostpanel/ftp/bin/pure-pw`.

---

### `PermissionError` writing Nginx vhost or log files

**Symptom:** `POST /cpanelapi/domains` returns 500. Journal shows:
```
PermissionError: [Errno 13] Permission denied: '/opt/hostpanel/nginx/vhosts/<domain>.conf'
```

**Cause:** `/opt/hostpanel/nginx/vhosts/` and `/opt/hostpanel/nginx/logs/` are owned by `root`.
The service user `ubuntu` cannot write vhost config files or create per-domain log files.

**Fix (one-time server config):**
```bash
sudo chown ubuntu:ubuntu /opt/hostpanel/nginx/vhosts/
sudo chown ubuntu:ubuntu /opt/hostpanel/nginx/logs/
```

Nginx runs as root and can still read from these directories.

---

### Cannot provision server's own domain as a hosting domain

**Symptom:** `POST /cpanelapi/domains` returns 400:
```
"'yourdomain.com' is a reserved server domain and cannot be provisioned as a hosting domain."
```

**Cause/Design intent:** The domain that the panel itself runs on (`SERVER_DOMAIN` in `.env`) plus `www.<SERVER_DOMAIN>`, `localhost`, and `127.0.0.1` are blocked from being provisioned. If they were provisioned, user-created redirects could override panel paths.

**How it works:**
- `RESERVED_DOMAINS` is built from `SERVER_DOMAIN` at startup in `domains.py`
- `redirects.py` additionally blocks `/cpanel` and `/cpanelapi` paths on the server domain
- Set `SERVER_DOMAIN=yourcpaneldomain.com` in `.env` to match your panel's actual domain

---

### `POST /cpanelapi/domains` returns 307 Temporary Redirect (historical)

**Symptom:** Browser shows two requests — `POST /cpanelapi/domains` → 307, then `POST /cpanelapi/domains/` → result.
Some HTTP clients drop the request body on redirect.

**Cause:** FastAPI's default `redirect_slashes=True` redirects requests missing a trailing slash.

**Fix (applied in code):** `redirect_slashes=False` added to the `FastAPI()` constructor in `main.py`.

---

### `POST /cpanelapi/domains` (or other collection endpoints) returns 404

**Symptom:** `POST /cpanelapi/domains` returns 404 even though the route exists.

**Cause:** With `redirect_slashes=False`, FastAPI no longer redirects trailing-slash forms. If the route decorator uses `"/"`, only the trailing-slash path matches.

**Fix (applied in code):** All collection-level route decorators use `""` (no slash) across all routers. This registers each route at the no-trailing-slash path, which is what the Angular frontend sends.

---

### `PermissionError` on system commands (useradd, userdel, nginx, etc.)

**Cause:** The service runs as `ubuntu` (non-root). System commands require root.

**Fix:** Install the sudoers rule (see Section 6). All system commands in the backend
are prefixed with `sudo` — `useradd`, `userdel`, `usermod`, `chpasswd`, `nginx`, `mkdir`,
`chown`, `chmod`, `rm`, `mysql`, `pure-pw`.

---

### Frontend shows old UI after deployment

**Cause:** Browser has the old JavaScript bundle cached.

**Fix:** Do a hard refresh (`Ctrl+Shift+R` / `Cmd+Shift+R`) after deploying to bypass the browser cache. If the issue persists, confirm `deploy.sh` synced to `/opt/hostpanel/frontend/` (not the old `/home/ubuntu/frontend/dist/...` path) and that `hostpanel-api` was restarted.

---

### New DNS zone created but no A record appears

**Symptom:** After creating a zone in the DNS panel, only SOA and NS records are visible — no A or `www` A record.

**Cause:** `SERVER_IP` is not set (or is empty) in `/opt/hostpanel/backend/.env`. The auto A record creation is skipped when this variable is blank.

**Fix:** Add the server's public IPv4 to `.env`:
```
SERVER_IP=<your-server-ip>
```
Then restart the backend:
```bash
sudo systemctl restart hostpanel-api
```
Zones created after this change will automatically include:
- `yourdomain.com` A → `SERVER_IP` (TTL 3600)
- `www.yourdomain.com` A → `SERVER_IP` (TTL 3600)

Existing zones are not backfilled — add the A records manually via the DNS panel.

---

### Backend running from wrong path (`/home/ubuntu/backend` vs `/opt/hostpanel/backend`)

**Cause:** The systemd service unit pointed to `/home/ubuntu/backend`.

**Fix:** Update the service file to use `/opt/hostpanel/backend` for `WorkingDirectory`,
`EnvironmentFile`, and `ExecStart`. The corrected template is in
`deployment/configs/hostpanel-api.service`.

```bash
sudo systemctl daemon-reload
sudo systemctl restart hostpanel-api
```

---

### `POST /cpanelapi/domains` returns 500 when provisioning a new domain (RBAC refactor regression)

**Symptom:** Clicking "Add Website" fails with "Failed to add website." Journal shows:
```
AttributeError: 'Depends' object has no attribute 'role'
```

**Cause:** After the RBAC refactor, `add_domain()` called the `create_user` FastAPI route function
directly to create the Linux user. The route function signature includes `current_user: User = Depends(require_admin)`.
Calling a FastAPI route function outside of an HTTP request context means FastAPI never resolves
the `Depends()` — `current_user` receives the raw `Depends` object instead of a `User`, causing the crash.

**Fix (applied in code):** The Linux user creation logic was extracted into a standalone helper
`_create_linux_user(username, password)` in `users.py`. This helper has no FastAPI dependencies
and can be called from anywhere. `add_domain()` now calls `users._create_linux_user()` directly,
and the `create_user` route also delegates to the same helper.

---

## 15. Plug-and-Play Architecture

HostPanel uses a plugin system for optional features (Nginx/domains, FTP). Plugins are Python packages installed via pip and discovered via `importlib.metadata` entry points.

### 15.1 Entry Point Groups

| Group | Purpose |
|---|---|
| `hostpanel.modules` | Register FastAPI routers and nav metadata |
| `hostpanel.lifecycle` | `pre_uninstall(force)` — blocking check before pip removes the package |
| `hostpanel.hooks.user_delete` | `on_user_delete(username, **kwargs)` — cascades when a hosting user is deleted |
| `hostpanel.hooks.domain_delete` | `on_domain_delete(domain, **kwargs)` — cascades when a DNS zone with an associated domain is deleted |

### 15.2 Plugin Structure

Each plugin exposes a `PLUGIN_MANIFEST` dict in its `plugin.py` and either a `router` (single router, backward compat) or `routers` (list, for multi-router plugins).

**Single router (FTP-style):**
```python
PLUGIN_MANIFEST = {"nav_route": "ftp", "nav_label": "FTP", "nav_icon": "swap_vert",
                   "nav_section": "my_space", "admin_only": False}
router = ftp_router
```

**Multi-router with multiple nav items (Nginx-style):**
```python
PLUGIN_MANIFEST = {
    "nav_items": [
        {"nav_route": "domains", "nav_label": "Websites", "nav_icon": "language",
         "nav_section": "hosting", "admin_only": True},
        {"nav_route": "ssl", "nav_label": "SSL", "nav_icon": "lock",
         "nav_section": "security", "admin_only": True},
    ]
}
routers = [domains_router, ssl_router, redirects_router]
```

### 15.3 Core Shared Modules

| File | Purpose |
|---|---|
| `backend/domain_registry.py` | Shared data layer: `_load_domains`, `_save_domains`, `_load_subdomains`, `_save_subdomains`, `check_domain_access` |
| `backend/hooks.py` | Async hook dispatcher: `call_hooks(group, **kwargs)` — discovers and calls all registered hooks for a group |

### 15.4 Installing the Nginx Plugin

Upload `hostpanel-nginx-1.0.0.zip` via the Packages page and the server restarts automatically to load the plugin. After restart, the "Websites" and "SSL" nav items appear in the sidebar.

To uninstall: use the Packages page. If domains are still provisioned, the uninstall will be blocked (409). Use "Force Remove" to cascade-delete all associated domains, SSL certs, and vhosts before uninstalling.

### 15.5 nav_section Values

| Value | Where it appears in the nav |
|---|---|
| `hosting` | Under the "Hosting" section header (admin only) |
| `my_space` | Under the "My Space" section header (all users) |
| `security` | Under the "Security" section header (admin only) |
