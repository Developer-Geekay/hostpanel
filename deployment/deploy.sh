#!/bin/bash
set -euo pipefail

# ==========================================
# HostPanel Deployment Script
# Panel runs on port 2082 — independent of Nginx
# ==========================================

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'

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
    SSH_OPTS="${SSH_OPTS} -i ${SSH_KEY}"
fi

REMOTE_APP_DIR="/opt/hostpanel/backend"
REMOTE_FRONTEND_DIR="/opt/hostpanel/frontend"

echo -e "${GREEN}Deploying to ${SERVER_USER}@${SERVER_IP}:${SERVER_PORT}...${NC}"

# ── 1. Sync backend ───────────────────────────────────────────────────────────
echo -e "${GREEN}Syncing backend → ${REMOTE_APP_DIR}...${NC}"
rsync -avz --delete \
    -e "ssh ${SSH_OPTS}" \
    --exclude 'venv' \
    --exclude '__pycache__' \
    --exclude 'logs' \
    --exclude '.env' \
    --exclude '.git' \
    ../backend/ \
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
    export XDG_RUNTIME_DIR="/run/user/$(id -u)"
    systemctl --user restart hostpanel-api
    echo "Status: $(systemctl --user is-active hostpanel-api)"
ENDSSH

# ── 3. Build Angular frontend ─────────────────────────────────────────────────
echo -e "${GREEN}Building Angular frontend...${NC}"
cd ../frontend
npm install --silent
npx ng build --base-href /

# ── 4. Sync frontend → FastAPI static dir ────────────────────────────────────
echo -e "${GREEN}Syncing frontend → ${REMOTE_FRONTEND_DIR}...${NC}"
rsync -avz --delete \
    -e "ssh ${SSH_OPTS}" \
    dist/frontend/browser/ \
    ${SERVER_USER}@${SERVER_IP}:${REMOTE_FRONTEND_DIR}/

echo ""
echo -e "${GREEN}Done. Panel accessible at http://${SERVER_IP}:2082/${NC}"
