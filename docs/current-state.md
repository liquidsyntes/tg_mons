# Текущее состояние и передача работы

Снимок: 12 ноября 2026 года (Europe/Moscow). База задачи: `68f3c4c`, ветка `main`, upstream `origin/main`. До начала задачи рабочее дерево было чистым. Задача: наложение событий (вирусные посты, упоминания у доноров, сигналы антифрода) на график подписчиков канала.

## Реализовано в исходниках

- В `src/lib/metrics/subscriber-events.ts` реализованы сбор и нормализация событий периода (`buildSubscriberTimelineEvents`), привязка событий к ближайшему последующему снимку подписчиков с расчётом дельты (`attachEventsToSnapshots`) и выбор доминирующего типа события для маркера точки (`getDominantEventType` с приоритетом `fraud_signal` > `donor_mention` > `viral_post`).
- В `src/lib/types.ts`, `src/lib/metrics.ts` и `src/lib/metrics/queries.ts` расширен контракт `ChannelDetailStats` полем `timelineEvents`: `getChannelDetailStats` выбирает входящие упоминания из доступных пользователю активных каналов-доноров за выбранный период, объединяет их с вирусными постами канала и сигналами антифрода.
- В `src/components/channel/SubscriberChart.tsx` и `src/components/CustomSubscriberTooltip.tsx` добавлено отображение маркеров событий на графике (в абсолютном режиме и режиме прироста), секция событий во всплывающей подсказке, переключатель «События (N)» и фильтрация карточек событий по категориям («Вирусные посты», «Упоминания у доноров», «Сигналы антифрода») с отображением прироста/оттока подписчиков в точке снимка.
- Добавлены модульные и компонентные тесты в `src/lib/metrics/__tests__/subscriber-events.test.ts` и `src/components/__tests__/channel-detail-ui.test.ts`. Обновлены `docs/project-map.md`, `docs/overview.md`, `docs/analytics-formulas.md` и `docs/api-reference.md`.

## Проверки

- Профильные тесты `npm test -- src/lib/metrics/__tests__/subscriber-events.test.ts src/components/__tests__/channel-detail-ui.test.ts src/lib/metrics/__tests__/queries.test.ts`: 16 тестов в 3 файлах прошли успешно.
- `npx tsc --noEmit` и `npx eslint src`: 0 ошибок.

## Следующий шаг

Следующим шагом можно доработать 30-дневные ER/ERR и режим «Медиакит» в PDF-экспорте канала или добавить трекер собственных рекламных закупок.
