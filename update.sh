#!/usr/bin/env bash
# Обновление TgMon на VPS: git pull -> rebuild -> migrate -> restart
set -euo pipefail
cd /opt/tgmon
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
git pull --ff-only
$COMPOSE build web worker
$COMPOSE stop web worker
$COMPOSE run --rm --no-deps worker npm run prisma:migrate
$COMPOSE up -d web worker
$COMPOSE ps

# Wait for web to become ready and pass health check (up to 60s)
echo "Waiting for web health check..."
ready=0
for _ in $(seq 1 30); do
  if HEALTH="$(curl -fsS --max-time 5 http://127.0.0.1:4000/api/health 2>/dev/null)"; then
    echo "$HEALTH"
    ready=1
    break
  fi
  sleep 2
done

if [ "$ready" -ne 1 ]; then
  echo "ERROR: web health check did not pass within 60s" >&2
  $COMPOSE logs web --tail=50 >&2 || true
  exit 1
fi
echo "Deploy OK"
