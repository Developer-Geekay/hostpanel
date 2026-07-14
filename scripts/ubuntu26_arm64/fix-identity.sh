#!/usr/bin/env bash
# HostPanel — migrate an existing install to the dedicated service-account model.
#
# Older installs ran the panel as, and owned /opt/hostpanel by, whoever ran the
# installer (a human login user). This script migrates such a box to the
# dedicated non-login 'hostpanel' service account WITHOUT touching any data:
# it only creates the account, re-owns files, fixes the systemd unit + group,
# and restarts. Idempotent — safe to run more than once.
#
#   sudo bash fix-identity.sh
set -euo pipefail

INSTALL_ROOT="/opt/hostpanel"
ENV_FILE="$INSTALL_ROOT/backend/.env"
UNIT="/etc/systemd/system/hostpanel-api.service"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[fix-identity]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $*"; }
error() { echo -e "${RED}[error]${NC} $*"; exit 1; }

[[ $EUID -eq 0 ]] || error "Run as root: sudo bash fix-identity.sh"
[[ -d "$INSTALL_ROOT" ]] || error "$INSTALL_ROOT not found — is HostPanel installed here?"

# Resolve the target panel user: prefer .env, else default 'hostpanel'.
PANEL_USER="hostpanel"
if [[ -f "$ENV_FILE" ]]; then
    FROM_ENV=$(grep -m1 '^PANEL_USER=' "$ENV_FILE" | cut -d= -f2- || true)
    [[ -n "${FROM_ENV:-}" ]] && PANEL_USER="$FROM_ENV"
fi
info "Target panel service account: '$PANEL_USER'"

# 1. Group + system account (idempotent).
groupadd -f hostpanel
if ! id "$PANEL_USER" &>/dev/null; then
    # -g hostpanel: use the existing 'hostpanel' group as the primary group.
    # Without it, useradd tries to create a private group of the same name and
    # fails because 'hostpanel' already exists.
    useradd --system -g hostpanel --home-dir "$INSTALL_ROOT" --shell /usr/sbin/nologin \
            --comment "HostPanel service account" "$PANEL_USER"
    info "Created system user '$PANEL_USER'."
else
    info "User '$PANEL_USER' already exists."
fi
usermod -aG hostpanel "$PANEL_USER"

# 2. Persist PANEL_USER to .env if missing, so future re-runs agree.
if [[ -f "$ENV_FILE" ]] && ! grep -q '^PANEL_USER=' "$ENV_FILE"; then
    printf 'PANEL_USER=%s\n' "$PANEL_USER" >> "$ENV_FILE"
    info "Recorded PANEL_USER in $ENV_FILE."
fi

# 3. Re-own the whole tree to the service account, then restore bin/ (privileged
#    root-owned wrappers). Recursive on the ROOT so top-level files are included —
#    a per-subdir chown leaves hostpanel.db (+ *.json) owned by the old user, and
#    the panel then can't write the database ("attempt to write a readonly database").
info "Re-owning $INSTALL_ROOT to $PANEL_USER (this may take a moment)..."
chown -R "$PANEL_USER:$PANEL_USER" "$INSTALL_ROOT"
[[ -d "$INSTALL_ROOT/bin" ]] && chown -R root:root "$INSTALL_ROOT/bin"

# 4. Point the systemd unit at the service account.
if [[ -f "$UNIT" ]]; then
    CURRENT=$(grep -m1 '^User=' "$UNIT" | cut -d= -f2- || true)
    if [[ "$CURRENT" != "$PANEL_USER" ]]; then
        sed -i "s/^User=.*/User=$PANEL_USER/" "$UNIT"
        info "Updated $UNIT: User=$CURRENT -> User=$PANEL_USER"
        systemctl daemon-reload
    else
        info "systemd unit already runs as '$PANEL_USER'."
    fi
    info "Restarting hostpanel-api..."
    systemctl restart hostpanel-api || warn "Restart failed — check: journalctl -u hostpanel-api"
else
    warn "$UNIT not found — skipping unit fix."
fi

# 4b. Re-point ALL other hostpanel package service units at the service account.
# Package services (mongodb, php-fpm, etc.) run as User= and read/write data under
# /opt/hostpanel/plugins, which is now hostpanel-owned. A stale old-user unit can't
# write its data/logs and crash-loops (e.g. mongod: FileNotOpen on mongod.log).
# Only re-point units still running as the OLD login user ($INVOKING_USER).
# Leave tenant-scoped services alone — e.g. per-app Node processes correctly run
# as the domain's hosting user, which must NOT be rewritten to the panel account.
for u in /etc/systemd/system/hostpanel-*.service; do
    [[ -e "$u" ]] || continue
    [[ "$u" == "$UNIT" ]] && continue          # hostpanel-api handled above
    cur=$(grep -m1 '^User=' "$u" | cut -d= -f2- || true)
    if [[ -n "$cur" && "$cur" == "$INVOKING_USER" && "$cur" != "$PANEL_USER" ]]; then
        svc=$(basename "$u" .service)
        sed -i "s/^User=.*/User=$PANEL_USER/" "$u"
        systemctl daemon-reload
        systemctl reset-failed "$svc" 2>/dev/null || true
        systemctl restart "$svc" 2>/dev/null || warn "Could not restart $svc — check: journalctl -u $svc"
        info "Re-pointed $svc: User=$cur -> User=$PANEL_USER"
    fi
done

echo
info "Done. The panel now runs as '$PANEL_USER'."
info "If you want your login user to manage panel files from a console shell:"
info "    sudo usermod -aG hostpanel <your-login-user>   # then log out/in"
