# Текущее состояние проекта

Дата обновления: 2026-11-15  
Ветка: `main` (базовая ревизия `6984e89`)

## Реализовано в текущем цикле

- Выполнен **Issue #79** (`feat(compare): добавь мульти-сравнение каналов и сравнение с папкой или нишей`):
  - **Доменная логика и типы** (`src/lib/compare.ts`, `src/lib/types.ts`, `src/lib/metrics/queries.ts`): сохранена обратная совместимость `mergeSubscriberHistory` и `mergePostsDistribution`; добавлены `buildMultiChannelComparison` (выровненные ряды подписчиков с абсолютными значениями и относительным ростом в процентах от первой положительной точки периода, ряды постов/просмотров, матрица KPI-лидеров с нейтральной метрикой `adSharePercent`, матрица взаимных упоминаний `citationMatrix` `N x N`, список `sharedAdvertisers` для пересечений от двух каналов) и `buildTagBenchmarkProfile` (медиана и среднее по активным каналам тега `UserChannel.tags`). В `getChannelDetailStats` добавлен проброс `fraudScore` и `fraudSignals` на объект `channel`.
  - **API** (`src/app/api/stats/compare/route.ts`, `src/app/api/channels/compare/route.ts`): поддержаны `ids` (2-4 ID), legacy `a` и `b`, `benchmarkTag` (при одном ID или с несколькими) и `period` (`24h`, `7d`, `30d`), доступ ограничен каналами пользователя (`400`, `403`, `404`), ответ расширен полями `participants`, `comparison`, `benchmarkProfile`.
  - **UI** (`src/app/compare/page.tsx`, `src/components/compare/*`): поддержаны выбор 2-4 каналов, переключатель режима сравнения с папкой/нишей (`role="switch"` + выбор тега), переключение масштаба графика подписчиков (абсолютные значения / рост в `%`), таблица KPI-лидеров со столбцом медианы папки, блоки общих рекламодателей и матрицы взаимных упоминаний; соблюдено скругление `3px`.
  - **Документация**: обновлены `docs/analytics-formulas.md`, `docs/api-reference.md`, `docs/project-map.md` и `docs/current-state.md`.

## Выполненные проверки

- `npm test -- src/lib/__tests__/compare.test.ts src/components/compare/__tests__/multi-compare.test.ts src/components/__tests__/ComparePage.test.ts src/app/api/stats/compare/__tests__/route.test.ts`: 4 файла, 15 тестов пройдены.
- `npx tsc --noEmit`: 0 ошибок.
- `npx eslint src`: 0 ошибок.
- `npm test`: 150 тестовых файлов, 972 теста пройдены.
- `npm run build`: `prisma generate && next build` завершены успешно (19 статических маршрутов).

## Ожидающие работы и блокеры

- Блокеров нет; изменений схемы БД и новых миграций Prisma не требовалось.

## Следующий шаг

- Перейти к планированию и реализации **Issue #80** (`feat(analytics): добавь мониторинг скорости реакции на инфоповоды (Newsjacking Speed)`).
