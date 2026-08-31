#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

DOMAIN="${DOMAIN:-docker-learning.plan-it.pro}"
API="http://127.0.0.1:4000"
TEMPLATE="project-finder"

if [[ ! -f .env ]]; then
  echo "Missing backend/.env" >&2
  exit 1
fi

if ! curl -fsS "$API/health" >/dev/null; then
  echo "API is not up on $API — run ./deploy.sh first." >&2
  exit 1
fi

export PATH="/usr/local/hestia/bin:${PATH}"

if [[ ! -d /usr/local/hestia ]]; then
  echo "Hestia folder /usr/local/hestia not found." >&2
  exit 1
fi

find_owner() {
  local owner=""
  if command -v v-search-domain-owner >/dev/null; then
    owner="$(v-search-domain-owner "$DOMAIN" 2>/dev/null || true)"
  fi
  if [[ -n "${owner// }" ]]; then
    printf '%s\n' "$owner"
    return
  fi
  local dir
  for dir in /home/*/conf/web/"$DOMAIN"; do
    if [[ -d "$dir" ]]; then
      basename "$(dirname "$(dirname "$(dirname "$dir")")")"
      return
    fi
  done
}

OWNER="$(find_owner | head -n 1 | tr -d '[:space:]')"
if [[ -z "${OWNER:-}" ]]; then
  echo "Hestia CLI was found, but no web domain named $DOMAIN." >&2
  echo "In Hestia: Web -> Add Web Domain -> $DOMAIN  (user like dev). Then re-run." >&2
  echo "Debug: ls /home/*/conf/web/ | grep ${DOMAIN}" >&2
  exit 1
fi

echo "==> Hestia domain $DOMAIN (user $OWNER) -> $API"
echo "    Other Hestia domains, :8000 StarPass, and the panel are not changed."

set_env() {
  local key="$1" val="$2"
  if grep -q "^${key}=" .env; then
    sed -i.bak "s|^${key}=.*|${key}=${val}|" .env
  else
    printf '\n%s=%s\n' "$key" "$val" >> .env
  fi
}

TPL_DIR="/usr/local/hestia/data/templates/web/nginx"
mkdir -p "$TPL_DIR"
cp "$ROOT/nginx/hestia/${TEMPLATE}.tpl" "$TPL_DIR/${TEMPLATE}.tpl"
cp "$ROOT/nginx/hestia/${TEMPLATE}.stpl" "$TPL_DIR/${TEMPLATE}.stpl"

if ! v-list-web-domain "$OWNER" "$DOMAIN" | grep -qi 'PROXY'; then
  echo "==> enabling proxy on this domain only"
  v-add-web-domain-proxy "$OWNER" "$DOMAIN" || true
fi

echo "==> applying $TEMPLATE template to $DOMAIN only"
v-change-web-domain-proxy-tpl "$OWNER" "$DOMAIN" "$TEMPLATE" yes

echo "==> Let's Encrypt for $DOMAIN only"
if ! v-add-letsencrypt-domain "$OWNER" "$DOMAIN"; then
  echo "Let's Encrypt failed. Check DNS A record for $DOMAIN -> this VPS." >&2
  echo "HTTP proxy is still on. Other sites were not rebuilt." >&2
fi

echo "==> updating Project Finder .env public URLs"
set_env FRONTEND_ORIGIN "https://${DOMAIN}"
set_env PUBLIC_APP_URL "https://${DOMAIN}"
set_env GOOGLE_OAUTH_REDIRECT_URI "https://${DOMAIN}/api/mailbox/oauth/callback"
rm -f .env.bak

echo "==> recreating API containers only"
docker compose -f docker-compose.yml up -d --force-recreate --no-deps api ai-worker

echo "==> verify"
sleep 2
if curl -fsS "https://${DOMAIN}/health" >/dev/null; then
  echo "OK — https://${DOMAIN}  (PROJECT FINDER, trusted SSL)"
else
  echo "Template applied. If the browser still warns, wait a minute and retry:" >&2
  echo "  curl -I https://${DOMAIN}/health" >&2
fi

echo
echo "StarPass on this hostname is replaced. Process on :8000 is still running."
echo "Put StarPass on another Hestia domain if you still need it on HTTPS."
echo "Google OAuth redirect: https://${DOMAIN}/api/mailbox/oauth/callback"
