# Текущее состояние и передача работы

Снимок: 13 ноября 2026 года (Europe/Moscow). База задачи: `58e5ad1`, ветка `main`, upstream `origin/main`. Реализован трекер рекламных закупок и фактического ROI кампаний (GitHub Issue #75), а также поправлен неполный мок в `src/worker/__tests__/alert-collection.test.ts`.

## Реализовано в исходниках

- В `prisma/schema.prisma` добавлена модель `AdPlacement` (`ad_placements`) и создана/применена миграция `prisma/migrations/20261113053607_add_ad_placements/migration.sql` для хранения фактической цены, валюты (`UAH`), формата (`1/24`, `2/48`, `3/72`, `native`, `eternal`), статуса (`planned`, `published`, `completed`, `cancelled`), плановой даты, инвайт-ссылки, подтверждённых вступлений (`actualJoins`) и заметок.
- В `src/lib/types.ts` и `src/lib/adAttribution.ts` добавлены контракты `AdPlacementDeal`, `AdCampaignSummary`, чистые функции `calculateAdPlacementMetrics`, `matchPlacementDeal`, `serializeAdPlacementDeal`, `summarizeAdCampaigns` и интеграция с `getChannelAdAttribution`.
- Добавлен API-маршрут `src/app/api/channels/[id]/ad-placements/route.ts` (`GET`, `POST`, `DELETE`) с проверкой авторизации и доступа к целевому и донорскому каналам.
- В `src/components/channel/AdAttributionWidget.tsx` добавлена сводная полоса KPI (`Потрачено всего`, `Привлечено подписчиков`, `Средний CPF`, `Средний CPM`, `Лучший донор`), форма ручного добавления/редактирования закупок и inline-редактор условий сделки в карточках размещений с бейджами фактических `CPM`/`CPF`.
- Добавлены и расширены тесты: `src/lib/__tests__/adAttribution.test.ts`, `src/app/api/channels/[id]/ad-placements/__tests__/route.test.ts`, `src/components/channel/__tests__/AdAttributionWidget.test.ts`; исправлены моки в `src/worker/__tests__/alert-collection.test.ts`.
- Обновлена документация в `docs/analytics-formulas.md`, `docs/api-reference.md` и `docs/project-map.md`.

## Проверки

- Профильные тесты (`src/lib/__tests__/adAttribution.test.ts`, `src/app/api/channels/[id]/ad-attribution/__tests__/route.test.ts`, `src/app/api/channels/[id]/ad-placements/__tests__/route.test.ts`, `src/components/channel/__tests__/AdAttributionWidget.test.ts`): 24 теста в 4 файлах прошли успешно.
- Полный набор `npm test`: 141 файл, 923 теста прошли успешно.
- `npx tsc --noEmit`, `npx eslint src` и `npm run build`: 0 ошибок; миграция `20261113053607_add_ad_placements` применена.

## Следующий шаг

Следующие задачи из бэклога планируются в GitHub Issues (`#76`–`#82`).
