# Текущее состояние проекта

Дата среза: `2026-11-14`
Ветка: `main`, базовая ревизия до коммита Issue #77: `3150394`

## Реализовано в рамках текущей итерации (Issue #77)

Реализован детектор удаления рекламных постов (форматы `1/24`, `2/48` и раннее удаление), сохранение последнего зафиксированного охвата и отображение форматов удержания в аналитике и UI:

1. **База данных и миграция**:
   - В `prisma/schema.prisma` (`model Post`) добавлены nullable-поля `deletedAt` (`deleted_at`), `deletedAfterHours` (`deleted_after_hours`) и `lastCheckedAt` (`last_checked_at`).
   - Добавлена и применена миграция `prisma/migrations/20261114042500_add_post_deletion_tracking/migration.sql`.
2. **Доменная логика и типы (`src/lib/adReach.ts`, `src/lib/types.ts`)**:
   - Добавлены типы `AdRetentionFormat`, `AdRetentionBucketStat`, `AdRetentionSummary` и поля удержания/удаления в `AdPriceResult`, `AdAttributionPlacement`, `SearchPost`, `AdCreativePostItem` и `ChannelDetailStats['recentPosts']`.
   - Реализованы функции `classifyAdRetentionFormat`, `resolveLastCapturedViews`, `summarizeChannelAdRetention` и `isDeletedRetentionFormat`.
3. **Воркер сбора (`src/worker/ad-reach.ts`, `src/worker/collector.ts`)**:
   - Цикл `runAdReachCycle` опрашивает активные рекламные посты (`deletedAt: null`) возрастом до 56 часов на чекпоинтах `1`, `12`, `24`, `48` ч и обновляет `lastCheckedAt`.
   - При отсутствии поста в живом ответе канала на `getMessages` или возврате `Api.MessageEmpty` пост идемпотентно помечается `deletedAt` и `deletedAfterHours` без падения цикла; сетевые ошибки, `TelegramTimeoutError` и `FLOOD_WAIT` изолируются и не приводят к ложному срабатыванию.
   - В `src/worker/collector.ts` добавлены реэкспорты `runAdReachCycle`, `isDeletedTelegramMessage`, `AD_REACH_CHECKPOINTS`.
4. **Интеграция в аналитику и API (`src/lib/pricing.ts`, `src/lib/adAttribution.ts`, `src/lib/metrics/queries.ts`, `src/lib/posts-search.ts`)**:
   - В `estimateAdPrice` (`GET /api/channels/:id/ad-price`) рассчитывается и возвращается `retentionSummary`.
   - В `getChannelAdAttribution` (`GET /api/channels/:id/ad-attribution`), `getChannelDetailStats` и `searchPosts` (`GET /api/posts/search`) добавлены `retentionFormat`, `deletedAt`, `deletedAfterHours` и сохранённый охват `lastCapturedViews`.
5. **Интерфейс (`src/components/`)**:
   - Создан `AdRetentionBadge.tsx`; обновлены `AdReachChart.tsx`, `ChannelAdReachWidget.tsx`, `AdAttributionWidget.tsx`, `RecentPostCard.tsx` и `src/app/posts/page.tsx` для отображения распределения форматов удержания, предупреждения о раннем удалении до 24ч и подписи «Сохранённый охват» для удалённых публикаций.
6. **Документация**:
   - Обновлены `docs/analytics-formulas.md`, `docs/database.md`, `docs/api-reference.md`, `docs/architecture.md`, `docs/project-map.md` и текущий документ.

## Фактически выполненные проверки

- `npx prisma migrate deploy && npx prisma generate` - успешно, миграция `20261114042500_add_post_deletion_tracking` применена, Prisma Client v6.19.3 сгенерирован.
- `npx tsc --noEmit && npx eslint src` - успешно, код возврата `0`.
- `npm test` - успешно: `146` тестовых файлов, `950` тестов пройдены (включая новые `src/lib/__tests__/adReach.test.ts`, `src/worker/__tests__/collector-deletion.test.ts`, `src/components/__tests__/AdReachChart.test.ts` и обновлённые тесты `AdAttributionWidget.test.ts`, `article-collection.test.ts`).
- `npm run build` - успешно (`prisma generate && next build`, статические и динамические маршруты собраны).
- `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build --renew-anon-volumes web worker` - контейнеры `tgmon-web` и `tgmon-worker` пересобраны и запущены; `GET http://localhost:4000/api/health` вернул `status: "ok"`, `lastSyncStatus: "COMPLETED"`, `channelsSucceeded: 26`, `channelsFailed: 0`; журнал `tgmon-worker` подтвердил планировщик `Ad Reach cron scheduled (hourly at minute 15)`.

## Незавершённое и известные ограничения

- Фактическая разметка удалений (`deletedAt`, `deletedAfterHours`) в боевой локальной БД будет накапливаться по мере работы почасового cron-задания `15 * * * *` на рекламных постах младше 56 часов.
- Специальный документ `docs/worker-telegram.md`, упомянутый в описании задачи, в репозитории отсутствует; документация воркера поддерживается в `docs/architecture.md` и `docs/project-map.md`.

## Следующий шаг

Перейти к **Issue #78** (`feat(posts): добавь контент-план и доску идей на базе закладок UserSavedPost`; далее в очереди `#79`–`#82`).
