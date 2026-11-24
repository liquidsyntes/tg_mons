# Текущее состояние проекта

Обновлено: **2026-11-24** (после реализации задачи #109 на ветке `main`, база кода `02e6573` поверх `3ecbe96` от #108).

## Реализованная работа (#109, блок 3/4 техдолга)

1. **Ограничение `TTLCache` (LRU + очистка истёкших записей)**:
   - В `src/lib/cache.ts` добавлены лимит `maxEntries` (по умолчанию `500`), LRU-вытеснение через порядок ключей `Map` и метод `pruneExpired()` (без фоновых таймеров `setInterval`).
   - Лимиты экземпляров: `metricsCache` (`maxEntries = 500`), `bestTimeCache` (`maxEntries = 200`).
   - Добавлены модульные тесты `src/lib/__tests__/cache.test.ts` (6 тестов).
2. **Унификация форматтеров**:
   - Единая реализация `formatNumber`, `formatPercent` и нового `formatLocalePercent` в `src/lib/utils.ts` с защитой от `!Number.isFinite` и настраиваемым fallback.
   - В `src/lib/metrics/format.ts` добавлен алиас `roundPercent` и сохранён `formatPercent = roundPercent` с JSDoc-контрактом.
   - Устранены дубли `formatPercent`/`formatNumber` в `src/app/posts/page.tsx`, `src/components/posts/AdCreativesPanel.tsx`, `src/components/posts/ContentPlanBoard.tsx`, `src/lib/digest.ts`, `src/lib/telegram-bot-commands.ts`.
3. **Удаление устаревших фасадов**:
   - Удалены `src/lib/citationIndex.ts` и `src/lib/alerts.ts`; все внутренние относительные импорты, тесты и `vi.mock` переведены на `src/lib/citations/*` и `src/lib/alerts/*` (`FACADE_REFS=0`).
4. **Декомпозиция крупных модулей с сохранением публичных экспортов**:
   - `src/lib/metrics/newsjacking.ts` -> фасад + `src/lib/metrics/newsjacking/{types,features,speed,clustering}.ts` (`7` экспортов без изменений).
   - `src/components/channel/AdAttributionWidget.tsx` -> контейнер + `src/components/channel/ad-attribution/{helpers,DealEditorForm,SummaryKpiStrip,PlacementCard,ManualDealCard}` + характеризационные тесты `AdAttributionWidget.test.ts`.
   - `src/lib/telegram-bot-commands.ts` -> фасад + `src/lib/telegram-bot/{types,parser,formatters,queries,handler}.ts` (`21` экспорт без изменений) + характеризационные тесты `telegram-bot-commands.test.ts`.
5. **Актуализация документации**:
   - Обновлены `docs/project-map.md`, `docs/architecture.md`, `docs/analytics-formulas.md`.

## Проверки на ревизии `02e6573`

- `docker compose exec -T web npx tsc --noEmit`: пройдено (`TSC_PASS=true`).
- `docker compose exec -T web npm run lint` (`eslint src`): пройдено (`LINT_PASS=true`).
- `docker compose exec -T web npm test -- --maxWorkers=2`: `174 passed | 2 skipped (176)` файлов, `1129 passed | 9 skipped (1138)` тестов (пропущены интеграционные PostgreSQL-тесты `store.integration.test.ts` и `publication-performance.integration.test.ts` без `RUN_DB_INTEGRATION_TESTS=true`).
- `docker compose run --rm --no-deps -e NODE_ENV=production web npm run build`: пройдено (`next build`, 22/22 static pages).
- Проверка циклов (DFS = 0), публичных экспортов (`BEFORE === AFTER`), `FACADE_REFS=0` и отсутствия `U+2014` в `src/` и `docs/` (`U+2014 = 0`): пройдено.

## Ожидающие задачи и следующий шаг

- **Блокеры**: отсутствуют (изменения документации не меняют исходный код `src/`).
- **Следующий шаг**: зафиксировать коммит документации, выполнить финальную пересборку локального dev-стека (`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build`), проверить `/api/health -> 200`, отправить коммиты в `origin/main` и закрыть issue #109.
