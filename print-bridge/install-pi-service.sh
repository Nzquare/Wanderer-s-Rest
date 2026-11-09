#!/bin/sh
# One-time setup on a Raspberry Pi (or any always-on Linux box): makes the
# print bridge start automatically on boot via systemd, and restart itself
# if it ever crashes — nothing to open, nothing to remember, no screen or
# keyboard needed after this. Run this from inside the print-bridge folder:
#   sh install-pi-service.sh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_PATH="$(command -v node || true)"

if [ -z "$NODE_PATH" ]; then
  echo "Node.js isn't installed yet. Install it first:"
  echo "  curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -"
  echo "  sudo apt-get install -y nodejs"
  exit 1
fi

if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
  echo "Installing dependencies (npm install)..."
  (cd "$SCRIPT_DIR" && npm install)
fi

SERVICE_FILE=/etc/systemd/system/wanderers-print-bridge.service
RUN_USER="$(whoami)"

echo "Creating systemd service at $SERVICE_FILE ..."
sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=Wanderer's Rest print bridge
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$SCRIPT_DIR
ExecStart=$NODE_PATH $SCRIPT_DIR/server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable wanderers-print-bridge
sudo systemctl restart wanderers-print-bridge

echo
echo "Done. The print bridge now starts automatically every time this Pi"
echo "boots, and restarts itself if it ever crashes."
echo
echo "Check it's running:"
echo "  systemctl status wanderers-print-bridge"
echo "Watch its log (same info it used to print to a window on first run):"
echo "  journalctl -u wanderers-print-bridge -f"
echo
echo "(To undo this later, run: sh uninstall-pi-service.sh)"
