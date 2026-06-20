#!/usr/bin/env bash
# HostPanel — One-line installer for Ubuntu Server 26 LTS (and 22/24 LTS)
# Optimized for Local Development, Testing, and ARM64 / Raspberry Pi 5
# Run as root on your virtual machine.

set -euo pipefail

# ── Versions ──────────────────────────────────────────────────────────────────
PDNS_VERSION="4.9.3"

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
echo "  Self-hosted server control panel (Development & Testing Edition)"
echo "  Tailored for Ubuntu Server 26 LTS & Raspberry Pi 5"
echo ""

# ── Must run as root ──────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
    echo -e "${RED}Error: This installer must be run as root.${NC}"
    echo "  sudo bash install.sh"
    exit 1
fi

# ── Require Ubuntu 22.04/24.04/26.04 ─────────────────────────────────────────
if [[ -f /etc/os-release ]]; then
    . /etc/os-release
    if [[ "$ID" != "ubuntu" || ! "$VERSION_ID" =~ ^(22\.04|24\.04|26\.04|25\.05)$ ]]; then
        echo -e "${YELLOW}Warning: HostPanel is supported on Ubuntu 22.04 / 24.04 / 26.04 LTS.${NC}"
        echo "  Detected: $PRETTY_NAME"
        read -rp "  Continue anyway? [y/N]: " CONTINUE
        [[ "$CONTINUE" =~ ^[Yy]$ ]] || exit 1
    fi
fi

# =============================================================================
step "Configuration"
# =============================================================================

ENV_FILE_EXISTING="$INSTALL_ROOT/backend/.env"

if [[ -f "$ENV_FILE_EXISTING" ]]; then
    info "Found existing $ENV_FILE_EXISTING — loading configuration (skipping prompts)."
    _env() { grep -m1 "^${1}=" "$ENV_FILE_EXISTING" | cut -d= -f2-; }
    SERVER_IP=$(_env SERVER_IP)
    SERVER_DOMAIN=$(_env SERVER_DOMAIN)
    PANEL_SUBDOMAIN=$(_env PANEL_SUBDOMAIN)
    ADMIN_USER=$(_env DEFAULT_USERNAME)
    ADMIN_PASS=$(_env DEFAULT_PASSWORD)
    PDNS_NS1=$(_env PDNS_NS1)
    PDNS_NS2=$(_env PDNS_NS2)
    CERTBOT_EMAIL=$(_env CERTBOT_EMAIL)
    SECRET_KEY=$(_env SECRET_KEY)
    PANEL_SUBDOMAIN="${PANEL_SUBDOMAIN:-cpanel}"
    [[ -z "$SERVER_IP" ]] && error "SERVER_IP missing from existing .env — delete it and re-run to reconfigure."
    info "Loaded: IP=${SERVER_IP}  DOMAIN=${SERVER_DOMAIN:-<none>}  USER=${ADMIN_USER}"
else
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
fi

info "Configuration ready. Starting setup..."

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
    lua5.3 liblua5.3-dev || apt-get install -y -qq lua5.4 liblua5.4-dev

# Pre-seed postfix to avoid interactive prompts
echo "postfix postfix/main_mailer_type select Internet Site" | debconf-set-selections
echo "postfix postfix/mailname string $(hostname -f)"        | debconf-set-selections

apt-get install -y -qq \
    postfix postfix-sqlite \
    dovecot-core dovecot-imapd dovecot-pop3d \
    opendkim opendkim-tools

info "System packages ready."

# =============================================================================
step "2 / 8 — Directory structure"
# =============================================================================

mkdir -p "$INSTALL_ROOT"/{dns/{sbin,etc/pdns,var/lib,var/run},frontend,backend/logs,plugins,bin}
mkdir -p "$BUILD_TMP"

chown "$SERVICE_USER:$SERVICE_USER" "$INSTALL_ROOT"
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_ROOT/frontend"
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_ROOT/backend"
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_ROOT/plugins"
# bin/ stays root:root — contains privileged wrappers

info "Directories created."

# =============================================================================
step "3 / 8 — Initialize Python Environment (Architecture-Neutral)"
# =============================================================================

info "Setting up Python virtual environment..."
if [[ ! -d "$INSTALL_ROOT/backend/venv" ]]; then
    python3 -m venv "$INSTALL_ROOT/backend/venv"
fi

chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_ROOT/backend"
info "Python environment initialized at $INSTALL_ROOT/backend/venv."
info "FastAPI backend code will be deployed via your local deploy.sh."

