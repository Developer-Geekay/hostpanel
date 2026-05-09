#!/bin/bash
set -euo pipefail

# =============================================================================
# HostPanel — Fresh Server Setup Script
# Ubuntu 22.04 LTS (also tested on Ubuntu 25.x / ARM64)
#
# Installs core infrastructure only:
#   - PowerDNS 4.9.3 with gsqlite3 (source build → /opt/hostpanel/dns)
#   - certbot (Let's Encrypt, via apt)
#   - hostpanel-api systemd service (FastAPI backend, port 2082)
#
# Web hosting (Nginx), FTP, MySQL, etc. are plugins — install via Package Manager.
#
# Usage:
#   chmod +x setup.sh && sudo ./setup.sh
#
# After this script, run deploy.sh from your LOCAL machine to push the code.
# =============================================================================

# ── Versions ──────────────────────────────────────────────────────────────────
PDNS_VERSION="4.9.3"

# ── Paths ─────────────────────────────────────────────────────────────────────
INSTALL_ROOT="/opt/hostpanel"
BUILD_TMP="/tmp/hostpanel-build"
SERVICE_USER="${SUDO_USER:-$(logname 2>/dev/null || whoami)}"

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

info()  { echo -e "${GREEN}[setup]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
error() { echo -e "${RED}[error]${NC} $*"; exit 1; }
step()  { echo -e "\n${GREEN}══════════════════════════════════════════${NC}"; \
          echo -e "${GREEN}  $*${NC}"; \
          echo -e "${GREEN}══════════════════════════════════════════${NC}"; }

# ── Must run as root ──────────────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && error "Run as root: sudo ./setup.sh"

# ── Collect config up front ───────────────────────────────────────────────────
step "Configuration"

DETECTED_IP=$(curl -s --max-time 5 https://api.ipify.org 2>/dev/null \
    || curl -s --max-time 5 https://ifconfig.me 2>/dev/null \
    || hostname -I | awk '{print $1}')
read -rp "Server public IP address [${DETECTED_IP}]: " SERVER_IP
SERVER_IP="${SERVER_IP:-$DETECTED_IP}"
[[ -z "$SERVER_IP" ]] && error "SERVER_IP is required"

read -rp "Server domain (e.g. example.com, or press Enter to use IP only): " SERVER_DOMAIN
SERVER_DOMAIN="${SERVER_DOMAIN:-}"

read -rp "Panel subdomain [cpanel]: " PANEL_SUBDOMAIN
PANEL_SUBDOMAIN="${PANEL_SUBDOMAIN:-cpanel}"

read -rp "Admin username [admin]: " ADMIN_USER
ADMIN_USER="${ADMIN_USER:-admin}"

read -rsp "Admin password: " ADMIN_PASS; echo
[[ ${#ADMIN_PASS} -lt 8 ]] && error "Admin password must be at least 8 characters"

read -rp "PowerDNS NS1 FQDN (e.g. ns1.example.com.): " PDNS_NS1
read -rp "PowerDNS NS2 FQDN (e.g. ns2.example.com.): " PDNS_NS2
read -rp "Let's Encrypt / certbot email: " CERTBOT_EMAIL

SECRET_KEY=$(openssl rand -hex 32)

info "Configuration collected. Starting setup..."

# =============================================================================
step "1 / 7 — System packages"
# =============================================================================

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
    build-essential curl wget git unzip \
    python3 python3-pip python3-venv \
    libssl-dev \
    libboost-all-dev libsqlite3-dev libsodium-dev \
    pkg-config g++ make autoconf automake libtool \
    certbot \
    sqlite3 \
    lua5.3 liblua5.3-dev

info "System packages ready."

# =============================================================================
step "2 / 7 — Directory structure"
# =============================================================================

mkdir -p "$INSTALL_ROOT"/{dns/{sbin,etc/pdns,var/lib,var/run},frontend,backend/logs}
mkdir -p "$BUILD_TMP"

chown "$SERVICE_USER:$SERVICE_USER" "$INSTALL_ROOT"
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_ROOT/frontend"
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_ROOT/backend"

info "Directories created."

# =============================================================================
step "3 / 7 — PowerDNS ${PDNS_VERSION}"
# =============================================================================

if [[ -f "$INSTALL_ROOT/dns/sbin/pdns_server" ]]; then
    warn "PowerDNS already built — skipping. Remove $INSTALL_ROOT/dns/sbin/pdns_server to rebuild."
else
    info "Downloading PowerDNS ${PDNS_VERSION}..."
    wget --show-progress -q "https://downloads.powerdns.com/releases/pdns-${PDNS_VERSION}.tar.bz2" -P "$BUILD_TMP"
    tar -xjf "$BUILD_TMP/pdns-${PDNS_VERSION}.tar.bz2" -C "$BUILD_TMP"
    cd "$BUILD_TMP/pdns-${PDNS_VERSION}"

    info "Compiling PowerDNS (this takes ~5 minutes)..."
    ./configure \
        --prefix="$INSTALL_ROOT/dns" \
        --with-modules=gsqlite3 \
        --without-dynmodules \
        --disable-lua-records \
        --disable-ixfrdist \
        2>&1 | tail -5

    make -j"$(nproc)" 2>&1 | tail -3
    make install

    info "PowerDNS ${PDNS_VERSION} installed."
fi

# SQLite schema (idempotent)
PDNS_DB="$INSTALL_ROOT/dns/var/lib/pdns.sqlite3"
if [[ ! -f "$PDNS_DB" ]]; then
    info "Creating PowerDNS SQLite database..."
    sqlite3 "$PDNS_DB" << 'SQLEOF'
CREATE TABLE IF NOT EXISTS domains (
  id INTEGER PRIMARY KEY, name VARCHAR(255) NOT NULL,
  master VARCHAR(128) DEFAULT NULL, last_check INT DEFAULT NULL,
  type VARCHAR(8) NOT NULL, notified_serial INT DEFAULT NULL,
  account VARCHAR(40) DEFAULT NULL, options VARCHAR(64765) DEFAULT NULL,
  catalog VARCHAR(255) DEFAULT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS name_index ON domains(name);

CREATE TABLE IF NOT EXISTS records (
  id INTEGER PRIMARY KEY, domain_id INT DEFAULT NULL,
  name VARCHAR(255) DEFAULT NULL, type VARCHAR(10) DEFAULT NULL,
  content VARCHAR(65535) DEFAULT NULL, ttl INT DEFAULT NULL,
  prio INT DEFAULT NULL, disabled BOOL DEFAULT '0',
  ordername VARCHAR(255), auth BOOL DEFAULT '1'
);
CREATE INDEX IF NOT EXISTS records_lookup ON records(name, type);
CREATE INDEX IF NOT EXISTS records_domain ON records(domain_id);

CREATE TABLE IF NOT EXISTS supermasters (
  ip VARCHAR(64) NOT NULL, nameserver VARCHAR(255) NOT NULL,
  account VARCHAR(40) NOT NULL, PRIMARY KEY(ip, nameserver)
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY, domain_id INT NOT NULL,
  name VARCHAR(255) NOT NULL, type VARCHAR(10) NOT NULL,
  modified_at INT NOT NULL, account VARCHAR(40) DEFAULT NULL,
  comment VARCHAR(65535) NOT NULL
);

CREATE TABLE IF NOT EXISTS domainmetadata (
  id INTEGER PRIMARY KEY,
  domain_id INT REFERENCES domains(id) ON DELETE CASCADE,
  kind VARCHAR(32), content TEXT
);

CREATE TABLE IF NOT EXISTS cryptokeys (
  id INTEGER PRIMARY KEY,
  domain_id INT REFERENCES domains(id) ON DELETE CASCADE,
  flags INT NOT NULL, active BOOL, published BOOL DEFAULT 1, content TEXT
);

CREATE TABLE IF NOT EXISTS tsigkeys (
  id INTEGER PRIMARY KEY, name VARCHAR(255),
  algorithm VARCHAR(50), secret VARCHAR(255), UNIQUE(name, algorithm)
);
SQLEOF
    info "PowerDNS database created."
fi

mkdir -p "$INSTALL_ROOT/dns/etc/pdns"
cat > "$INSTALL_ROOT/dns/etc/pdns/pdns.conf" << PDNSCONF
launch=gsqlite3
gsqlite3-database=$INSTALL_ROOT/dns/var/lib/pdns.sqlite3

local-address=0.0.0.0
local-port=53

api=yes
api-key=hostpanel-dns-api-key
webserver=yes
webserver-address=127.0.0.1
webserver-port=8053
webserver-allow-from=127.0.0.1

primary=yes
default-soa-content=ns1.@ hostmaster.@ 0 10800 3600 604800 3600

socket-dir=$INSTALL_ROOT/dns/var/run

loglevel=4
PDNSCONF

info "PowerDNS configured."

# =============================================================================
step "4 / 7 — systemd services"
# =============================================================================

# pdns
cat > /etc/systemd/system/pdns.service << 'EOF'
[Unit]
Description=HostPanel DNS Server (PowerDNS)
After=network.target

[Service]
ExecStart=/opt/hostpanel/dns/sbin/pdns_server --config-dir=/opt/hostpanel/dns/etc/pdns
Restart=on-failure
User=root

[Install]
WantedBy=multi-user.target
EOF

# hostpanel-api — user service (no sudo needed for deploy restarts)
loginctl enable-linger "$SERVICE_USER"
USER_SYSTEMD_DIR="/home/${SERVICE_USER}/.config/systemd/user"
mkdir -p "$USER_SYSTEMD_DIR"
cat > "$USER_SYSTEMD_DIR/hostpanel-api.service" << EOF
[Unit]
Description=HostPanel — API + Panel UI (port 2082)
After=network.target

[Service]
WorkingDirectory=${INSTALL_ROOT}/backend
EnvironmentFile=${INSTALL_ROOT}/backend/.env
Environment=FRONTEND_DIR=${INSTALL_ROOT}/frontend
ExecStart=${INSTALL_ROOT}/backend/venv/bin/python main.py
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
EOF
chown -R "${SERVICE_USER}:${SERVICE_USER}" "$USER_SYSTEMD_DIR"

systemctl daemon-reload
systemctl enable pdns

# Enable user service as the service user
su - "$SERVICE_USER" -c "
    export XDG_RUNTIME_DIR=/run/user/\$(id -u)
    systemctl --user daemon-reload
    systemctl --user enable hostpanel-api
"

info "systemd services installed and enabled."

# =============================================================================
step "5 / 7 — Sudoers"
# =============================================================================

echo "${SERVICE_USER} ALL=(root) NOPASSWD: /usr/sbin/useradd, /usr/sbin/userdel, /usr/sbin/usermod, /usr/sbin/chpasswd, /bin/mkdir, /bin/chown, /bin/chmod, /bin/rm, /usr/bin/certbot, /usr/bin/pip3, /usr/bin/systemctl start hostpanel-*, /usr/bin/systemctl stop hostpanel-*, /usr/bin/systemctl restart hostpanel-*, /usr/bin/systemctl reload hostpanel-*, /usr/bin/systemctl start pdns, /usr/bin/systemctl stop pdns, /usr/bin/systemctl restart pdns, /usr/bin/systemctl is-active *, /usr/bin/journalctl" > /etc/sudoers.d/hostpanel
chmod 440 /etc/sudoers.d/hostpanel
visudo -cf /etc/sudoers.d/hostpanel

info "Sudoers configured."

# =============================================================================
step "6 / 7 — Backend .env"
# =============================================================================

ENV_FILE="$INSTALL_ROOT/backend/.env"

if [[ -f "$ENV_FILE" ]]; then
    warn ".env already exists — not overwriting. Edit manually if needed: $ENV_FILE"
else
    cat > "$ENV_FILE" << EOF
ENVIRONMENT=production
SECRET_KEY=${SECRET_KEY}
ACCESS_TOKEN_EXPIRE_MINUTES=1440
DEFAULT_USERNAME=${ADMIN_USER}
DEFAULT_PASSWORD=${ADMIN_PASS}
FRONTEND_URLS=http://${SERVER_IP}:2082
PDNS_API_KEY=hostpanel-dns-api-key
PDNS_NS1=${PDNS_NS1:-ns1.example.com.}
PDNS_NS2=${PDNS_NS2:-ns2.example.com.}
CERTBOT_EMAIL=${CERTBOT_EMAIL:-admin@example.com}
SERVER_DOMAIN=${SERVER_DOMAIN:-}
SERVER_IP=${SERVER_IP}
PANEL_PORT=2082
PANEL_SUBDOMAIN=${PANEL_SUBDOMAIN:-cpanel}
EOF
    chmod 600 "$ENV_FILE"
    chown "$SERVICE_USER:$SERVICE_USER" "$ENV_FILE"
    info ".env written to $ENV_FILE"
fi

# =============================================================================
step "7 / 7 — Start services"
# =============================================================================

info "Starting PowerDNS..."
systemctl start pdns || warn "PowerDNS failed to start — check: journalctl -u pdns"

info "hostpanel-api will start automatically after deploy.sh is run."

# =============================================================================
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           HostPanel core setup complete!                    ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "  Next step: push the code from your LOCAL machine:"
echo "    cd deployment && ./deploy.sh"
echo ""
echo "  After deploy, the panel is at:"
echo "    http://${SERVER_IP}:2082/"
echo ""
echo "  Then install plugins via the Package Manager in the panel."
echo "  Reminder: Open ports 53, 2082 in your cloud firewall."
echo "  (80, 443, 21 are opened by plugins when installed)"
echo ""
echo "  Core service status:"
systemctl is-active pdns --quiet && echo "    pdns: running" || \
    systemctl status pdns --no-pager --lines=3 2>/dev/null || true
