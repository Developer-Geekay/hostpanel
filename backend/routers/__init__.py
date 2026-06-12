"""
Routers Entrypoint Package

This module exposes and gathers all the core sub-routers of the HostPanel API
under one single package for seamless importing in the main `FastAPI` instance (`main.py`).

Sub-routers included:
- dashboard: system stats.
- users: hosting user management.
- ssh: ssh key authorization.
- databases: MySQL database management.
- files: remote/home folder file explorer.
- dns: PowerDNS zone/record mapping.
- ssl: Certbot certificate management.
- services: systemd services control.
- packages: core package & plugin installer.
"""
from .dashboard import router as dashboard_router
from .users import router as users_router
from .ssh import router as ssh_router
from .databases import router as databases_router
from .files import router as files_router
from .dns import router as dns_router
from .ssl import router as ssl_router
from .services import router as services_router
from .packages import router as packages_router
