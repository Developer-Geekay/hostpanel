---
name: hostpanel-deployment
description: Use when deploying HostPanel core changes to the server — SSH key path, service name, build commands, SCP patterns, and common pitfalls
---

# HostPanel Deployment

## Server Details

- **Host:** `<SERVER_HOST>`
- **User:** `<SSH_USER>`
- **SSH key:** `<PATH_TO_PEM_KEY>`
- **SSH command:** `ssh -i <PATH_TO_PEM_KEY> <SSH_USER>@<SERVER_HOST>`
- **Portal:** `http://<SERVER_HOST>:2082`

> Fill in your actual values from memory or the server access notes. Never hardcode these in skill files.

## Systemd Service Names

| Service | Unit name |
|---|---|
| Backend API + UI | `hostpanel-api` |
| Nginx | `hostpanel-nginx` |
| WireGuard | `hostpanel-wireguard` |
| PowerDNS | `pdns` |

**Important:** The backend service is `hostpanel-api`, NOT `hostpanel-backend`.

## Deploy Backend Change

```bash
scp -i <PATH_TO_PEM_KEY> \
  backend/routers/packages.py \
  <SSH_USER>@<SERVER_HOST>:/opt/hostpanel/backend/routers/packages.py

ssh -i <PATH_TO_PEM_KEY> \
  <SSH_USER>@<SERVER_HOST> "sudo systemctl restart hostpanel-api"
```

## Deploy Frontend Change

Build first, then SCP all changed assets:

```bash
cd frontend && npm run build

# Deploy the main bundle + CSS + index.html (filenames change each build — check dist/assets/)
scp -i <PATH_TO_PEM_KEY> \
  frontend/dist/assets/index-*.js \
  frontend/dist/assets/index-*.css \
  frontend/dist/index.html \
  <SSH_USER>@<SERVER_HOST>:/opt/hostpanel/frontend/
```

Also deploy any page-specific chunks that changed (e.g. `Packages-*.js`, `Dns-*.js`). Vite hashes filenames on every build — the old hashed file stays on the server but the browser fetches the new one referenced in `index.html`.

No service restart needed for frontend-only changes — the API serves static files and `index.html` is updated in place.

## Deploy Plugin Package (hostpanel-package-*)

Plugin repos have no build step. Deploy directly via SCP:

```bash
# Backend Python files
scp -i <PATH_TO_PEM_KEY> \
  plugin/hostpanel_<slug>/*.py \
  <SSH_USER>@<SERVER_HOST>:/opt/hostpanel/backend/venv/lib/python3.14/site-packages/hostpanel_<slug>/

# Frontend JS
scp -i <PATH_TO_PEM_KEY> \
  frontend/main.js \
  <SSH_USER>@<SERVER_HOST>:/opt/hostpanel/frontend/packages/<slug>/main.js

# Restart to pick up Python changes
ssh -i <PATH_TO_PEM_KEY> <SSH_USER>@<SERVER_HOST> "sudo systemctl restart hostpanel-api"
```

Python version on server: **3.14** — path is `/opt/hostpanel/backend/venv/lib/python3.14/`.

## Write Files as Root (sudo tee)

`sudo cp` requires a two-wildcard sudoers rule (blocked by sudo 1.9.15+). Use `sudo tee` instead — it is already in the NOPASSWD list:

```python
content = open(src).read()
subprocess.run(["sudo", "tee", dst], input=content, text=True, capture_output=True, check=True)
subprocess.run(["sudo", "chmod", "644", dst], check=True)
```

## Sudoers Validation Before Installing

Always validate a new sudoers file before writing it to `/etc/sudoers.d/`:

```bash
sudo visudo -c -f /tmp/my-sudoers-file
```

Only write it if exit code is 0. This is already done in the `_process_zip` function in `packages.py`.

## Common Pitfalls

- **sudo TTY error over SSH:** `sudo: A terminal is required to authenticate` — happens with interactive sudo. Use `sudo -n` (non-interactive) and ensure the command is in the NOPASSWD list.
- **Chmod fails for non-whitelisted mode:** Don't add bare `chmod <mode> *` sudoers rules. Use the `hp-chmod` wrapper at `/opt/hostpanel/bin/hp-chmod`.
- **Directory execute bit:** Setting a home/web directory to mode `744` removes execute for group/others, making it untraversable by the API process. Default web dirs to `755`.
- **Service name:** Always `hostpanel-api`, not `hostpanel-backend`.
