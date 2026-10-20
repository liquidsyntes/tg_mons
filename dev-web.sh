#!/usr/bin/env bash
# Локальный запуск TgMon: web НАТИВНО + нативный PostgreSQL в WSL.
# Серверная TG_SESSION локально НЕ используется (чтобы избежать AuthKeyDuplicated).
# Если в .env задана отдельная TG_SESSION_LOCAL (через `npm run auth:local`),
# автоматически поднимается локальный worker в режиме по запросу (без фонового cron).
set -euo pipefail

PG_HOST="${PG_HOST:-127.0.0.1}"
PG_PORT="${PG_PORT:-5432}"

# 1. Нативный PostgreSQL (systemd-сервис WSL)
if ! pg_isready -q -h "$PG_HOST" -p "$PG_PORT"; then
  echo "PostgreSQL не отвечает на ${PG_HOST}:${PG_PORT} — пробую поднять systemd-сервис…"
  sudo -n service postgresql start >/dev/null 2>&1 || true
  for _ in $(seq 1 15); do
    pg_isready -q -h "$PG_HOST" -p "$PG_PORT" && break
    sleep 1
  done
fi
pg_isready -q -h "$PG_HOST" -p "$PG_PORT" || {
  echo "PostgreSQL не поднялся. Подними вручную: sudo service postgresql start"
  exit 1
}

# 2. Prisma-клиент и миграции
npx prisma generate
npx prisma migrate deploy

# 3. Проверяем наличие изолированной локальной сессии TG_SESSION_LOCAL
HAS_LOCAL_SESSION="false"
if [ -f .env ] && grep -Eq '^TG_SESSION_LOCAL=["'\'']?[^"'\''[:space:]]+' .env; then
  HAS_LOCAL_SESSION="true"
fi

echo "Web: http://localhost:4000"
if [ "$HAS_LOCAL_SESSION" = "true" ]; then
  echo "Локальный worker: включён (TG_SESSION_LOCAL, режим по запросу без фонового cron)"
  npm run dev:local
else
  echo "Локальный worker: выключен (TG_SESSION_LOCAL не задана в .env)."
  echo "Чтобы включить локальный сбор без сброса серверной авторизации, выполните один раз: npm run auth:local"
  npm run dev
fi
