#!/usr/bin/env bash
# HostPanel — One-line installer
# Run as root on a fresh Ubuntu 22.04 LTS server:
#   curl -fsSL https://raw.githubusercontent.com/Developer-Geekay/hostpanel/main/scripts/install.sh | sudo bash

set -euo pipefail

# ── Versions ──────────────────────────────────────────────────────────────────
PDNS_VERSION="4.9.3"
GITHUB_REPO="Developer-Geekay/hostpanel"

# ── Paths ─────────────────────────────────────────────────────────────────────
INSTALL_ROOT="/opt/hostpanel"
BUILD_TMP="/tmp/hostpanel-build"
SERVICE_USER="${SUDO_USER:-$(logname 2>/dev/null || whoami)}"

# ── Colors & helpers ──────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

info()  { echo -e "${GREEN}[setup]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
error() { echo -e "${RED}[error]${NC} $*"; exit 1; }
step()  { echo -e "\n${GREEN}══════════════════════════════════════════${NC}"; \
          echo -e "${GREEN}  $*${NC}"; \
          echo -e "${GREEN}══════════════════════════════════════════${NC}"; }

# ── Banner ────────────────────────────────────────────────────────────────────
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

# ── Must run as root ──────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
    echo -e "${RED}Error: This installer must be run as root.${NC}"
    echo "  sudo bash install.sh"
    exit 1
fi

# ── Require Ubuntu 22.04 ─────────────────────────────────────────────────────
if [[ -f /etc/os-release ]]; then
    . /etc/os-release
    if [[ "$ID" != "ubuntu" || "$VERSION_ID" != "22.04" ]]; then
        echo -e "${YELLOW}Warning: HostPanel is tested on Ubuntu 22.04 LTS.${NC}"
        echo "  Detected: $PRETTY_NAME"
        read -rp "  Continue anyway? [y/N]: " CONTINUE
        [[ "$CONTINUE" =~ ^[Yy]$ ]] || exit 1
    fi
fi

# =============================================================================
step "Configuration"
# =============================================================================

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
step "1 / 8 — System packages"
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
step "2 / 8 — Directory structure"
# =============================================================================

mkdir -p "$INSTALL_ROOT"/{dns/{sbin,etc/pdns,var/lib,var/run},frontend,backend/logs}
mkdir -p "$BUILD_TMP"

chown "$SERVICE_USER:$SERVICE_USER" "$INSTALL_ROOT"
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_ROOT/frontend"
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_ROOT/backend"

info "Directories created."

# =============================================================================
step "3 / 8 — Download latest release"
# =============================================================================

info "Fetching latest release from GitHub..."
RELEASE_API="https://api.github.com/repos/${GITHUB_REPO}/releases/latest"
LATEST_TAG=$(curl -fsSL "$RELEASE_API" | python3 -c "import json,sys; print(json.load(sys.stdin)['tag_name'])")
[[ -z "$LATEST_TAG" ]] && error "Could not determine latest release tag"
info "Latest release: ${LATEST_TAG}"

RELEASE_BASE="https://github.com/${GITHUB_REPO}/releases/download/${LATEST_TAG}"

info "Downloading frontend..."
curl -fsSL "${RELEASE_BASE}/frontend.tar.gz" -o "$BUILD_TMP/frontend.tar.gz"

info "Downloading backend..."
curl -fsSL "${RELEASE_BASE}/backend.tar.gz" -o "$BUILD_TMP/backend.tar.gz"

info "Extracting frontend..."
mkdir -p "$INSTALL_ROOT/frontend"
tar -xzf "$BUILD_TMP/frontend.tar.gz" -C "$INSTALL_ROOT/frontend"

info "Extracting backend binary..."
mkdir -p "$INSTALL_ROOT/backend"
tar -xzf "$BUILD_TMP/backend.tar.gz" -C "$INSTALL_ROOT/backend"
chmod +x "$INSTALL_ROOT/backend/hostpanel-api"

echo "$LATEST_TAG" > "$INSTALL_ROOT/version"
chown "$SERVICE_USER:$SERVICE_USER" "$INSTALL_ROOT/version"

info "Release ${LATEST_TAG} deployed."

# =============================================================================
step "4 / 8 — PowerDNS ${PDNS_VERSION}"
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
step "5 / 8 — systemd services"
# =============================================================================

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

cat > /etc/systemd/system/hostpanel-api.service << EOF
[Unit]
Description=HostPanel — API + Panel UI (port 2082)
After=network.target

[Service]
User=${SERVICE_USER}
WorkingDirectory=${INSTALL_ROOT}/backend
EnvironmentFile=${INSTALL_ROOT}/backend/.env
Environment=FRONTEND_DIR=${INSTALL_ROOT}/frontend
ExecStart=${INSTALL_ROOT}/backend/hostpanel-api
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable pdns
systemctl enable hostpanel-api

info "systemd services installed and enabled."

# =============================================================================
step "6 / 8 — Sudoers"
# =============================================================================

echo "${SERVICE_USER} ALL=(root) NOPASSWD: /usr/sbin/useradd, /usr/sbin/userdel, /usr/sbin/usermod, /usr/sbin/chpasswd, /usr/bin/mkdir, /usr/bin/chown, /usr/bin/chmod, /usr/bin/cp, /usr/bin/rm, /usr/bin/touch, /usr/bin/tee, /usr/bin/certbot, /usr/bin/pip3, /usr/bin/apt-get, /opt/hostpanel/nginx/sbin/nginx, /usr/bin/pure-pw, /usr/sbin/pure-ftpd, /opt/hostpanel/ftp/bin/pure-pw, /usr/bin/systemctl, /usr/bin/journalctl, /usr/bin/wg, /usr/bin/cat /etc/wireguard/*" > /etc/sudoers.d/hostpanel
chmod 440 /etc/sudoers.d/hostpanel
visudo -cf /etc/sudoers.d/hostpanel

info "Sudoers configured."

# =============================================================================
step "7 / 8 — Backend .env"
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
step "8 / 8 — Start services"
# =============================================================================

info "Starting PowerDNS..."
systemctl start pdns || warn "PowerDNS failed to start — check: journalctl -u pdns"

if [[ -n "$SERVER_DOMAIN" ]]; then
    sleep 1  # give pdns a moment to bind
    info "Creating initial DNS zone for ${SERVER_DOMAIN}..."
    python3 - << PYEOF
import json, urllib.request, urllib.error, sys

zone   = "${SERVER_DOMAIN}."
ns1    = "${PDNS_NS1}"
ns2    = "${PDNS_NS2}"
ip     = "${SERVER_IP}"
panel  = "${PANEL_SUBDOMAIN}"

payload = {
    "name": zone,
    "kind": "Native",
    "nameservers": [ns1, ns2],
    "rrsets": [
        {"name": zone, "type": "A", "ttl": 300, "changetype": "REPLACE",
         "records": [{"content": ip, "disabled": False}]},
        {"name": ns1,  "type": "A", "ttl": 300, "changetype": "REPLACE",
         "records": [{"content": ip, "disabled": False}]},
        {"name": ns2,  "type": "A", "ttl": 300, "changetype": "REPLACE",
         "records": [{"content": ip, "disabled": False}]},
        {"name": f"{panel}.{zone}", "type": "A", "ttl": 300, "changetype": "REPLACE",
         "records": [{"content": ip, "disabled": False}]},
    ]
}

req = urllib.request.Request(
    "http://127.0.0.1:8053/api/v1/servers/localhost/zones",
    data=json.dumps(payload).encode(),
    headers={"X-API-Key": "hostpanel-dns-api-key", "Content-Type": "application/json"},
    method="POST"
)
try:
    urllib.request.urlopen(req)
    print(f"[setup] Zone {zone} created — NS1, NS2, root A, {panel} A records added.")
except urllib.error.HTTPError as e:
    body = e.read().decode()
    if "already exists" in body.lower():
        print(f"[warn]  Zone {zone} already exists — skipping.")
    else:
        print(f"[warn]  Zone creation failed: {body}")
        sys.exit(0)  # non-fatal
PYEOF
fi

info "Starting hostpanel-api..."
systemctl start hostpanel-api || warn "hostpanel-api failed to start — check: journalctl -u hostpanel-api"

# =============================================================================
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           HostPanel setup complete!                         ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "  Installed version: ${LATEST_TAG}"
echo ""
echo "  Panel is at:  http://${SERVER_IP}:2082/"
echo ""
echo "  Install plugins via the Package Manager in the panel."
echo "  Reminder: Open ports 53, 2082 in your cloud firewall."
echo "  (80, 443, 21 are opened by plugins when installed)"
echo ""
echo "  Core service status:"
systemctl is-active pdns --quiet          && echo "    pdns:          running" || echo "    pdns:          stopped"
systemctl is-active hostpanel-api --quiet && echo "    hostpanel-api: running" || echo "    hostpanel-api: stopped"