# =============================================================================
step "4 / 8 — PowerDNS ${PDNS_VERSION}"
# =============================================================================

if [[ -f "$INSTALL_ROOT/dns/sbin/pdns_server" ]]; then
    warn "PowerDNS already built — skipping. Remove $INSTALL_ROOT/dns/sbin/pdns_server to rebuild."
else
    info "Downloading and compiling PowerDNS ${PDNS_VERSION}..."
    wget --show-progress -q "https://downloads.powerdns.com/releases/pdns-${PDNS_VERSION}.tar.bz2" -P "$BUILD_TMP"
    tar -xjf "$BUILD_TMP/pdns-${PDNS_VERSION}.tar.bz2" -C "$BUILD_TMP"
    cd "$BUILD_TMP/pdns-${PDNS_VERSION}"

    # Determine CPU core count for parallel make
    NPROC=$(nproc 2>/dev/null || echo 2)
    info "Compiling PowerDNS using ${NPROC} threads..."
    ./configure \
        --prefix="$INSTALL_ROOT/dns" \
        --with-modules=gsqlite3 \
        --without-dynmodules \
        --disable-lua-records \
        --disable-ixfrdist \
        2>&1 | tail -5

    make -j"${NPROC}" 2>&1 | tail -3
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
ExecStart=${INSTALL_ROOT}/backend/venv/bin/python main.py
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
step "6 / 8 — hostpanel group + core sudoers"
# =============================================================================

groupadd -f hostpanel
usermod -aG hostpanel "$SERVICE_USER"
info "User '${SERVICE_USER}' added to 'hostpanel' group."

cat > /etc/sudoers.d/hostpanel << 'SUDOERS'
# HostPanel core sudoers -- managed by install.sh
# Grants the 'hostpanel' group passwordless sudo for panel operations.

# -- Service management -------------------------------------------------------
%hostpanel ALL=(root) NOPASSWD: /usr/bin/systemctl daemon-reload
%hostpanel ALL=(root) NOPASSWD: /usr/bin/systemctl *
%hostpanel ALL=(root) NOPASSWD: /usr/bin/journalctl *

# -- File writes via stdin (replaces cp) --------------------------------------
%hostpanel ALL=(root) NOPASSWD: /usr/bin/tee *
%hostpanel ALL=(root) NOPASSWD: /usr/bin/cat *

# -- chmod by explicit mode (sudo 1.9.15+ forbids two-wildcard rules) ---------
%hostpanel ALL=(root) NOPASSWD: /usr/bin/chmod 600 *
%hostpanel ALL=(root) NOPASSWD: /usr/bin/chmod 640 *
%hostpanel ALL=(root) NOPASSWD: /usr/bin/chmod 644 *
%hostpanel ALL=(root) NOPASSWD: /usr/bin/chmod 440 *
%hostpanel ALL=(root) NOPASSWD: /usr/bin/chmod 700 *
%hostpanel ALL=(root) NOPASSWD: /usr/bin/chmod 750 *
%hostpanel ALL=(root) NOPASSWD: /usr/bin/chmod 755 *
%hostpanel ALL=(root) NOPASSWD: /usr/bin/chmod 777 *
%hostpanel ALL=(root) NOPASSWD: /usr/bin/chmod -R 755 *

# -- Directory / file management ----------------------------------------------
%hostpanel ALL=(root) NOPASSWD: /usr/bin/mkdir -p *
%hostpanel ALL=(root) NOPASSWD: /usr/bin/touch *
%hostpanel ALL=(root) NOPASSWD: /usr/bin/rm -f *
%hostpanel ALL=(root) NOPASSWD: /usr/bin/rm -rf *
%hostpanel ALL=(root) NOPASSWD: /usr/sbin/visudo -c -f *

# -- Ownership wrapper (chown -R with dynamic user) ---------------------------
%hostpanel ALL=(root) NOPASSWD: /opt/hostpanel/bin/hp-chown *

# -- chmod wrapper (validates any octal mode) ---------------------------------
%hostpanel ALL=(root) NOPASSWD: /opt/hostpanel/bin/hp-chmod *

# -- Linux hosting user management --------------------------------------------
%hostpanel ALL=(root) NOPASSWD: /usr/sbin/useradd *
%hostpanel ALL=(root) NOPASSWD: /usr/sbin/userdel *
%hostpanel ALL=(root) NOPASSWD: /usr/sbin/usermod *
%hostpanel ALL=(root) NOPASSWD: /usr/bin/chpasswd

# -- SSL (certbot) ------------------------------------------------------------
%hostpanel ALL=(root) NOPASSWD: /usr/bin/certbot *

