# HostPanel Packages

This directory contains reference implementations of official HostPanel plugins.

Each package is also published as a standalone GitHub repository so users can install only what they need.

## Available Packages

| Directory | PyPI / Git Name | Standalone Repo |
|---|---|---|
| `hostpanel_ftp/` | `hostpanel-ftp` | [hostpanel-package-ftp](https://github.com/Developer-Geekay/hostpanel-package-ftp) |
| `hostpanel_nginx/` | `hostpanel-nginx` | [hostpanel-package-nginx](https://github.com/Developer-Geekay/hostpanel-package-nginx) |

## Installing a Package

From the HostPanel UI (Package Manager), enter the Git URL:

```
https://github.com/Developer-Geekay/hostpanel-package-ftp.git
```

Or install manually in the backend virtualenv:

```bash
source /opt/hostpanel/backend/venv/bin/activate
pip install git+https://github.com/Developer-Geekay/hostpanel-package-ftp.git
sudo systemctl restart hostpanel-api
```

## Creating Your Own Package

See [dummy_plugin/](../dummy_plugin/) for a minimal plugin template with full comments, and [CONTRIBUTING.md](../CONTRIBUTING.md) for the development workflow.
