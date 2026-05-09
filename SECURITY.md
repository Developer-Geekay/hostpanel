# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| 1.x (current) | Yes |

---

## Reporting a Vulnerability

**Do NOT open a public GitHub issue for security vulnerabilities.**

Report security issues by email: **developergeekay@gmail.com**

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

Expected response time: within 72 hours.

---

## Security Model

HostPanel runs on your own server with full OS-level access. Key assumptions:

- **Port 2082** should be protected by a firewall or VPN in production — it serves the admin panel
- **`.env` file** contains secrets (JWT key, admin password) — keep it `chmod 600`
- **Sudoers rules** in `deployment/configs/sudoers-hostpanel` are pre-configured for minimum privilege — the service user only runs specific commands as root
- **PowerDNS API** (internal port 8053) must NOT be exposed publicly — it is bound to localhost by the setup script
- **Package installation** (`pip install`) runs as the service user — only install trusted packages from the Package Manager UI

---

## Known Limitations

- JWT tokens (default 24h expiry) are stored in localStorage — suitable for a control panel running on a private/VPN-protected port
- The panel has no rate limiting on login attempts — use a firewall rule to restrict access to port 2082
