# Contributing to HostPanel

Thank you for your interest in contributing. Here are the main ways you can help:

- **Bug reports** — open an issue using the Bug Report template
- **Feature requests** — open an issue using the Feature Request template
- **Plugin development** — create a new `hostpanel-package-*` repo
- **Core improvements** — submit a pull request to this repo

---

## Development Setup

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your local settings
python main.py
# API runs at http://localhost:8000
```

### Frontend

```bash
cd frontend
npm install
npm start
# Dev server at http://localhost:4200
# Proxies API calls to localhost:8000
```

---

## Creating a Plugin

1. Copy `dummy_plugin/` as your starting point
2. Rename it and update `setup.py` with your package name and entry points
3. Implement `plugin.py` (PLUGIN_MANIFEST + FastAPI router) and `lifecycle.py` (hooks)
4. Install in development mode: `pip install -e your_plugin/`
5. Restart the backend to load the plugin

See the [README](README.md#creating-a-plugin) and [packages/](packages/) for working examples.

---

## Pull Request Process

1. Fork the repo and create a feature branch: `git checkout -b feature/my-feature`
2. Test backend changes against a real Ubuntu 22.04 server (the plugin system requires actual system services)
3. Ensure `deployment/setup.sh` still works end-to-end if you changed any service integration
4. Submit a PR with a clear description of what changed and why

---

## Code Style

- **Backend:** PEP 8 (Black formatter recommended)
- **Frontend:** Angular style guide, Prettier (configured in package.json)
- **Comments:** only when the *why* is non-obvious — avoid explaining what the code does

---

## Reporting Security Issues

Do **not** open a public GitHub issue for security vulnerabilities. See [SECURITY.md](SECURITY.md).
