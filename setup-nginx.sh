#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

DOMAIN="${DOMAIN:-docker-learning.plan-it.pro}"
API="http://127.0.0.1:4000"
SITE_NAME="$DOMAIN"

if [[ ! -f .env ]]; then
  echo "Missing backend/.env" >&2
  exit 1
fi

if ! curl -fsS "$API/health" >/dev/null; then
  echo "API is not up on $API — run ./deploy.sh first." >&2
  exit 1
fi

EMAIL="$(grep -E '^GMAIL_USER=' .env | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
if [[ -z "$EMAIL" ]]; then
  EMAIL="admin@${DOMAIN}"
fi

set_env() {
  local key="$1" val="$2"
  if grep -q "^${key}=" .env; then
    sed -i.bak "s|^${key}=.*|${key}=${val}|" .env
  else
    printf '\n%s=%s\n' "$key" "$val" >> .env
  fi
}

who_on_80() {
  ss -ltnp | awk '/:80 / {print; exit}'
}

echo "==> who is on port 80"
who_on_80 || echo "(nothing)"

echo "==> installing nginx / apache certbot tools"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y nginx certbot python3-certbot-nginx curl

port80="$(who_on_80 || true)"

use_apache=0
if echo "$port80" | grep -q 'apache2'; then
  use_apache=1
  echo "==> Apache owns :80 — proxy + SSL will use Apache"
  apt-get install -y apache2 python3-certbot-apache
  a2enmod proxy proxy_http proxy_wstunnel headers rewrite ssl
  cp "$ROOT/nginx/${DOMAIN}.apache.conf" "/etc/apache2/sites-available/${SITE_NAME}.conf"
  a2ensite "$SITE_NAME"
  apache2ctl configtest
  systemctl reload apache2
  certbot --apache -d "$DOMAIN" --non-interactive --agree-tos --redirect -m "$EMAIL"
else
  echo "==> Nginx will proxy $DOMAIN -> $API"
  cp "$ROOT/nginx/${DOMAIN}.conf" "/etc/nginx/sites-available/${SITE_NAME}"
  ln -sfn "/etc/nginx/sites-available/${SITE_NAME}" "/etc/nginx/sites-enabled/${SITE_NAME}"
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl enable --now nginx
  systemctl reload nginx
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect -m "$EMAIL"
fi

echo "==> updating .env public URLs"
set_env FRONTEND_ORIGIN "https://${DOMAIN}"
set_env PUBLIC_APP_URL "https://${DOMAIN}"
set_env GOOGLE_OAUTH_REDIRECT_URI "https://${DOMAIN}/api/mailbox/oauth/callback"
rm -f .env.bak

echo "==> recreating API so new env loads"
docker compose -f docker-compose.yml up -d --force-recreate --no-deps api ai-worker

echo "==> checking https://${DOMAIN}/health"
sleep 2
if curl -fsS "https://${DOMAIN}/health" >/dev/null; then
  echo "SSL ok — https://${DOMAIN}"
else
  echo "Nginx/Apache is up but health check failed. Try: curl -I https://${DOMAIN}/health" >&2
fi

if [[ "$use_apache" -eq 1 ]]; then
  echo "Used Apache reverse proxy (port 80 was already Apache)."
else
  echo "Used Nginx reverse proxy."
fi
echo "Add this OAuth redirect in Google Cloud Console:"
echo "  https://${DOMAIN}/api/mailbox/oauth/callback"
