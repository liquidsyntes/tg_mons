# Текущее состояние проекта

Дата обновления: 2026-11-15  
Ветка: `main` (базовая ревизия `11e652f`)

## Реализовано в текущем цикле

- Выполнен **Issue #80** (`feat(analytics): добавь мониторинг скорости реакции на инфоповоды (Newsjacking Speed)`):
  - **Алгоритм и типы** (`src/lib/metrics/newsjacking.ts`, `src/lib/types.ts`): реализованы чистые детерминированные функции `detectNewsTopicClusters` и `buildChannelReactionSpeedSummary` для окон `24 | 48 | 72` часов с фильтрацией рекламы (`isAd = true`) и коротких служебных записей, нормализацией RU/EN лемм, сущностей, биграмм и прямых цитирований (`targetMessageId`, `t.me/...`), выделением `firstPost`, `peakPost` по `ERR` (резерв по `views`), `coveredByMyChannel`, `myChannelDelayMinutes`, таймлайна реакции `delayMinutes` и рейтинга оперативности каналов.
  - **API** (`src/app/api/analytics/newsjacking/route.ts`): добавлен `GET /api/analytics/newsjacking` с авторизацией `verifyBearerToken`, валидацией `hours` (`24 | 48 | 72`), `tag`, `niche`, `minChannels` (`2..10`) и ограничением источников активными `UserChannel` текущего пользователя.
  - **UI** (`src/components/NewsjackingWidget.tsx`, `src/app/posts/page.tsx`, `src/app/page.tsx`): добавлен виджет «Скорость реакции на инфоповоды» с переключением окна `24ч/48ч/72ч`, фильтром `Не освещено мной`, бейджами статуса покрытия «Моего канала», таймлайном задержек и блоком «Лидеры оперативности»; подключён на дашборде `/` (с выбором папки) и на странице `/posts` (с синхронизацией по фильтрам `tag` и `niche`). Соблюдено скругление `3px`.
  - **Тесты и документация**: добавлены `src/lib/metrics/__tests__/newsjacking.test.ts`, `src/app/api/analytics/newsjacking/__tests__/route.test.ts` и `src/components/__tests__/NewsjackingWidget.test.ts`; обновлены `docs/analytics-formulas.md`, `docs/api-reference.md`, `docs/project-map.md` и `docs/current-state.md`.

## Выполненные проверки

- `npm test -- src/lib/metrics/__tests__/newsjacking.test.ts src/components/__tests__/NewsjackingWidget.test.ts src/app/api/analytics/newsjacking/__tests__/route.test.ts src/app/posts/__tests__/page.test.ts`: 4 файла, 19 тестов пройдены.
- `npx tsc --noEmit`: 0 ошибок.
- `npx eslint src`: 0 ошибок.
- `npm test`: 153 тестовых файла, 985 тестов пройдены.
- `npm run build`: `prisma generate && next build` завершены успешно (19 статических маршрутов).

## Ожидающие работы и блокеры

- Блокеров нет; изменений схемы БД и новых миграций Prisma не требовалось.

## Следующий шаг

- Перейти к планированию и реализации **Issue #81** (`feat(fraud): добавь почасовую эвристику профиля набора просмотров и ночных аномалий`).
