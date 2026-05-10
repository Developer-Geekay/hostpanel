#!/usr/bin/env bash
# HostPanel — One-line installer
# Run as root on a fresh Ubuntu 22.04 LTS server:
#   curl -fsSL https://raw.githubusercontent.com/Developer-Geekay/hostpanel/main/install.sh | sudo bash

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}"
echo "  _   _           _   ____                  _"
echo " | | | | ___  ___| |_|  _ \ __ _ _ __   ___| |"
echo " | |_| |/ _ \/ __| __| |_) / _\` | '_ \ / _ \ |"
echo " |  _  | (_) \__ \ |_|  __/ (_| | | | |  __/ |"
echo " |_| |_|\___/|___/\__|_|   \__,_|_| |_|\___|_|"
echo -e "${NC}"
echo "  Self-hosted server control panel"
echo "  https://github.com/Developer-Geekay/hostpanel"
echo ""

# Must run as root
if [[ $EUID -ne 0 ]]; then
    echo -e "${RED}Error: This installer must be run as root.${NC}"
    echo "  sudo bash install.sh"
    exit 1
fi

# Require Ubuntu 22.04
if [[ -f /etc/os-release ]]; then
    . /etc/os-release
    if [[ "$ID" != "ubuntu" || "$VERSION_ID" != "22.04" ]]; then
        echo -e "${YELLOW}Warning: HostPanel is tested on Ubuntu 22.04 LTS.${NC}"
        echo "  Detected: $PRETTY_NAME"
        read -rp "  Continue anyway? [y/N]: " CONTINUE
        [[ "$CONTINUE" =~ ^[Yy]$ ]] || exit 1
    fi
fi

TMPDIR=$(mktemp -d)
SETUP_URL="https://raw.githubusercontent.com/Developer-Geekay/hostpanel/main/deployment/setup.sh"

echo "Downloading setup script..."
if command -v curl &>/dev/null; then
    curl -fsSL "$SETUP_URL" -o "$TMPDIR/setup.sh"
elif command -v wget &>/dev/null; then
    wget -q "$SETUP_URL" -O "$TMPDIR/setup.sh"
else
    echo -e "${RED}Error: curl or wget is required.${NC}"
    exit 1
fi

chmod +x "$TMPDIR/setup.sh"
bash "$TMPDIR/setup.sh"
rm -rf "$TMPDIR"
