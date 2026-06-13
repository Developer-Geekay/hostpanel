#!/bin/bash
# Backup HostPanel JSON data stores before SQLite migration.
# Run on the server: bash /opt/hostpanel/backend/scripts/backup_json.sh

set -euo pipefail

BACKUP_DIR="/opt/hostpanel/backups/json_$(date +%Y%m%d_%H%M%S)"
DATA_DIR="/opt/hostpanel"

mkdir -p "$BACKUP_DIR"

FILES=(
    "portal_users.json"
    "domains.json"
    "subdomains.json"
    "databases.json"
)

echo "Backing up JSON data to $BACKUP_DIR ..."
for f in "${FILES[@]}"; do
    src="$DATA_DIR/$f"
    if [ -f "$src" ]; then
        cp "$src" "$BACKUP_DIR/$f"
        echo "  ✓ $f"
    else
        echo "  - $f (not found, skipping)"
    fi
done

echo ""
echo "Backup complete: $BACKUP_DIR"
ls -lh "$BACKUP_DIR"
