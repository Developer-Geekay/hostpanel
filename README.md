# HostPanel

A self-hosted server control panel for managing Linux hosting services — domains, DNS, FTP, SSL, databases, and more.

![Python](https://img.shields.io/badge/Python-3.10%2B-blue) ![Angular](https://img.shields.io/badge/Angular-21-red) ![License](https://img.shields.io/badge/License-MIT-green) ![Ubuntu](https://img.shields.io/badge/Ubuntu-22.04%20LTS-orange)

---

## Features

| Feature | Description |
|---|---|
| Web Server Management | Add domains and subdomains; auto-provisions Nginx virtual hosts |
| DNS Management | PowerDNS-backed authoritative DNS with zone and record CRUD |
| SSL / HTTPS | Let's Encrypt certificate issuance with force-HTTPS toggle |
| FTP Accounts | PureFTPd virtual users with per-user home directories |
| File Manager | Web-based file browser restricted to each user's home |
| MySQL Databases | Create and delete MySQL 8 databases and users |
| SSH Keys | Upload and remove authorized keys per Linux user |
| Service Manager | Start, stop, and restart services from the UI |
| Plugin System | Install packages via pip; hot-reload via systemd restart |
| Multi-user RBAC | Admin and standard user roles with tenant isolation |

---

## Architecture

```
Port 2082  →  FastAPI backend + Angular SPA (panel UI)
Port 80    →  Nginx (hosted sites only)
Port 443   →  Nginx + Let's Encrypt SSL
Port 21    →  PureFTPd (FTP control)
Port 53    →  PowerDNS (authoritative DNS)
```

All services are built from source into `/opt/hostpanel/` — they do not conflict with any system-installed packages.

---

## Quick Install

Requires a fresh **Ubuntu 22.04 LTS** server.

```bash
# 1. Copy the setup script to your server
scp deployment/setup.sh ubuntu@<your-server-ip>:/tmp/

# 2. Run it on the server (builds everything from source, ~15 minutes)
ssh ubuntu@<your-server-ip> "chmod +x /tmp/setup.sh && sudo /tmp/setup.sh"

# 3. Edit deploy.sh with your server IP and SSH key path, then run it
#    from your local machine to deploy the panel
cd deployment && ./deploy.sh
```

The panel will be available at `http://<your-server-ip>:2082/`.

For a full walkthrough including DNS configuration, Let's Encrypt SSL, and firewall rules, see [deployment/SETUP.md](deployment/SETUP.md).

---

## Plugin Ecosystem

HostPanel uses a Python entry-point plugin system. Install packages via pip or directly from the Package Manager UI inside the panel.

| Package | Description | Repo |
|---|---|---|
| hostpanel-ftp | FTP account management via PureFTPd | [hostpanel-package-ftp](https://github.com/Developer-Geekay/hostpanel-package-ftp) |
| hostpanel-nginx | Web hosting, domains, redirects via Nginx | [hostpanel-package-nginx](https://github.com/Developer-Geekay/hostpanel-package-nginx) |
| hostpanel-filemanager | Web-based file manager | [hostpanel-package-filemanager](https://github.com/Developer-Geekay/hostpanel-package-filemanager) |
| hostpanel-mysql | MySQL database provisioning | [hostpanel-package-mysql](https://github.com/Developer-Geekay/hostpanel-package-mysql) |
| hostpanel-mongodb | MongoDB database provisioning | [hostpanel-package-mongodb](https://github.com/Developer-Geekay/hostpanel-package-mongodb) |
| hostpanel-php | PHP-FPM integration | [hostpanel-package-php](https://github.com/Developer-Geekay/hostpanel-package-php) |
| hostpanel-nodejs | Node.js app hosting | [hostpanel-package-nodejs](https://github.com/Developer-Geekay/hostpanel-package-nodejs) |

---

## Creating a Plugin

Copy `dummy_plugin/` as your starting point. A plugin needs three files:

**`setup.py`** — registers entry points:
```python
setup(
    name="hostpanel-myplugin",
    version="1.0.0",
    entry_points={
        "hostpanel.modules": ["myplugin = hostpanel_myplugin.plugin"],
        "hostpanel.lifecycle": ["hostpanel-myplugin = hostpanel_myplugin.lifecycle:pre_uninstall"],
    },
)
```

**`plugin.py`** — declares the manifest and FastAPI router:
```python
PLUGIN_MANIFEST = {
    "nav_items": [{
        "nav_route": "myplugin",
        "nav_label": "My Plugin",
        "nav_icon": "extension",
        "nav_section": "my_space",
        "admin_only": False,
    }]
}
router = APIRouter()
```

**`lifecycle.py`** — implements hooks (pre-uninstall, on_startup, user_delete, etc.):
```python
def pre_uninstall(force: bool = False):
    pass  # cleanup logic here
```

Install during development:
```bash
pip install -e packages/hostpanel_myplugin/
```

See [dummy_plugin/](dummy_plugin/) and [packages/](packages/) for complete working examples.

---

## System Requirements

- Ubuntu 22.04 LTS (fresh install recommended)
- 1 GB RAM minimum, 10 GB disk
- Open ports: 22, 80, 443, 2082, 21, 40000–40100, 53

---

## Documentation

- [Full Setup Guide](deployment/SETUP.md) — manual setup, services, DNS, troubleshooting
- [ARM64 / Raspberry Pi Build](deployment/BUILD_GUIDE.md) — portable zero-dependency binary
- [Plugin Development](dummy_plugin/) — example plugin template
- [Reference Plugins](packages/) — FTP and Nginx plugin source

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

MIT — see [LICENSE](LICENSE).
