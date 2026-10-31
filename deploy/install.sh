#!/bin/bash
# Prva instalacija na serveru. Pokreni kao root iz /opt/stednja:  bash deploy/install.sh
set -euo pipefail
PB_VERSION="0.40.6"
APP_DIR="/opt/stednja"
cd "$APP_DIR"

case "$(uname -m)" in
  x86_64) ARCH=amd64 ;;
  aarch64) ARCH=arm64 ;;
  *) echo "Nepodrzana arhitektura: $(uname -m)"; exit 1 ;;
esac

command -v unzip >/dev/null || yum install -y unzip

if ! systemctl is-active -q stednja && ss -tln | grep -q ':8090 '; then
  echo "Port 8090 je zauzet. Promeni port u deploy/stednja.service i deploy/nginx-stednja.conf."; exit 1
fi

echo "==> Preuzimam PocketBase $PB_VERSION ($ARCH)"
TMP=$(mktemp -d)
curl -fsSL -o "$TMP/pb.zip" "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${ARCH}.zip"
unzip -o -q "$TMP/pb.zip" pocketbase -d "$APP_DIR"
rm -rf "$TMP"
chmod 755 "$APP_DIR/pocketbase"

echo "==> Korisnik i direktorijum za podatke"
id stednja >/dev/null 2>&1 || useradd --system --no-create-home --shell /sbin/nologin stednja
mkdir -p "$APP_DIR/pb_data"
chown -R stednja:stednja "$APP_DIR/pb_data"
chmod 750 "$APP_DIR/pb_data"

if command -v getenforce >/dev/null && [ "$(getenforce)" = "Enforcing" ]; then
  echo "==> SELinux: dozvoljavam nginx-u proxy ka lokalnom portu"
  setsebool -P httpd_can_network_connect 1
fi

echo "==> systemd servis"
cp deploy/stednja.service /etc/systemd/system/stednja.service
systemctl daemon-reload
systemctl enable --now stednja
sleep 2
curl -fsS http://127.0.0.1:8090/api/health && echo && echo "==> PocketBase radi."
