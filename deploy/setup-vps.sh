#!/usr/bin/env bash
# Turon TZ — one-time setup of a fresh Ubuntu 22.04/24.04 VPS.
# Run as root:  bash setup-vps.sh turontz.space
# Installs Node.js 22, Caddy (automatic HTTPS), a systemd service and the firewall.
set -euo pipefail
DOMAIN="${1:-turontz.space}"
APP_DIR=/opt/turontz
export DEBIAN_FRONTEND=noninteractive

apt-get update -y
apt-get install -y curl ca-certificates gnupg ufw debian-keyring debian-archive-keyring apt-transport-https

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

id -u turontz >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin turontz
mkdir -p "$APP_DIR/uploads" "$APP_DIR/backups"
chown -R turontz:turontz "$APP_DIR"

# The app listens only on localhost; Caddy is the only thing facing the internet.
cat > /etc/systemd/system/turontz.service <<EOF
[Unit]
Description=Turon TZ
After=network-online.target
Wants=network-online.target

[Service]
User=turontz
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=3457
Environment=PUBLIC_URL=https://$DOMAIN
Environment=AI_PROVIDER=offline
ExecStart=/usr/bin/node $APP_DIR/server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
  encode gzip
  request_body {
    max_size 15MB
  }
  reverse_proxy 127.0.0.1:3457
}
www.$DOMAIN {
  redir https://$DOMAIN{uri} permanent
}
EOF

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

systemctl daemon-reload
systemctl enable turontz caddy
systemctl restart caddy
echo "OK: the server is ready. Upload the app to $APP_DIR and run: systemctl restart turontz"
