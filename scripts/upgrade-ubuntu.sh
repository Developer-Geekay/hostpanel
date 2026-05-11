#!/bin/bash
# Upgrades Ubuntu server to 26.04 LTS "Resolute Raccoon"
# Run from project root: bash scripts/upgrade-ubuntu.sh [--force]
#
# --force  Use -d flag to upgrade before 26.04.1 point release (not recommended for production)
# Without --force, the script checks if 26.04 is officially promoted first.

set -e

KEY="guides/rpi_server/piserver.pem"
USER="geekay"
HOST="49.204.125.246"
SSH="ssh -i $KEY -o StrictHostKeyChecking=no $USER@$HOST"

FORCE=false
if [[ "$1" == "--force" ]]; then
    FORCE=true
fi

echo "==> Connecting to RPI server ($HOST)..."

echo "==> Checking current OS version..."
$SSH "lsb_release -a"

echo ""
echo "==> Checking for available upgrade..."
UPGRADE_CHECK=$($SSH "do-release-upgrade -c 2>&1" || true)
echo "$UPGRADE_CHECK"

if echo "$UPGRADE_CHECK" | grep -q "New release '26.04'"; then
    echo ""
    echo "==> Ubuntu 26.04 LTS is available via the stable upgrade path."
    echo "==> Starting upgrade..."
    $SSH "sudo apt update && sudo apt upgrade -y && sudo do-release-upgrade"

elif $FORCE; then
    echo ""
    echo "==> WARNING: 26.04 LTS is not yet officially promoted (point release pending ~July 2026)."
    echo "==> Proceeding with forced upgrade using -d flag..."
    echo ""
    read -rp "Are you sure you want to force the upgrade? (yes/no): " CONFIRM
    if [[ "$CONFIRM" != "yes" ]]; then
        echo "Aborted."
        exit 0
    fi
    $SSH "sudo apt update && sudo apt upgrade -y && sudo do-release-upgrade -d"

else
    echo ""
    echo "==> Ubuntu 26.04 LTS is not yet available on the stable upgrade channel."
    echo "    It was released on April 23, 2026 but the point release (26.04.1) is"
    echo "    expected around July 2026 before upgrades are officially promoted."
    echo ""
    echo "    Options:"
    echo "      - Wait until ~July 2026 and re-run this script."
    echo "      - Force upgrade now (not recommended for production):"
    echo "          bash scripts/upgrade-ubuntu.sh --force"
fi
