# Текущее состояние проекта

Обновлено: **2026-11-26** (ветка `main`, по итогам завершения всех 4 блоков техдолга `#107`-`#110`; базовый код `#110` на коммите `1182eef`).

## Реализованная работа (`#107`-`#110`)

1. **Блоки `#107`-`#109` (завершены и закрыты)**:
   - Обновлён `next` до `15.5.29`, убраны `any` из `src/`, приведены скругления к `3px`, запрещён `U+2014` в CI.
   - Очищены временные артефакты/одноразовые скрипты, выровнен `eslint-config-next@15.5.29`, синхронизированы `docs/`.
   - В `src/lib/cache.ts` добавлены LRU-лимит `maxEntries` (`metricsCache=500`, `bestTimeCache=200`) и `pruneExpired()`; унифицированы `formatNumber`/`formatPercent`/`formatLocalePercent`; удалены фасады `citationIndex.ts` и `alerts.ts`; декомпозированы `newsjacking.ts`, `AdAttributionWidget.tsx` и `telegram-bot-commands.ts`.
2. **Блок `#110` (завершён и закрыт `2026-11-25`)**:
   - `vitest.config.ts`: расширена маска на `src/**/*.test.{ts,tsx}`; покрыты все оставшиеся 16 HTTP-маршрутов `src/app/api/` (итого `58/58` файлов `route.ts` с соседними `__tests__/route.test.ts`).
   - `eslint.config.mjs`: `react-hooks/exhaustive-deps` переведён в `error` (`eslint-plugin-react-hooks@5.2.0`; 3 правила v7 уже отсутствуют).
   - PostgreSQL интеграционные тесты (`store.integration.test.ts`, `admit-process.ts`, `publication-performance.integration.test.ts`): поддержан `RUN_DB_INTEGRATION_TESTS=true` при сохранении защиты суффикса БД `_ai87_test`; в `.github/workflows/ci.yml` добавлен job `integration-postgres` с `postgres:15`.
   - Dockerfiles и health-проверки: добавлены `GET /api/health?scope=web` и неаутентифицированный `GET :4001/health`; `prisma` и `tsx` перенесены в `dependencies`; `Dockerfile.web` и `Dockerfile.worker` переведены на multi-stage (`dev` для `docker-compose.dev.yml` через `target: dev` и `runner` с `USER node` и `HEALTHCHECK` по умолчанию).
   - Production-образы: `tgmon-web:prod` уменьшен с `2.65GB / 642MB` до `1.91GB / 372MB` (`-42%` content size), `tgmon-worker:prod` уменьшен с `2.2GB / 585MB` до `1.51GB / 325MB` (`-44%` content size), оба подтверждены `whoami -> node` и `HEALTHCHECK -> healthy`, `npm run prisma:migrate` в `worker:prod` выполнен под `USER node`.

## Проверенные результаты на `2026-11-26` (база кода `1182eef`)

- `docker compose exec -T web npx tsc --noEmit`: пройдено (`TSC_PASS=true`).
- `docker compose exec -T web npx eslint src --max-warnings=0` и `npm run lint`: пройдено (`0` ошибок и `0` предупреждений).
- `docker compose exec -T -e DATABASE_URL="postgresql://postgres:password@postgres:5432/tgmon_ai87_test?schema=public" -e RUN_DB_INTEGRATION_TESTS=true web npm test -- --maxWorkers=1`: пройдено `192 passed (192)` тест-файлов, `1197 passed (1197)` тестов (`0` пропущено, включая оба PostgreSQL интеграционных теста).
- `docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm --no-deps -e NODE_ENV=production web npm run build`: пройдено (`BUILD_PASS=true`, `22/22` static pages).
- `curl.exe http://localhost:4000/api/health`: `HTTP 200` (`{"status":"ok","lastSyncStatus":"COMPLETED","channelsSucceeded":26,"channelsFailed":0}`).

## Текущее состояние и следующий шаг

- **Блокеры**: отсутствуют.
- **Следующий шаг**: перейти к открытой продуктовой задаче `#90` («Контент-план: контролировать полноту замеров публикаций»).
