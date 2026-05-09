# HostPanel Portable Build Guide

This guide documents the technical steps required to build the zero-dependency portable "Resource Binary" for HostPanel. By following this guide, you can compile the entire application stack from source on any build server (e.g., an AWS EC2 instance) and package it for deployment onto production servers (like a Raspberry Pi 5) without needing OS package managers like `apt` or `brew` on the production machine.

---

## Architecture Overview

*   **Backend:** Python 3 + FastAPI, compiled into a standalone ELF binary via PyInstaller.
*   **Frontend:** Angular 21, compiled into minified static HTML/JS/CSS files.
*   **Web Server:** Nginx, compiled from source C code into an isolated directory structure (`/opt/hostpanel/nginx`).

---

## 1. Build Environment Preparation

The server where you compile the code **must match the CPU architecture** of your production server. For example, if you are deploying to a Raspberry Pi 5 (`aarch64` / ARM64), your build server must also be `aarch64` (like an AWS Graviton instance).

Run this to verify your architecture:
```bash
uname -m
# Expected output: aarch64 (for ARM64) or x86_64 (for AMD64)
```

Install the temporary compilation tools required on the **build server** only:
```bash
sudo apt-get update && sudo apt-get upgrade -y

# Python and C/C++ Compilers
sudo apt-get install -y python3-venv python3-pip build-essential

# Nginx Compilation Dependencies
sudo apt-get install -y libpcre3-dev zlib1g-dev libssl-dev wget tar

# Node.js 20 (For Angular)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

---

## 2. Compile the Backend (FastAPI)

PyInstaller packages the Python interpreter and all dependencies into a single executable file.

```bash
cd backend/

# 1. Create and activate an isolated Python environment
python3 -m venv venv
source venv/bin/activate

# 2. Install backend dependencies and PyInstaller
pip install -r requirements.txt
pip install pyinstaller

# 3. Compile the binary (Assuming build.py uses PyInstaller)
python3 build.py

# The compiled binary will be located at:
# backend/dist/hostpanel-api
```

---

## 3. Compile the Frontend (Angular)

Angular projects require dependencies to be resolved before producing the production-ready static assets.

```bash
cd frontend/

# 1. Install Node modules (Use legacy peer deps if version conflicts occur)
npm install --legacy-peer-deps

# 2. Compile for production
npm run build

# The static files will be located at:
# frontend/dist/frontend/browser/
```

---

## 4. Compile Custom Nginx from Source

By compiling Nginx from source, we remove the dependency on Ubuntu's `apt` package versions and isolate the configuration files specifically to `/opt/hostpanel`.

```bash
# 1. Download the latest stable Nginx source
wget https://nginx.org/download/nginx-1.26.0.tar.gz
tar -zxvf nginx-1.26.0.tar.gz
cd nginx-1.26.0

# 2. Configure the build path and modules
./configure \
    --prefix=/opt/hostpanel/nginx \
    --with-http_ssl_module \
    --with-http_v2_module

# 3. Compile the source code
make

# 4. Install it to the /opt/hostpanel/nginx directory
sudo make install
```
*Note: The `--prefix` flag forces Nginx to look for its `nginx.conf` and `logs` inside `/opt/hostpanel/nginx` rather than the system default `/etc/nginx`.*

---

## 5. Package the Release Archive

Assemble all compiled components into a single staging directory and compress them. This creates the final "Resource Binary" payload.

```bash
# 1. Create a staging directory
mkdir -p ~/release/hostpanel/frontend

# 2. Copy the Backend binary
cp ~/backend/dist/hostpanel-api ~/release/hostpanel/

# 3. Copy the Frontend static files
cp -R ~/frontend/dist/frontend/browser/* ~/release/hostpanel/frontend/

# 4. Copy the Custom Nginx installation
sudo cp -R /opt/hostpanel/nginx ~/release/hostpanel/

# 5. Compress the directory into a portable tarball
cd ~/release
sudo tar -czvf hostpanel-release-arm64.tar.gz hostpanel
sudo chown ubuntu:ubuntu hostpanel-release-arm64.tar.gz
```

---

## 6. Deployment on the Production Server

Once the `hostpanel-release-arm64.tar.gz` archive is transferred to your production machine (e.g., Raspberry Pi), the setup process requires **zero `apt` commands**. 

The fundamental installation script (`install.sh`) should perform the following:
1. Extract the tarball to `/opt/hostpanel/`.
2. Configure `.env` for the backend binary.
3. Configure `nginx.conf` to point to `/opt/hostpanel/frontend`.
4. Create systemd service files (`/etc/systemd/system/hostpanel.service` and `/etc/systemd/system/hostpanel-nginx.service`) to ensure the binaries launch securely on system boot.
