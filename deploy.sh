#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Missing backend/.env — copy .env.example first." >&2
  exit 1
fi

if [[ ! -d .git ]]; then
  echo "Not a git repo. Run this from the backend clone." >&2
  exit 1
fi

echo "==> pulling latest"
git pull --ff-only

echo "==> stopping containers (volumes kept)"
docker compose -f docker-compose.yml down

echo "==> building and starting containers"
docker compose -f docker-compose.yml up --build -d --remove-orphans

echo "==> waiting for API health"
ready=0
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:4000/health" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done

echo "==> status"
docker compose -f docker-compose.yml ps

if [[ "$ready" -eq 1 ]]; then
  echo "Deploy ok — API http://127.0.0.1:4000/health"
else
  echo "Containers started but /health did not respond yet. Check: docker compose logs -f api" >&2
  exit 1
fi
