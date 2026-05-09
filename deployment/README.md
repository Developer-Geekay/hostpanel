# HostPanel Deployment

This folder contains the scripts and configurations to push the backend to an Ubuntu Server.

## Prerequisites

1. You must have passwordless SSH access to the `root` (or a sudo-capable) user on your Ubuntu server.
2. Ensure you have `rsync` installed on your Mac.

## Setup Remote Server

The first time you deploy, you will need to set up the `systemd` service on the Ubuntu server so the backend runs automatically in the background.

```bash
# 1. Create the application directory on Ubuntu for backend and frontend
sudo mkdir -p /opt/hostpanel/backend
sudo mkdir -p /var/www/html
sudo chown -R root:root /opt/hostpanel
sudo chown -R root:root /var/www/html

# 2. Add the systemd service for the backend
sudo nano /etc/systemd/system/hostpanel.service
```

Paste the following into `hostpanel.service`:

```ini
[Unit]
Description=HostPanel FastAPI Backend Daemon
After=network.target

[Service]
User=root
Group=root
WorkingDirectory=/opt/hostpanel/backend
Environment="PATH=/opt/hostpanel/backend/venv/bin"
ExecStart=/opt/hostpanel/backend/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

Reload the systemd daemon:

```bash
sudo systemctl daemon-reload
sudo systemctl enable hostpanel
```

## How to Deploy

1. Edit `./deploy.sh` and change the `SERVER_IP`, `SERVER_USER`, and `SSH_KEY` variables at the top to match your Ubuntu server.
2. Make the script executable:
   ```bash
   chmod +x deploy.sh
   ```
3. Run the script:
   ```bash
   ./deploy.sh
   ```

The script will:
1. Use `rsync` to push the latest Python backend code
2. Securely SSH into the server to install Python dependencies and restart the `hostpanel` daemon
3. Run `npm run build` locally in your `/frontend` folder to compile the Angular app
4. Use `rsync` to push the built frontend files to `/var/www/html` on the server.

### Nginx Configuration (Frontend)
To serve the frontend on your server, ensure you have Nginx installed and configured to point to `/var/www/html`. An example configuration:
```nginx
server {
    listen 80;
    server_name your_domain.com;
    root /var/www/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to the Python Backend
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```