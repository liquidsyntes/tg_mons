# Текущее состояние и передача работы

Снимок: 12 ноября 2026 года (Europe/Moscow). База задачи: `eb3c433`, ветка `main`, upstream `origin/main`. До начала задачи рабочее дерево было чистым. Задача: аналитика длины и структуры постов на странице канала.

## Реализовано в исходниках

- В `src/lib/metrics/post-length.ts` реализован детерминированный расчёт аналитики длины и структуры публикаций (`calculatePostLengthAnalytics`, `classifyPostLengthBucket`, `detectPostStructureSignals`): разбивка по объёму текста (`media_only`: 0 символов, `short`: 1-300 символов, `medium`: 301-1000 символов, `long`: > 1000 символов), расчёт средних и медианных просмотров, ER, ERR, пересылок, комментариев и средней длины текста, выбор лидеров по ERR и просмотрам среди категорий с минимум двумя постами, а также оценка структурных приёмов зачина (`question_hook`, `numbers_hook`, `structured_body`).
- В `src/lib/types.ts`, `src/lib/metrics.ts` и `src/lib/metrics/queries.ts` расширен контракт `ChannelDetailStats` полем `postLengthAnalytics`, рассчитываемым в `getChannelDetailStats` по уже загруженным публикациям периода без дополнительных запросов к БД и без изменения схемы Prisma.
- В `src/components/channel/PostLengthPerformance.tsx` и `src/components/channel/ChannelDetailClient.tsx` добавлен виджет «Аналитика длины и структуры постов» с графиком `BarChart` (`radius={[3, 3, 0, 0]}`), карточками категорий длины и блоком эффективности хуков/структуры.
- Добавлены модульные и компонентные тесты в `src/lib/metrics/__tests__/post-length.test.ts`, `src/components/channel/__tests__/PostLengthPerformance.test.ts` и `src/lib/metrics/__tests__/queries.test.ts`. Обновлены `docs/project-map.md`, `docs/overview.md`, `docs/analytics-formulas.md` и `docs/api-reference.md`.

## Проверки

- Профильные тесты `npm test -- src/lib/metrics/__tests__/post-length.test.ts src/components/channel/__tests__/PostLengthPerformance.test.ts src/lib/metrics/__tests__/queries.test.ts src/lib/metrics/__tests__/contentTypeER.test.ts src/components/channel/__tests__/ContentTypePerformance.test.ts`: 25 тестов в 5 файлах прошли успешно.
- `npx tsc --noEmit` и `npx eslint src`: 0 ошибок.
- `npm run build`: успешная production-сборка (18 статических страниц).
- Контейнер `tgmon-web` перезапущен с `--project-directory C:\TgMon` (восстановлен bind mount `/app`), `GET http://localhost:4000/api/health` проверен.

## Следующий шаг

Следующим шагом можно реализовать наложение событий (вирусные посты, упоминания у доноров и сигналы антифрода) поверх графика подписчиков канала или доработать 30-дневные ER/ERR и режим «Медиакит» в PDF-экспорте канала.
