#!/usr/bin/env bash
# Turon TZ — upload the app code to the VPS and restart it.
# Data on the server (db.json, uploads/, backups/, telegram.json) is never touched.
# If the new version does not start, the previous one is put back.
#
#   bash deploy/deploy.sh root@SERVER_IP
#
# Extra ssh options (a key, for example) go in SSH_OPTS:
#   SSH_OPTS="-i ~/.ssh/turontz_vps" bash deploy/deploy.sh root@SERVER_IP
set -euo pipefail
TARGET="${1:?Usage: bash deploy/deploy.sh root@SERVER_IP}"
cd "$(dirname "$0")/.."

FILES=(server.js parser_engine.js app.js index.html styles.css creative-os.css package.json manifest.webmanifest sw.js icons lib)
for f in "${FILES[@]}"; do [ -e "$f" ] || { echo "Missing $f — run this from the repository" >&2; exit 1; }; done
# shellcheck disable=SC2086
SSH="ssh ${SSH_OPTS:-}"

echo "Uploading to $TARGET…"
tar -czf - "${FILES[@]}" | $SSH "$TARGET" "cat > /tmp/turontz-release.tgz"

$SSH "$TARGET" "FILES='${FILES[*]}' bash -s" <<'REMOTE'
set -euo pipefail
APP_DIR=/opt/turontz
PREV=/opt/turontz-prev
cd "$APP_DIR"
rm -rf "$PREV" && mkdir -p "$PREV"
for f in $FILES; do if [ -e "$f" ]; then cp -a "$f" "$PREV"/; fi; done
tar -xzf /tmp/turontz-release.tgz -C "$APP_DIR"
rm -f /tmp/turontz-release.tgz
chown -R turontz:turontz "$APP_DIR"

# Large video uploads need a bigger request limit in Caddy (older setups had 15MB).
if [ -f /etc/caddy/Caddyfile ] && grep -q 'max_size 15MB' /etc/caddy/Caddyfile; then
  sed -i 's/max_size 15MB/max_size 320MB/' /etc/caddy/Caddyfile
  systemctl reload caddy
fi

systemctl restart turontz
for i in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:3457/api/health >/dev/null 2>&1; then echo "OK: the new version of Turon TZ is running"; exit 0; fi
  sleep 1
done
echo "The new version did not start — putting the previous one back" >&2
journalctl -u turontz -n 40 --no-pager >&2 || true
cp -a "$PREV"/. "$APP_DIR"/
chown -R turontz:turontz "$APP_DIR"
systemctl restart turontz
exit 1
REMOTE
