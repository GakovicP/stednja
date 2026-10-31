#!/bin/bash
# Posle izmena na GitHub-u: bash /opt/stednja/deploy/update.sh
set -euo pipefail
cd /opt/stednja
git pull
systemctl restart stednja
sleep 2
ADDR=$(grep -o -- '--http=[^ ]*' /etc/systemd/system/stednja.service | cut -d= -f2)
curl -fsS "http://${ADDR}/api/health" && echo && echo "==> Azurirano."
