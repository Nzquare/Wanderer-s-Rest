#!/bin/sh
# Undoes install-pi-service.sh — removes the systemd service so the print
# bridge no longer starts automatically on boot. Run: sh uninstall-pi-service.sh
set -e

sudo systemctl stop wanderers-print-bridge 2>/dev/null || true
sudo systemctl disable wanderers-print-bridge 2>/dev/null || true
sudo rm -f /etc/systemd/system/wanderers-print-bridge.service
sudo systemctl daemon-reload

echo "Removed. The print bridge will no longer start automatically."
