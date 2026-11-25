# Текущее состояние проекта

Обновлено: **2026-11-25** (после реализации задачи #110 на ветке `main`, база кода `4191d2c` поверх `f4dc8fe` от #109).

## Реализованная работа (#110, блок 4/4 техдолга)

1. **Конфигурация Vitest и 100% покрытие HTTP-маршрутов `src/app/api/`**:
   - В `vitest.config.ts` маска поиска тестов расширена до `src/**/*.test.{ts,tsx}`.
   - Добавлены соседние unit-тесты для всех 16 ранее непокрытых маршрутов (`channels/[id]/favorite`, `channels/[id]/ltv`, `channels/compare`, `internal/invalidate-cache`, `auth/me`, `version`, 5 маршрутов `/api/stats/*`, 5 маршрутов `/api/ai/*`); итого `58/58` файлов `route.ts` имеют соседние `__tests__/route.test.ts`.
2. **ESLint и правила `react-hooks`**:
   - В `eslint.config.mjs` (выровнен на `eslint-config-next@15.5.29` / `eslint-plugin-react-hooks@5.2.0`) правило `react-hooks/exhaustive-deps` переведено с `warn` на `error`. Правила React Compiler v7 (`set-state-in-effect`, `preserve-manual-memoization`, `static-components`) в установленной версии плагина отсутствуют и не отключены.
3. **Интеграционные тесты PostgreSQL в CI и локально**:
   - В `store.integration.test.ts`, `admit-process.ts` и `publication-performance.integration.test.ts` добавлена поддержка `RUN_DB_INTEGRATION_TESTS=true` при сохранении обязательной проверки суффикса тестовой БД `_ai87_test`.
   - В `.github/workflows/ci.yml` добавлен job `integration-postgres` с сервисным контейнером `postgres:15` (`tgmon_ai87_test`), `npx prisma migrate deploy` и последовательным прогоном интеграционных тестов перед `build`.
4. **Multi-stage Dockerfiles, `USER node` и `HEALTHCHECK`**:
   - В `src/app/api/health/route.ts` добавлен облегчённый режим `GET /api/health?scope=web`; в `src/worker/server.ts` добавлен неаутентифицированный `GET /health -> 200` (подтверждено тестами).
   - `prisma` и `tsx` перенесены в `dependencies` в `package.json`, `Dockerfile.web` и `Dockerfile.worker` переведены на multi-stage сборку (`dev` для `docker-compose.dev.yml` через `target: dev` и `runner` по умолчанию с `USER node` и `HEALTHCHECK`), обновлены `.dockerignore` и `package-lock.json`.
   - Зафиксировано уменьшение production-образов: `web` с `2.65GB / 642MB` до `1.91GB / 372MB` (`-42%` content size), `worker` с `2.2GB / 585MB` до `1.51GB / 325MB` (`-44%` content size); `whoami -> node`, оба prod-контейнера вышли в статус `healthy`, `npm run prisma:migrate` в `worker:prod` выполнен под `USER node`.
5. **Актуализация документации**:
   - Обновлены `docs/deployment.md`, `docs/project-map.md`, `docs/current-state.md`.

## Проверки на ревизии `4191d2c` (после пересборки `dev` и `prod`)

- Prod Docker (`tgmon-web:prod`, `tgmon-worker:prod`): `whoami -> node`, `npm run prisma:migrate` под `USER node` (`37` миграций), `PROD_HEALTH web=healthy worker=healthy`.
- Dev Docker (`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build`): `GET http://localhost:4000/api/health -> HTTP 200`, `tsc --noEmit` (`DEV_TSC_PASS=true`), `npm run lint` (`DEV_LINT_PASS=true`).
- Интеграционные тесты PostgreSQL на изолированной БД `tgmon_ai87_test` с `RUN_DB_INTEGRATION_TESTS=true --fileParallelism=false`: `2 passed (2)`, `9 passed (9)`.

## Ожидающие задачи и следующий шаг

- **Блокеры**: отсутствуют (документационный коммит завершает изменения #110).
- **Следующий шаг**: выполнить финальный полный прогон проверок после фиксации документации (`tsc`, `eslint`, полный `npm test` с интеграционными тестами, production `next build`, проверку `U+2014=0`), отправить `main` в `origin/main` и закрыть issue #110.
