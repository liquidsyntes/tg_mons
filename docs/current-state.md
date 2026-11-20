# Current State

Дата снимка: 2026-11-20
Базовая ревизия: `8ef9260`, main. Задача #106 (Этап 3): контекстные всплывающие подсказки `?` (`HelpPopover`) во всех аналитических блоках и закрытие серии #104-#106.

## Реализовано

- В `src/lib/help/help-content.ts` экспортирован строгий union-тип `HelpSectionId` (все 46 разделов глав 1-8); поля `HelpSectionItem.id` и параметр `getHelpSectionById` типизированы под `HelpSectionId`.
- Создан клиентский компонент `src/components/help/HelpPopover.tsx`:
  - кнопка-триггер `?` (`HelpCircle`, `type="button"`, `aria-label`, `aria-expanded`, `aria-haspopup="dialog"`, `data-pdf-hide="true"`, `stopPropagation()`);
  - диалог подсказки через `createPortal(..., document.body)` с фиксированным позиционированием, зажимом в границах viewport и `useIsomorphicLayoutEffect` для SSR-совместимости;
  - открытие по клику и наведению (таймер скрытия 150 мс с отменой при переводе курсора на диалог), закрытие по `Escape`, внешнему клику или повторному клику;
  - вывод `shortSummary` раздела, ссылки `<Link href="/help#<sectionId>">Подробнее в справке</Link>` и атрибута `data-pdf-hide="true"` (скрыто при PDF-экспорте).
- Интегрированы 55 точек вызова (48 прямых `<HelpPopover sectionId="..." />` и 7 карточек через опциональный проп `helpSectionId` в `AIReportCardShell.tsx`), охватывающих 45 из 46 разделов справочника (кроме вводного `quick-start`, доступного на `/help`):
  - Дашборд (`/`): `MyChannelCard`, `BestTimeWidget`, `WatchlistWidget`, `TrendSpotterWidget`, `NewsjackingWidget`, `Dashboard`, `ChannelsTable`, `ChannelListTransfer`.
  - Карточка канала (`/channel/[id]`): `ChannelHeader` (`channel-overview`, `antifraud-score`, `antifraud-heuristics`, `channel-exports`), `NicheBenchmarkWidget`, `AdReachChart`, `AdAttributionWidget`, `ScoreGauge`, `SubscriberChart`, `PostsActivity`, `ChannelActivityTimeline`, `ContentTypePerformance`, `PostLengthPerformance`, `PopularReactionsWidget`, `ErrChart`, `ChannelHeatmap`, `CitationNetworkWidget`, `ContentLTVChart`, `RecentPostCard`, `AIReportCardShell` + `AIReportsSection`.
  - Посты (`/posts`), сравнение (`/compare`), отчёты (`/reports`), события (`/events`) и настройки (`/settings`): `src/app/posts/page.tsx`, `TopAdvertisersPanel`, `AdCreativesPanel`, `ContentPlanBoard`, `PublicationCoverage`, `CompareControls`, `CompareChartsSection`, `src/app/reports/page.tsx`, `src/app/events/page.tsx`, `src/app/settings/page.tsx`, `OperationsMonitorSettings`, `PersonalDigestSettings`, `AiUsageSettings`, `AlertRulesSettings`, `TelegramAccountLink`.
- Добавлены модульные тесты `src/components/help/__tests__/HelpPopover.test.ts` (5 тестов: атрибуты и `data-pdf-hide`, открытие по клику и ссылка, закрытие по `Escape` и внешнему клику, hover + задержка скрытия, `stopPropagation`). Обновлена карта в `docs/project-map.md`. Схема БД, миграции и API не менялись.

## Проверки

- В `tgmon-web` прошли `npx tsc --noEmit` и `npx eslint src` без ошибок.
- Целевой Vitest (7 файлов, вкл. `HelpPopover.test.ts` и затронутые экраны) в `tgmon-web`: 7 файлов пройдены, 32 теста пройдены; отдельно также пройдены 2 файла дашборда (`29` тестов) и 4 файла карточки канала (`15` тестов).
- Полный Vitest в `tgmon-web`: 173 файла пройдены, 2 пропущены (PostgreSQL integration без test DB); 1114 тестов пройдены, 9 пропущены.
- Проверка на запрещённый символ `U+2014` в добавленных строках `git diff` и новых файлах: совпадений не найдено.
- Production-сборка `prisma generate && next build` (22/22 статических маршрутов) прошла при пересборке `tgmon-web`; сервис пересоздан и запущен с bind mount; `http://127.0.0.1:4000/api/health` вернул HTTP 200 (`status: ok`).
- На хосте Vitest не запускается из-за отсутствующей native optional dependency rolldown; проверки выполнены в Docker.

## Ограничения и следующий шаг

- Интерактивная и визуальная проверка всплывающих поповеров `?` во всех блоках в живом авторизованном браузере после правки не проводилась.
- Сохраняются прежние ограничения #93 и статус #90 (ожидание реальных контрольных точек постов в окнах `[24,26]` и `[48,50]` часов). Production не обновлялся.

Следующий шаг: дождаться наступления реальных окон замеров постов `[24,26]` и `[48,50]` часов и проверить сбор контрольных точек в рамках открытой задачи #90.
