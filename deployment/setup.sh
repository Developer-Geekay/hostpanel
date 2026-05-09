#!/bin/bash
set -euo pipefail

# =============================================================================
# HostPanel — Fresh Server Setup Script
# Ubuntu 22.04 LTS
#
# Builds and configures:
#   - Nginx 1.26.x (custom source build → /opt/hostpanel/nginx)
#   - PowerDNS 4.9.3 with gsqlite3 (custom source build → /opt/hostpanel/dns)
#   - PureFTPd 1.0.49 (custom source build → /opt/hostpanel/ftp)
#   - MySQL 8.x (apt)
#   - HostPanel backend (FastAPI, port 2082)
#
# Usage:
#   chmod +x setup.sh && sudo ./setup.sh
#
# After this script, run deploy.sh from your LOCAL machine to push the code.
# =============================================================================

# ── Versions ──────────────────────────────────────────────────────────────────
NGINX_VERSION="1.26.3"
PDNS_VERSION="4.9.3"
PUREFTPD_VERSION="1.0.49"

# ── Paths ─────────────────────────────────────────────────────────────────────
INSTALL_ROOT="/opt/hostpanel"
BUILD_TMP="/tmp/hostpanel-build"
SERVICE_USER="ubuntu"

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

read -rp "Server public IP address: " SERVER_IP
[[ -z "$SERVER_IP" ]] && error "SERVER_IP is required"

read -rp "Server domain (e.g. panel.yourdomain.com, or press Enter to use IP only): " SERVER_DOMAIN
SERVER_DOMAIN="${SERVER_DOMAIN:-}"

read -rp "Panel subdomain [cpanel]: " PANEL_SUBDOMAIN
PANEL_SUBDOMAIN="${PANEL_SUBDOMAIN:-cpanel}"

read -rp "Admin username [admin]: " ADMIN_USER
ADMIN_USER="${ADMIN_USER:-admin}"

