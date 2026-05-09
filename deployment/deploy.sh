#!/bin/bash

# ==========================================
# HostPanel Deployment Script
# Panel runs on port 2082 — independent of Nginx
# ==========================================

# Configuration
SERVER_USER="ubuntu"
SERVER_IP="<your-server-ip>"
SERVER_PORT="22"
REMOTE_APP_DIR="/opt/hostpanel/backend"
REMOTE_FRONTEND_DIR="/opt/hostpanel/frontend"   # served directly by FastAPI
SSH_KEY="<path-to-your-pem-file>"

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}Starting Deployment to ${SERVER_IP}...${NC}"

# ── 1. Sync backend ───────────────────────────────────────────────────────────
echo -e "${GREEN}Syncing backend → ${REMOTE_APP_DIR}...${NC}"
rsync -avz --delete \
    -e "ssh -p ${SERVER_PORT} -i ${SSH_KEY}" \
    --exclude 'venv' \
    --exclude '__pycache__' \
    --exclude 'logs' \
    --exclude '.env' \
    --exclude '.git' \
    ../backend/ \
    ${SERVER_USER}@${SERVER_IP}:${REMOTE_APP_DIR}/

if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Failed to sync backend.${NC}"
    exit 1
fi

# ── 2. Remote: install deps + restart service ─────────────────────────────────
echo -e "${GREEN}Installing dependencies and restarting service...${NC}"
ssh -p ${SERVER_PORT} -i ${SSH_KEY} ${SERVER_USER}@${SERVER_IP} << 'ENDSSH'
    cd /opt/hostpanel/backend

    mkdir -p logs

    if [ ! -d "venv" ]; then
        echo "Creating virtual environment..."
        python3 -m venv venv
    fi

    echo "Installing Python dependencies..."
    source venv/bin/activate
    pip install -q -r requirements.txt

    if systemctl list-units --full -all | grep -Fq "hostpanel-api.service"; then
        echo "Restarting hostpanel-api..."
        sudo systemctl restart hostpanel-api
        echo "Status: $(systemctl is-active hostpanel-api)"
    else
        echo "WARNING: hostpanel-api.service not found — install it first:"
        echo "  sudo cp /opt/hostpanel/backend/../deployment/configs/hostpanel-api.service /etc/systemd/system/"
        echo "  sudo systemctl daemon-reload && sudo systemctl enable --now hostpanel-api"
    fi
ENDSSH

# ── 3. Build Angular frontend ─────────────────────────────────────────────────
echo -e "${GREEN}Building Angular frontend...${NC}"
cd ../frontend
npm install --silent

npx ng build --base-href /

if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Frontend build failed.${NC}"
    exit 1
fi

# ── 4. Sync frontend → FastAPI static dir ────────────────────────────────────
echo -e "${GREEN}Syncing frontend → ${REMOTE_FRONTEND_DIR}...${NC}"
rsync -avz --delete \
    -e "ssh -p ${SERVER_PORT} -i ${SSH_KEY}" \
    dist/frontend/browser/ \
    ${SERVER_USER}@${SERVER_IP}:${REMOTE_FRONTEND_DIR}/

if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Failed to sync frontend.${NC}"
    exit 1
fi

echo -e "${GREEN}Done. Panel accessible at http://${SERVER_IP}:2082/${NC}"
