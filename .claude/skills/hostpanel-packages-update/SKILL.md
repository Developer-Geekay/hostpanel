---
name: hostpanel-packages-update
description: Use when working on the Packages page update flow — check-update endpoint, version picker UI, available_versions array, and the update/upload paths
---

# HostPanel Packages — Update Flow

## Backend: `check-update` Endpoint

`GET /cpanelapi/packages/check-update/{package_name}`

For `github_zip` source type, fetches **all** GitHub releases (not just `/releases/latest`):

```python
api_url = f"https://api.github.com/repos/{owner}/{repo}/releases?per_page=50"
```

Filters to releases that are:
- Not draft, not prerelease
- Version strictly newer than the currently installed version (`packaging.version.Version`)

Returns an `available_versions` array sorted newest-first:

```json
{
  "checkable": true,
  "current_version": "1.0.5",
  "latest_version": "1.0.8",
  "has_update": true,
  "download_url": "https://github.com/.../hostpanel-files-1.0.8.zip",
  "tag": "v1.0.8",
  "release_notes": "...",
  "available_versions": [
    {
      "tag": "v1.0.8",
      "version": "1.0.8",
      "download_url": "https://github.com/.../hostpanel-files-1.0.8.zip",
      "release_notes": "Fixed chmod handling...",
      "published_at": "2026-06-10T12:00:00Z"
    },
    {
      "tag": "v1.0.7",
      "version": "1.0.7",
      "download_url": "https://github.com/.../hostpanel-files-1.0.7.zip",
      "release_notes": "Added copy/move...",
      "published_at": "2026-05-20T08:00:00Z"
    }
  ],
  "error": null
}
```

**Key:** `available_versions` is empty if already on latest; `has_update` is `false` in that case. `download_url` at the top level always points to the latest (first in array).

## Frontend: Version Picker

`Packages.tsx` — `checkState === 'available'` branch renders:

1. **Single version** — shows `current → latest` badge + release notes + "Update to vX.Y.Z" button. No picker.
2. **Multiple versions** — shows `current → selected` badge + scrollable radio-button list of all available versions (newest first, "latest" badge on first entry). User picks one, button updates to "Update to v{selected}".

State:
```typescript
const [selectedVersionTag, setSelectedVersionTag] = useState<string | null>(null);
```
Reset to `null` on every `handleCheckUpdate` call so the picker always defaults to latest.

Active version resolution:
```typescript
const versions = checkResult?.available_versions ?? [];
const activeTag = selectedVersionTag ?? versions[0]?.tag ?? null;
const activeVersion = versions.find(v => v.tag === activeTag) ?? versions[0];
```

On "Update Now":
```typescript
const selected = versions.find(v => v.tag === selectedVersionTag) ?? versions[0];
const downloadUrl = selected?.download_url ?? checkResult?.download_url;
```

## Update Endpoint

`POST /cpanelapi/packages/update` — accepts `{ package_name, source }` where `source` is the zip download URL. The endpoint downloads and installs the zip, then triggers a server restart via `background_tasks`.

## PyPI Packages

PyPI packages do **not** get `available_versions` — only a single `latest_version` is returned. The version picker is only shown for `github_zip` source type packages.

## "No zip" Warning

If a GitHub release exists but has no `.zip` asset, `download_url` is `null`. The UI shows a warning "No zip asset — use manual upload below" and hides the Update button for that version. User must use the manual upload section instead.

## Upload Update Path

`POST /cpanelapi/packages/update/upload` — multipart form with `file` + `package_name`. Reads pre/post version from pip metadata, returns `{ previous_version, new_version, is_upgrade }`. Does NOT use `available_versions`.
