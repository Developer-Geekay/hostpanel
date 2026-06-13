#!/bin/bash
# HostPanel Deployment Script — syncs backend + frontend to a running server.
# Prerequisites: run install.sh on the server first (once).
# Run this from: hostpanel/scripts/ubuntu26_arm64/ directory.

set -euo pipefail

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'

# Get directory of this script to navigate relatively
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"

# ── Configuration — prompt if not already set via env ─────────────────────────

if [[ -z "${SERVER_IP:-}" ]]; then
    read -rp "Server IP address: " SERVER_IP
fi
[[ -z "${SERVER_IP:-}" ]] && { echo -e "${RED}Error: SERVER_IP is required.${NC}"; exit 1; }

if [[ -z "${SERVER_USER:-}" ]]; then
    read -rp "Server SSH user [ubuntu]: " SERVER_USER
    SERVER_USER="${SERVER_USER:-ubuntu}"
fi

if [[ -z "${SERVER_PORT:-}" ]]; then
    read -rp "SSH port [22]: " SERVER_PORT
    SERVER_PORT="${SERVER_PORT:-22}"
fi

if [[ -z "${SSH_KEY:-}" ]]; then
    read -rp "Path to SSH key (leave blank for password / SSH agent): " SSH_KEY
fi

# Build SSH options
SSH_OPTS="-p ${SERVER_PORT} -o StrictHostKeyChecking=no"
if [[ -n "${SSH_KEY:-}" ]]; then
    SSH_KEY="$(cd "$(dirname "${SSH_KEY}")" 2>/dev/null && pwd)/$(basename "${SSH_KEY}")"
    SSH_OPTS="${SSH_OPTS} -i ${SSH_KEY}"
fi

REMOTE_APP_DIR="/opt/hostpanel/backend"
REMOTE_FRONTEND_DIR="/opt/hostpanel/frontend"

echo -e "${GREEN}Deploying to ${SERVER_USER}@${SERVER_IP}:${SERVER_PORT}...${NC}"

# ── 0. (First-time only) Install SSH public key ───────────────────────────────
# Set INSTALL_KEY=1 to push your key to the server using password auth.
# Example: INSTALL_KEY=1 SSH_KEY=/path/to/key.pem ./deploy.sh
if [[ "${INSTALL_KEY:-0}" == "1" ]]; then
    if [[ -z "${SSH_KEY:-}" ]]; then
        echo -e "${RED}INSTALL_KEY=1 requires SSH_KEY to be set.${NC}"; exit 1
    fi
    echo -e "${GREEN}Pushing SSH public key to ${SERVER_USER}@${SERVER_IP}...${NC}"
    PUB=$(ssh-keygen -y -f "${SSH_KEY}") || { echo -e "${RED}Cannot read public key from ${SSH_KEY}${NC}"; exit 1; }
    ssh -p "${SERVER_PORT}" -o StrictHostKeyChecking=no "${SERVER_USER}@${SERVER_IP}" \
        "mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '${PUB}' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && sort -u -o ~/.ssh/authorized_keys ~/.ssh/authorized_keys"
    echo -e "${GREEN}SSH key installed. Subsequent deployments will use key auth.${NC}"
fi

# ── 1. Sync backend ───────────────────────────────────────────────────────────
echo -e "${GREEN}Syncing backend → ${REMOTE_APP_DIR}...${NC}"
rsync -avz --delete \
    -e "ssh ${SSH_OPTS}" \
    --exclude 'venv' \
    --exclude '__pycache__' \
    --exclude 'logs' \
    --exclude '.env' \
    --exclude '.git' \
    "${SCRIPT_DIR}/../../backend/" \
    ${SERVER_USER}@${SERVER_IP}:${REMOTE_APP_DIR}/

# ── 2. Remote: install deps + restart service ─────────────────────────────────
echo -e "${GREEN}Installing dependencies and restarting service...${NC}"
ssh ${SSH_OPTS} ${SERVER_USER}@${SERVER_IP} << 'ENDSSH'
    set -e
    cd /opt/hostpanel/backend

    mkdir -p logs

    if [ ! -d "venv" ]; then
        echo "Creating virtual environment..."
        python3 -m venv venv
    fi

    echo "Installing Python dependencies..."
    source venv/bin/activate
    pip install -q -r requirements.txt

    echo "Restarting hostpanel-api..."
    sudo systemctl restart hostpanel-api
    echo "Status: $(sudo systemctl is-active hostpanel-api)"
ENDSSH

# ── 3. Build React frontend (Vite) ────────────────────────────────────────────
echo -e "${GREEN}Building React frontend locally...${NC}"
cd "${SCRIPT_DIR}/../../frontend"

if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi

echo "Compiling Vite production build..."
npm run build

# ── 4. Sync frontend → FastAPI static dir ────────────────────────────────────
# Two-pass sync: core files with --delete (safe), then packages/ without --delete
# (so server-installed plugin dirs like packages/nginx/ are never wiped by deploy).
echo -e "${GREEN}Syncing frontend → ${REMOTE_FRONTEND_DIR}...${NC}"
rsync -avz --delete \
    --exclude 'packages/' \
    -e "ssh ${SSH_OPTS}" \
    dist/ \
    ${SERVER_USER}@${SERVER_IP}:${REMOTE_FRONTEND_DIR}/

rsync -avz \
    -e "ssh ${SSH_OPTS}" \
    dist/packages/ \
    ${SERVER_USER}@${SERVER_IP}:${REMOTE_FRONTEND_DIR}/packages/

echo ""
echo -e "${GREEN}Done. Panel accessible at http://${SERVER_IP}:2082/${NC}"