# -- Mail (Postfix + Dovecot + OpenDKIM) --------------------------------------
%hostpanel ALL=(root) NOPASSWD: /usr/sbin/postconf *
%hostpanel ALL=(root) NOPASSWD: /usr/sbin/postmap *
%hostpanel ALL=(root) NOPASSWD: /usr/sbin/postfix *
%hostpanel ALL=(root) NOPASSWD: /usr/bin/doveadm *
%hostpanel ALL=(root) NOPASSWD: /usr/sbin/groupadd *
%hostpanel ALL=(root) NOPASSWD: /usr/sbin/opendkim-genkey *
SUDOERS

chmod 440 /etc/sudoers.d/hostpanel
visudo -cf /etc/sudoers.d/hostpanel
info "Core sudoers installed and validated."

# Install hp-chown — privileged wrapper so the panel can chown -R with a
# dynamic username without requiring a two-wildcard sudo rule.
cat > /opt/hostpanel/bin/hp-chown << 'HPCHOWN'
#!/bin/bash
# Usage (via sudo): hp-chown user:/absolute/path
set -euo pipefail
ARG="${1:-}"
if [[ ! "$ARG" =~ ^([^:]+):(.+)$ ]]; then
    echo "Usage: hp-chown user:/path" >&2; exit 1
fi
OWNER="${BASH_REMATCH[1]}"
TARGET="${BASH_REMATCH[2]}"
[[ "$TARGET" == /* ]] || { echo "Error: path must be absolute" >&2; exit 1; }
exec chown -R "${OWNER}:${OWNER}" "${TARGET}"
HPCHOWN
chmod 755 /opt/hostpanel/bin/hp-chown
chown root:root /opt/hostpanel/bin/hp-chown
info "Installed hp-chown wrapper."

# Install hp-chmod — validates an octal mode before running chmod, avoiding
# the need for a per-mode sudo rule for every possible mode value.
cat > /opt/hostpanel/bin/hp-chmod << 'HPCHMOD'
#!/bin/bash
# Usage (via sudo): hp-chmod <mode> <path>
set -euo pipefail
MODE="$1"
TARGET="$2"
if ! [[ "$MODE" =~ ^[0-7]{3,4}$ ]]; then
    echo "hp-chmod: invalid mode '$MODE'" >&2
    exit 1
fi
exec /usr/bin/chmod "$MODE" "$TARGET"
HPCHMOD
chmod 755 /opt/hostpanel/bin/hp-chmod
chown root:root /opt/hostpanel/bin/hp-chmod
info "Installed hp-chmod wrapper."

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

# systemd-resolved stub listener holds port 53 on Ubuntu by default — disable it
# so PowerDNS can bind. resolved still runs for outbound name resolution.
mkdir -p /etc/systemd/resolved.conf.d
echo -e "[Resolve]\nDNSStubListener=no" > /etc/systemd/resolved.conf.d/nostub.conf
ln -sf /run/systemd/resolve/resolv.conf /etc/resolv.conf
systemctl restart systemd-resolved
info "Disabled systemd-resolved stub listener on port 53."

info "Starting PowerDNS..."
systemctl start pdns || warn "PowerDNS failed to start — check: journalctl -u pdns"

if [[ -n "$SERVER_DOMAIN" ]]; then
    sleep 1  # give pdns a moment to bind
    info "Creating initial DNS zone for ${SERVER_DOMAIN}..."
    python3 - << PYEOF
import json, urllib.request, urllib.error

zone   = "${SERVER_DOMAIN}."
ns1    = "${PDNS_NS1}"; ns1 = ns1 if ns1.endswith('.') else ns1 + '.'
ns2    = "${PDNS_NS2}"; ns2 = ns2 if ns2.endswith('.') else ns2 + '.'
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
except urllib.error.URLError as e:
    print(f"[warn]  DNS API not reachable (pdns still starting?): {e.reason}")
    print(f"[warn]  Zone {zone} was not created — create it from the panel after deployment.")
PYEOF
fi

info "Note: The HostPanel API will fail to start until you run deploy.sh from your host."
info "This is expected as we run directly from your local repository source code."
info "Enabling API service anyway..."
systemctl enable hostpanel-api || true

# =============================================================================
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           HostPanel installer ready!                        ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "  Installer configuration completed successfully."
echo "  Now, from your development machine, configure and run:"
echo "    ./hostpanel/scripts/ubuntu26_arm64/deploy.sh"
echo ""
echo "  This will sync your local FastAPI backend & React frontend"
echo "  and start the services on your testing VM."
echo ""
