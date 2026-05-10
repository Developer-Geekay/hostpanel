#!/usr/bin/env bash
# HostPanel — Uninstaller
# Removes all HostPanel services, files, and config.
# Does NOT remove system packages installed as dependencies.
#
# Usage: sudo bash uninstall.sh

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

info()  { echo -e "${GREEN}[uninstall]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}      $*"; }
section(){ echo -e "\n${CYAN}▸ $*${NC}"; }

INSTALL_ROOT="/opt/hostpanel"

# ── Must run as root ──────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
    echo -e "${RED}Error: Run as root: sudo bash uninstall.sh${NC}"
    exit 1
fi

# ── Warning banner ────────────────────────────────────────────────────────────
echo ""
echo -e "${RED}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${RED}║              HostPanel Uninstaller                          ║${NC}"
echo -e "${RED}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "  This will permanently remove:"
echo "    • All HostPanel services (pdns, hostpanel-api, nginx, ftp)"
echo "    • /opt/hostpanel/ (panel, DNS data, backend, frontend)"
echo "    • /etc/systemd/system/pdns.service"
echo "    • /etc/systemd/system/hostpanel-*.service"
echo "    • /etc/sudoers.d/hostpanel"
echo ""
echo "  This will NOT remove:"
echo "    • System packages (python3, certbot, libboost, etc.)"
echo "    • Hosting user accounts and home directories (asked separately)"
echo "    • SSL certificates in /etc/letsencrypt (asked separately)"
echo ""
echo -e "${RED}  This action is irreversible.${NC}"
echo ""
read -rp "  Type YES to confirm uninstall: " CONFIRM
if [[ "$CONFIRM" != "YES" ]]; then
    echo "  Aborted."
    exit 0
fi

# ── Stop and disable services ─────────────────────────────────────────────────
section "Stopping services"

SERVICES=(pdns hostpanel-api hostpanel-nginx hostpanel-ftp)
for svc in "${SERVICES[@]}"; do
    if systemctl is-active "$svc" --quiet 2>/dev/null; then
        systemctl stop "$svc"
        info "Stopped $svc"
    fi
    if systemctl is-enabled "$svc" --quiet 2>/dev/null; then
        systemctl disable "$svc"
        info "Disabled $svc"
    fi
done

# ── Remove systemd service files ──────────────────────────────────────────────
section "Removing systemd service files"

rm -f /etc/systemd/system/pdns.service
rm -f /etc/systemd/system/hostpanel-*.service
systemctl daemon-reload
info "Service files removed."

# ── Remove sudoers ────────────────────────────────────────────────────────────
section "Removing sudoers"

if [[ -f /etc/sudoers.d/hostpanel ]]; then
    rm -f /etc/sudoers.d/hostpanel
    info "Removed /etc/sudoers.d/hostpanel"
else
    info "No sudoers entry found — skipping."
fi

# ── Remove /opt/hostpanel ─────────────────────────────────────────────────────
section "Removing /opt/hostpanel"

if [[ -d "$INSTALL_ROOT" ]]; then
    rm -rf "$INSTALL_ROOT"
    info "Removed $INSTALL_ROOT"
else
    info "$INSTALL_ROOT not found — skipping."
fi

rm -rf /tmp/hostpanel-build

# ── Hosting users ─────────────────────────────────────────────────────────────
section "Hosting users"

HOSTING_USERS=$(awk -F: '$3 >= 1000 && $3 < 65534 && $1 != "ubuntu" && $1 != "nobody" { print $1 }' /etc/passwd)

if [[ -z "$HOSTING_USERS" ]]; then
    info "No hosting users found."
else
    echo ""
    echo "  The following user accounts were found (UID 1000–65533, excluding system users):"
    echo "$HOSTING_USERS" | sed 's/^/    • /'
    echo ""
    warn "These may have been created by HostPanel for web hosting."
    read -rp "  Remove these users and their home directories? [y/N]: " DEL_USERS
    if [[ "$DEL_USERS" =~ ^[Yy]$ ]]; then
        while IFS= read -r user; do
            userdel -r "$user" 2>/dev/null && info "Removed user: $user" \
                || warn "Could not remove user: $user (may have active processes)"
        done <<< "$HOSTING_USERS"
    else
        info "Hosting users left intact."
    fi
fi

# ── SSL certificates ──────────────────────────────────────────────────────────
section "SSL certificates"

if [[ -d /etc/letsencrypt/live ]] && [[ -n "$(ls -A /etc/letsencrypt/live 2>/dev/null)" ]]; then
    echo ""
    echo "  SSL certificates found in /etc/letsencrypt/live:"
    ls /etc/letsencrypt/live | sed 's/^/    • /'
    echo ""
    read -rp "  Remove all Let's Encrypt certificates? [y/N]: " DEL_CERTS
    if [[ "$DEL_CERTS" =~ ^[Yy]$ ]]; then
        rm -rf /etc/letsencrypt
        info "Removed /etc/letsencrypt"
    else
        info "SSL certificates left intact."
    fi
else
    info "No SSL certificates found."
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           HostPanel uninstalled successfully.               ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "  Note: System packages installed as dependencies were not removed."
echo "  To remove them manually:"
echo "    apt-get remove --purge build-essential libboost-all-dev libsodium-dev lua5.3"
echo ""
