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
curl -fsS http://127.0.0.1:4000/api/health && echo
