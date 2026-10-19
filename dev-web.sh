#!/usr/bin/env bash
# Запуск локального окружения (вариант B): только web + postgres, без worker.
# Команда: bash dev-web.sh
set -euo pipefail

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.local.yml"

echo "=== Starting postgres + web (no worker) ==="
$COMPOSE up -d postgres web
echo
echo "=== ps ==="
$COMPOSE ps
echo
echo "Web: http://localhost:4000"
echo "Для остановки: $COMPOSE down"