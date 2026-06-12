---
name: hostpanel-plugin-manifest
description: Use when building, modifying, or debugging a HostPanel package plugin — Python manifest spec, nav_items, dashboard_blocks, needs_provisioning, the __hpkg_sdk no-build frontend pattern, sudoers rules, and the hp-chmod wrapper
---

# HostPanel Plugin Manifest

## Overview

Plugins are pip packages loaded via Python entry-points. They declare nav items and dashboard blocks in a `PLUGIN_MANIFEST` dict and ship a no-build JS frontend via `window.__hpkg_sdk`.

## Python Manifest

```python
PLUGIN_MANIFEST = {
    "nav_items": [{
        "nav_route":         "ftp",       # URL slug → /app/ftp
        "nav_label":         "FTP",
        "nav_icon":          "ftp",
        "nav_section":       "hosting",   # existing or new section key
        "nav_section_label": "Hosting",   # used only if section is new
        "nav_section_order": 10,          # sort order when section is created
        "admin_only":        True,
    }],
    "dashboard_blocks": [{
        "type":     "stat",               # "stat" | "widget"
        "label":    "FTP Accounts",
        "icon":     "ftp",
        "endpoint": "ftp/count",          # GET /cpanelapi/ftp/count → {"count": N}
        "size":     "sm",                 # "sm" | "lg"
    }],
    "needs_provisioning": True,           # shows domain provisioning modal after install
}
```

## Entry-Points (setup.cfg / pyproject.toml)

```ini
[options.entry_points]
hostpanel.modules          = hostpanel_ftp.router:router
hostpanel.hooks.on_startup = hostpanel_ftp.lifecycle:on_startup
hostpanel.lifecycle        = hostpanel_ftp.lifecycle
```

## Frontend (`main.js` — no build step)

```js
const { html, useState } = window.__hpkg_sdk;
const { useApi, useToast } = window.__hpkg_sdk.hooks;
const { SdkFormModal, SdkConfirmModal, SdkDataTable } = window.__hpkg_sdk.components;

function MyPlugin() {
    const [items, setItems] = useState([]);
    const api = useApi();
    return html`<div>...</div>`;
}

window.__hpkg_sdk.register('my-slug', MyPlugin);
```

File lives at `frontend/public/packages/{slug}/main.js` in the core repo.
Route: `/app/pkg/:slug` mounts it via `PackageShell`.

## Key Rules

- **No Vite/JSX** for packages — `sdk.html` (HTM tagged templates) only
- `dashboard_blocks` stat endpoint must return `{"count": N}`
- Nav sections created on demand when `nav_section` key is new
- `needs_provisioning: True` → post-install modal checks `domains/unprovisioned-zones` and lets user provision websites + optional SSL per domain
- Service file installation: use `sudo tee` (not `sudo cp`) — target dir is root-owned
- Sudoers rules covered by core hostpanel sudoers (mkdir, chmod, rm): don't duplicate them in package sudoers

## Lifecycle Hooks (`lifecycle.py`)

```python
def on_install():    ...  # setup dirs, install service, enable systemd unit
def on_update():     ...  # optional — migration logic on update (new version)
def on_startup():    ...  # called every API boot
def pre_uninstall(): ...  # cleanup before pip uninstall
```

Entry-points:
```ini
[options.entry_points]
hostpanel.modules          = hostpanel_ftp.router:router
hostpanel.hooks.on_startup = hostpanel_ftp.lifecycle:on_startup
hostpanel.lifecycle        = hostpanel_ftp.lifecycle
hostpanel.update           = hostpanel_ftp.lifecycle:on_update   # optional
```

`on_update()` is called after asset replacement, before server restart. If absent, update completes silently — conf/ preservation handles most cases.

## Package Registry

`/opt/hostpanel/packages.json` — written on every install and update. Do NOT write to this file manually; it is managed by the packages router.

```json
{
  "hostpanel-ftp": {
    "installed_at": "2026-05-20T10:00:00Z",
    "updated_at": null,
    "source": "https://github.com/.../hostpanel-ftp-1.0.0.zip",
    "source_type": "github_zip"
  }
}
```

`source_type`: `github_zip` | `pypi` | `upload`. Controls which update path is shown in the UI.

## Sudoers — chmod Rules

The core sudoers file at `scripts/ubuntu26_arm64/sudoers/hostpanel` does NOT enumerate individual chmod modes. Instead it relies on the `hp-chmod` wrapper for arbitrary modes:

```
# ── chmod wrapper (validates any octal mode — avoids enumerating every mode) ──
%hostpanel ALL=(root) NOPASSWD: /opt/hostpanel/bin/hp-chmod *
```

`/opt/hostpanel/bin/hp-chmod` (installed at server setup):
```bash
#!/bin/bash
set -euo pipefail
MODE="$1"
TARGET="$2"
if ! [[ "$MODE" =~ ^[0-7]{3,4}$ ]]; then
    echo "hp-chmod: invalid mode '$MODE'" >&2
    exit 1
fi
exec /usr/bin/chmod "$MODE" "$TARGET"
```

**Never add bare `sudo chmod <mode> *` rules for arbitrary modes** — use `hp-chmod`. Backend code pattern:

```python
r = subprocess.run(
    ["sudo", "-n", "/opt/hostpanel/bin/hp-chmod", oct(req.mode)[2:], str(p)],
    capture_output=True, check=False,
)
if r.returncode != 0:
    raise HTTPException(status_code=403, detail="Permission denied changing permissions.")
```

## Preact/HTM Controlled Input Pattern

When using HTM tagged templates with a numeric/text input that is derived from state, you **must** use a separate display-state variable — otherwise intermediate keystrokes trigger re-renders that reset the input value (snap-back bug).

```js
// WRONG — octal is always recomputed from perms, causing snap-back mid-type
const octal = permsToOctalStr(perms);
// html`<input value=${octal} ...>`

// CORRECT — separate input state that updates freely
const [octalInput, setOctalInput] = useState(() => octalStr(permsToOctal(perms)));

const handleOctalInput = (e) => {
    const val = e.target.value.replace(/[^0-7]/g, '').slice(0, 3);
    setOctalInput(val);            // update display immediately
    if (val.length === 3) {        // only sync back to perms state when complete
        const n = parseInt(val, 8);
        setPerms({ ur: !!(n & 0o400), ... });
    }
};
// html`<input value=${octalInput} onInput=${handleOctalInput} maxLength=${3}>`
```

This pattern applies to any controlled input in HTM/Preact where the displayed value passes through a transformation before being stored in state.
