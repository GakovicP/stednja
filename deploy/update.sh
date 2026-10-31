#!/bin/bash
# Posle izmena na GitHub-u: bash /opt/stednja/deploy/update.sh
set -euo pipefail
cd /opt/stednja
git pull
systemctl restart stednja
sleep 2
curl -fsS http://127.0.0.1:8090/api/health && echo && echo "==> Azurirano."