read -rsp "Admin password: " ADMIN_PASS; echo
[[ ${#ADMIN_PASS} -lt 8 ]] && error "Admin password must be at least 8 characters"

read -rp "PowerDNS NS1 FQDN (e.g. ns1.example.com.): " PDNS_NS1
read -rp "PowerDNS NS2 FQDN (e.g. ns2.example.com.): " PDNS_NS2
read -rp "Let's Encrypt email: " CERTBOT_EMAIL

SECRET_KEY=$(openssl rand -hex 32)

info "Configuration collected. Starting setup..."

# =============================================================================
step "1 / 9 — System packages"
# =============================================================================

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
    build-essential curl wget git unzip \
    python3 python3-pip python3-venv \
    libssl-dev libpcre3-dev zlib1g-dev \
    libboost-all-dev libsqlite3-dev libsodium-dev \
    pkg-config g++ make autoconf automake libtool \
    default-libmysqlclient-dev \
    certbot \
    sqlite3 \
    lua5.3 liblua5.3-dev

# Node.js 20 LTS (for local builds — not needed on server, but useful for future use)
if ! command -v node &>/dev/null; then
    info "Installing Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
    apt-get install -y -qq nodejs
fi

# MySQL
if ! command -v mysqld &>/dev/null; then
    info "Installing MySQL..."
    apt-get install -y -qq mysql-server
    systemctl enable mysql
    systemctl start mysql
fi

info "System packages ready."

# =============================================================================
step "2 / 9 — Directory structure"
# =============================================================================

mkdir -p "$INSTALL_ROOT"/{nginx/{sbin,conf,vhosts,logs},ftp/{sbin,bin,etc},dns/{sbin,etc/pdns,var/lib},frontend,backend/logs}
mkdir -p "$BUILD_TMP"

# Backend dir must be owned by service user; config files by root until deploy
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_ROOT/frontend"
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_ROOT/backend"
chown "$SERVICE_USER:$SERVICE_USER" "$INSTALL_ROOT/nginx/vhosts"
chown "$SERVICE_USER:$SERVICE_USER" "$INSTALL_ROOT/nginx/logs"

info "Directories created."

# =============================================================================
step "3 / 9 — Nginx ${NGINX_VERSION}"
# =============================================================================

if [[ -f "$INSTALL_ROOT/nginx/sbin/nginx" ]]; then
    warn "Nginx already built — skipping. Remove $INSTALL_ROOT/nginx/sbin/nginx to rebuild."
else
    info "Downloading Nginx ${NGINX_VERSION}..."
    wget -q "https://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz" -P "$BUILD_TMP"
    tar -xzf "$BUILD_TMP/nginx-${NGINX_VERSION}.tar.gz" -C "$BUILD_TMP"
    cd "$BUILD_TMP/nginx-${NGINX_VERSION}"

    info "Compiling Nginx..."
    ./configure \
        --prefix="$INSTALL_ROOT/nginx" \
        --with-http_ssl_module \
        --with-http_v2_module \
        --with-http_realip_module \
        --with-http_stub_status_module \
        --with-stream \
        --with-stream_ssl_module \
        --error-log-path="$INSTALL_ROOT/nginx/logs/error.log" \
        --access-log-path="$INSTALL_ROOT/nginx/logs/access.log" \
        --pid-path="$INSTALL_ROOT/nginx/logs/nginx.pid" \
        2>&1 | tail -5

    make -j"$(nproc)" 2>&1 | tail -3
    make install

    info "Nginx ${NGINX_VERSION} installed at $INSTALL_ROOT/nginx/sbin/nginx"
fi

# Write nginx.conf
cat > "$INSTALL_ROOT/nginx/conf/nginx.conf" << 'NGINXCONF'
user root;
worker_processes auto;

events {
    worker_connections 1024;
}

http {
    include       mime.types;
    default_type  application/octet-stream;
    sendfile      on;
    keepalive_timeout 65;

    include /opt/hostpanel/nginx/vhosts/*.conf;

    server {
        listen 80 default_server;
        listen [::]:80 default_server;
        server_name _;
        return 444;
    }
}
NGINXCONF

info "Nginx configured."

# =============================================================================
step "4 / 9 — PowerDNS ${PDNS_VERSION}"
# =============================================================================

if [[ -f "$INSTALL_ROOT/dns/sbin/pdns_server" ]]; then
    warn "PowerDNS already built — skipping. Remove $INSTALL_ROOT/dns/sbin/pdns_server to rebuild."
else
    info "Downloading PowerDNS ${PDNS_VERSION}..."
    wget -q "https://downloads.powerdns.com/releases/pdns-${PDNS_VERSION}.tar.bz2" -P "$BUILD_TMP"
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

# SQLite schema (idempotent — only if DB doesn't exist)
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

# PowerDNS config
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

master=yes
default-soa-content=ns1.@ hostmaster.@ 0 10800 3600 604800 3600

loglevel=4
PDNSCONF

info "PowerDNS configured."

# =============================================================================
step "5 / 9 — PureFTPd ${PUREFTPD_VERSION}"
# =============================================================================

if [[ -f "$INSTALL_ROOT/ftp/sbin/pure-ftpd" ]]; then
    warn "PureFTPd already built — skipping. Remove $INSTALL_ROOT/ftp/sbin/pure-ftpd to rebuild."
else
    info "Downloading PureFTPd ${PUREFTPD_VERSION}..."
    wget -q "https://download.pureftpd.org/pub/pure-ftpd/releases/pure-ftpd-${PUREFTPD_VERSION}.tar.gz" -P "$BUILD_TMP"
    tar -xzf "$BUILD_TMP/pure-ftpd-${PUREFTPD_VERSION}.tar.gz" -C "$BUILD_TMP"
    cd "$BUILD_TMP/pure-ftpd-${PUREFTPD_VERSION}"

    info "Compiling PureFTPd..."
    ./configure \
        --prefix="$INSTALL_ROOT/ftp" \
        --with-puredb \
        --without-inetd \
        2>&1 | tail -5

    make -j"$(nproc)" 2>&1 | tail -3
    make install

    # Create empty passwd/pdb files
    touch "$INSTALL_ROOT/ftp/etc/pureftpd.passwd"
    "$INSTALL_ROOT/ftp/bin/pure-pw" mkdb "$INSTALL_ROOT/ftp/etc/pureftpd.pdb" \
        -f "$INSTALL_ROOT/ftp/etc/pureftpd.passwd" 2>/dev/null || true

    info "PureFTPd ${PUREFTPD_VERSION} installed."
fi

# =============================================================================
step "6 / 9 — systemd services"
# =============================================================================

# hostpanel-nginx
cat > /etc/systemd/system/hostpanel-nginx.service << 'EOF'
[Unit]
Description=HostPanel Nginx
After=network.target

[Service]
Type=forking
PIDFile=/opt/hostpanel/nginx/logs/nginx.pid
ExecStart=/opt/hostpanel/nginx/sbin/nginx
ExecReload=/opt/hostpanel/nginx/sbin/nginx -s reload
ExecStop=/opt/hostpanel/nginx/sbin/nginx -s stop
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

# pdns (PowerDNS — named pdns to match system convention)
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

# hostpanel-ftp
cat > /etc/systemd/system/hostpanel-ftp.service << FTPEOF
[Unit]
Description=HostPanel FTP Server (pure-ftpd)
After=network.target

[Service]
Type=forking
ExecStart=/opt/hostpanel/ftp/sbin/pure-ftpd \\
  -l puredb:/opt/hostpanel/ftp/etc/pureftpd.pdb \\
  -A -E -B -H -u 1000 \\
  -p 40000:40100 \\
  -P ${SERVER_IP} \\
  -C 5 -c 50 -I 15
ExecStop=/bin/kill -QUIT \$MAINPID
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
FTPEOF

# hostpanel-api
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
systemctl enable hostpanel-nginx pdns hostpanel-ftp hostpanel-api

info "systemd services installed and enabled."

# =============================================================================
step "7 / 9 — Sudoers"
# =============================================================================

cat > /etc/sudoers.d/hostpanel << EOF
# HostPanel sudoers — generated by setup.sh
${SERVICE_USER} ALL=(root) NOPASSWD: \\
    /usr/sbin/useradd, \\
    /usr/sbin/userdel, \\
    /usr/sbin/usermod, \\
    /usr/sbin/chpasswd, \\
    /opt/hostpanel/nginx/sbin/nginx, \\
    /opt/hostpanel/ftp/bin/pure-pw, \\
    /bin/mkdir, \\
    /bin/chown, \\
    /bin/chmod, \\
    /bin/rm, \\
    /usr/bin/mysql, \\
    /usr/bin/certbot, \\
    /bin/systemctl start hostpanel-*, \\
    /bin/systemctl stop hostpanel-*, \\
    /bin/systemctl restart hostpanel-*, \\
    /bin/systemctl reload hostpanel-*, \\
    /bin/systemctl start mysql, \\
    /bin/systemctl stop mysql, \\
    /bin/systemctl restart mysql, \\
    /bin/systemctl is-active *, \\
    /usr/bin/journalctl
EOF
chmod 440 /etc/sudoers.d/hostpanel
visudo -cf /etc/sudoers.d/hostpanel

info "Sudoers configured."

# =============================================================================
step "8 / 9 — Backend .env"
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
step "9 / 10 — Panel domain (DNS + Nginx proxy + SSL)"
# =============================================================================

if [[ -n "$SERVER_DOMAIN" && -n "$PANEL_SUBDOMAIN" ]]; then
    PANEL_FQDN="${PANEL_SUBDOMAIN}.${SERVER_DOMAIN}"
    ACME_WEBROOT="/opt/hostpanel/panel-acme-webroot"
    VHOST_FILE="$INSTALL_ROOT/nginx/vhosts/panel-proxy.conf"

    mkdir -p "$ACME_WEBROOT"

    # Write HTTP-only vhost first (needed for ACME challenge before cert exists)
    cat > "$VHOST_FILE" << VHOSTEOF
server {
    listen 80;
    server_name ${PANEL_FQDN};

    location ^~ /.well-known/acme-challenge/ {
        root ${ACME_WEBROOT};
        default_type "text/plain";
        try_files \$uri =404;
    }

    location / {
        proxy_pass http://127.0.0.1:2082;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_read_timeout 120s;
    }
}
VHOSTEOF

    # Add DNS A record for panel subdomain via PowerDNS API
    # (PowerDNS must be running already — started in step 9)
    if systemctl is-active --quiet pdns; then
        PDNS_KEY=$(grep 'PDNS_API_KEY' "$INSTALL_ROOT/backend/.env" | cut -d= -f2)
        ZONE="${SERVER_DOMAIN}."
        curl -s -X PATCH \
          -H "X-API-Key: ${PDNS_KEY}" \
          -H "Content-Type: application/json" \
          http://127.0.0.1:8053/api/v1/servers/localhost/zones/${ZONE} \
          -d "{\"rrsets\":[{\"name\":\"${PANEL_FQDN}.\",\"type\":\"A\",\"ttl\":300,\"changetype\":\"REPLACE\",\"records\":[{\"content\":\"${SERVER_IP}\",\"disabled\":false}]}]}" \
          && info "DNS A record added: ${PANEL_FQDN} → ${SERVER_IP}" \
          || warn "Could not add DNS A record — add it manually in the panel"
    else
        warn "PowerDNS not running yet — DNS A record for ${PANEL_FQDN} must be added manually"
    fi

    # Reload Nginx with HTTP-only vhost
    "$INSTALL_ROOT/nginx/sbin/nginx" -s reload 2>/dev/null || true

    # Issue Let's Encrypt cert
    info "Issuing SSL certificate for ${PANEL_FQDN} ..."
    if certbot certonly --webroot \
        -w "$ACME_WEBROOT" \
        -d "$PANEL_FQDN" \
        --non-interactive --agree-tos \
        --email "${CERTBOT_EMAIL:-admin@${SERVER_DOMAIN}}" \
        --keep-until-expiring 2>&1 | grep -E "Certificate|error|Error|fail"; then

        # Fix cert permissions so service user can read them
        chmod 711 /etc/letsencrypt/live /etc/letsencrypt/archive
        chmod 711 "/etc/letsencrypt/archive/${PANEL_FQDN}" 2>/dev/null || true

        # Install deploy hook for future renewals
        cat > /etc/letsencrypt/renewal-hooks/deploy/fix-permissions.sh << 'HOOKEOF'
#!/bin/bash
chmod 711 /etc/letsencrypt/live
chmod 711 /etc/letsencrypt/archive
find /etc/letsencrypt/archive -mindepth 1 -maxdepth 1 -type d -exec chmod 711 {} \;
HOOKEOF
        chmod +x /etc/letsencrypt/renewal-hooks/deploy/fix-permissions.sh

        # Upgrade vhost to HTTPS
        cat > "$VHOST_FILE" << VHOSTEOF
server {
    listen 80;
    server_name ${PANEL_FQDN};

    location ^~ /.well-known/acme-challenge/ {
        root ${ACME_WEBROOT};
        default_type "text/plain";
        try_files \$uri =404;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name ${PANEL_FQDN};

    ssl_certificate     /etc/letsencrypt/live/${PANEL_FQDN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${PANEL_FQDN}/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:2082;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_read_timeout 120s;
    }
}
VHOSTEOF
        "$INSTALL_ROOT/nginx/sbin/nginx" -s reload 2>/dev/null || true
        info "Panel accessible at https://${PANEL_FQDN}/"
    else
        warn "SSL issuance failed — panel available at http://${PANEL_FQDN}/ (HTTP only)"
        warn "Ensure DNS for ${PANEL_FQDN} points to ${SERVER_IP} and retry: certbot certonly --webroot -w ${ACME_WEBROOT} -d ${PANEL_FQDN}"
    fi
else
    info "No SERVER_DOMAIN or PANEL_SUBDOMAIN set — skipping panel domain setup"
fi

# =============================================================================
step "10 / 10 — Start services"
# =============================================================================

info "Starting Nginx..."
systemctl start hostpanel-nginx || warn "Nginx failed to start — check: journalctl -u hostpanel-nginx"

info "Starting PowerDNS..."
systemctl start pdns || warn "PowerDNS failed to start — check: journalctl -u pdns"

info "Starting FTP..."
systemctl start hostpanel-ftp || warn "FTP failed to start — check: journalctl -u hostpanel-ftp"

info "MySQL status: $(systemctl is-active mysql)"

# =============================================================================
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           HostPanel setup complete!                         ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "  Next step: push the code from your LOCAL machine:"
echo "    cd deployment && ./deploy.sh"
echo ""
echo "  After deploy, the panel is at:"
echo "    http://${SERVER_IP}:2082/"
if [[ -n "${SERVER_DOMAIN:-}" && -n "${PANEL_SUBDOMAIN:-}" ]]; then
    echo "    https://${PANEL_SUBDOMAIN}.${SERVER_DOMAIN}/"
fi
echo ""
echo "  Reminder: Open ports 80, 443, 2082 in your cloud firewall."
echo ""
echo "  Service status:"
systemctl is-active hostpanel-nginx pdns hostpanel-ftp mysql \
    --quiet && echo "    All services running" || \
    systemctl status hostpanel-nginx hostpanel-dns hostpanel-ftp mysql \
        --no-pager --lines=3 2>/dev/null || true
