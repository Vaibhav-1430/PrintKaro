#!/usr/bin/env bash
# Install the Print Karo Machine Agent as a systemd service on Raspberry Pi.
# Reuses the SAME compiled agent core as Windows (dist/headless.js) — only the
# process manager differs. Run as root after `pnpm build`.
set -euo pipefail

INSTALL_DIR="/opt/printkaro/machine-agent"
SERVICE_FILE="/etc/systemd/system/printkaro-agent.service"

mkdir -p "$INSTALL_DIR"
cp -r dist node_modules .env "$INSTALL_DIR/"

cat > "$SERVICE_FILE" <<'UNIT'
[Unit]
Description=Print Karo Machine Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/printkaro/machine-agent
EnvironmentFile=/opt/printkaro/machine-agent/.env
ExecStart=/usr/bin/node /opt/printkaro/machine-agent/dist/headless.js
Restart=always
RestartSec=5
# Auto-start on boot, auto-restart on crash — matches the Windows tray daemon.

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable printkaro-agent
systemctl restart printkaro-agent
echo "Print Karo agent installed and started (systemctl status printkaro-agent)."
