#!/usr/bin/env bash
# Локальный запуск TgMon: web НАТИВНО (npm run dev) + нативный PostgreSQL в WSL.
# Worker НЕ запускается локально — TG-сессия живёт только на сервере (docker);
# второй запуск той же сессии = AuthKeyDuplicated, Telegram сбросит авторизацию.
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

# 3. Web нативно (worker не запускается — см. шапку)
echo "Web: http://localhost:4000"
npm run dev
