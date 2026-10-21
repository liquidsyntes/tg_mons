#!/usr/bin/env bash
# Локальный запуск TgMon в Docker с Hot Reload (postgres + web + worker).
# Worker в контейнере использует строго изолированную сессию TG_SESSION_LOCAL
# (WORKER_LOCAL_MODE=true), поэтому не конфликтует с серверной TG_SESSION на OVH.
set -euo pipefail

# Останавливаем нативный PostgreSQL в WSL, если он запущен, чтобы не занимать порт 5432 у Docker
if pg_isready -q -h 127.0.0.1 -p 5432 2>/dev/null; then
  sudo -n service postgresql stop >/dev/null 2>&1 || true
fi

if [ ! -f .env ] || ! grep -Eq '^TG_SESSION_LOCAL=["'\'']?[^"'\''[:space:]]+' .env; then
  echo "ВНИМАНИЕ: TG_SESSION_LOCAL не задана в .env!"
  echo "Для работы локального worker без сброса серверной сессии выполните: npm run auth:local:qr"
fi

docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
npx prisma migrate deploy
echo "Локальный стек запущен в Docker: http://localhost:4000 (postgres + web + worker на TG_SESSION_LOCAL)"
