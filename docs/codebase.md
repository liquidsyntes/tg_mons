# Карта кодовой базы

Сверено 20 сентября 2026 года. TgMon — один npm-проект с Next.js и отдельным TypeScript-worker; workspace-пакетов нет.

## Структура

```text
prisma/                 схема, миграции, демонстрационный seed
src/app/                страницы и API Route Handlers
src/components/         графики, карточки, таблицы, отчёты
src/lib/                запросы, расчёты, типы, Prisma, AI, кэш
src/worker/             MTProto, расписания, сбор и сохранение
scripts/                диагностика и одноразовое обслуживание
docs/                   продуктовая и техническая документация
.github/workflows/      CI: lint, typecheck, tests, build
```

## Точки входа

| Задача | Файлы |
| --- | --- |
| Главная и сравнение | `src/app/page.tsx`, `src/app/compare/page.tsx`, `ChannelsTable.tsx`, `channel/useChannelsData.ts` |
| Детальная страница | `src/app/channel/[id]/page.tsx`, `channel/ChannelDetailClient.tsx` |
| История отчётов | `src/app/reports/page.tsx`, `src/app/reports/[id]/page.tsx`, `ReportsListClient.tsx` |
| События и настройки | `src/app/events/page.tsx`, `src/app/settings/page.tsx` |
| API и доступ | `src/app/api/`, `src/middleware.ts`, `src/lib/auth.ts`; [контракты](api-reference.md) |
| Планировщик | `src/worker/index.ts`; три независимых cron-задания |
| Авторизация MTProto | `src/worker/auth.ts`, `src/worker/client.ts` |
| Типы ответов | `src/lib/types.ts`, отдельные интерфейсы domain-модулей |

Пути компонентов в таблице указаны относительно `src/components/`, если не указан `src/`.

## Расчёт метрик

| Модуль | Ответственность |
| --- | --- |
| `src/lib/metrics.ts` | Публичный слой реэкспортов |
| `src/lib/metrics/queries.ts` | Выборки, overview/detail, EP и антифрод, лучшее время, чтение рекламной кривой |
| `src/lib/metrics/aggregate.ts` | Сводные метрики из дневных агрегатов или сырых данных |
| `src/lib/metrics/calculate.ts` | Дельты и coverageDays, VR, окно средних просмотров 24ч |
| `src/lib/metrics/engagement.ts` | ER/ERR публикаций и усреднение |
| `src/lib/metrics/adShare.ts` | Рекламная нагрузка по Post.isAd |
| `src/lib/materialize.ts` | Запись ChannelMetricDaily по календарным UTC-дням |
| `src/lib/ep.ts` | CEI, нишевая z-нормализация и EP |
| `src/lib/scoring.ts` | Content Score, грейд, рекомендация и состав взаимодействий |
| `src/lib/dashboard.ts` | KPI и общие временные ряды |
| `src/lib/fraudDetector.ts` | Четыре эвристики, runFraudAudit, отдельный checkLowCitationGrowth |
| `src/lib/citationIndex.ts` | Чистая формула CI и single/batch-запросы упоминаний |
| `src/lib/adDetector.ts`, `src/lib/pricing.ts` | Классификация рекламы/партнёрства и оценка стоимости |

Формулы, окна и различия materialized/fallback описаны в [analytics-formulas.md](analytics-formulas.md). Не переносите расчёты в UI и не считайте комментарии/JSDoc более точным источником, чем исполняемый код.

## Worker

- `client.ts` создаёт и переиспользует TelegramClient с `TG_SESSION`.
- `fetcher.ts` разбирает идентификаторы, выполняет resolve/FullChannel/getMessages, задержки, FLOOD_WAIT и таймауты.
- `collector.ts` добавляет каналы, собирает/обновляет посты, запускает материализацию и антифрод, завершает SyncJob и сбрасывает кэш.
- `persister.ts` отвечает за Prisma-записи, объединение альбомов, снимки просмотров и сигналы.
- `retry-policy.ts` записывает ошибки, отключает канал после порога и отправляет Bot API-уведомления.
- `demographics.ts` собирает языковой граф с проверкой прав и statsDc. `src/lib/demographics.ts` валидирует граф и API-формат.
- `ad-reach.ts` собирает контрольные точки рекламного охвата.

Worker рассчитывает дневные метрики. Ручной сбор и initial backfill также вызываются из web; распределённой блокировки нет. Подробности — в [архитектуре](architecture.md).

## Компоненты и отображение

- `MyChannelCard`, `WatchlistWidget`, `Dashboard`, `TopGainersLosers` — обзор; ERR берётся из `err24h`/`err7d`, группы используют CR.
- `channel/ChannelsDesktopTable`, `channel/ChannelsMobileList` — метрики, CI, Ad Load и RiskBadge. Управление удалением перенесено в `channel/ChannelDangerZone`.
- `channel/cells/MetricCell` — значения и причины пропусков. Для отсутствия постов рисует цветную точку 8 px, остальные причины — текстом; ноль не скрывает.
- `DeltaBadge` — дельта с фактическим покрытием истории.
- `AudienceDemographics` — языки, дата, устаревание, отсутствие данных и недоступная география.
- `BestTimeWidget` — VR слотов уже в процентах; `TrendSpotterWidget` — сохранённый AI-радар, свёрнутый по умолчанию.
- `channel/ContentLTVChart`, `channel/ChannelAdReachWidget`, `AdReachChart` — разные источники просмотров: PostSnapshot и PostViewSnapshot соответственно.
- `channel/AIReportsSection`, компоненты `AI*Report`, `GenerateActionPlanButton` — генерация и отображение AI. `ExportPdfButton`, `channel/ExportWrappedButton` — клиентские экспорты.

Tailwind-токены находятся в `tailwind.config.js`, глобальные стили — в `src/app/globals.css`. Размеры rounded sm…3xl равны 3 px, `rounded-full` сохранён для кругов. Отдельной зависимости shadcn/ui нет.

## Хранилище и AI

`src/lib/prisma.ts` переиспользует Prisma Client через globalThis в development. `src/lib/cache.ts` хранит процессные TTL-кэши (5/30 минут). Это не Redis и не материализованные SQL-view.

`src/lib/openrouter.ts` — общий HTTP-клиент с env-ключом и моделью из кода; `src/lib/ai-reports.ts` сохраняет восемь типов отчётов. `/api/settings` пишет в SystemSetting, но текущий клиент его не читает.

Модели, отношения и миграции: [prisma/schema.prisma](../prisma/schema.prisma), [архитектура](architecture.md). Команды и ограничения одноразовых утилит: [scripts/README.md](../scripts/README.md).

## Проверки и вспомогательные материалы

Vitest ищет `src/**/*.test.ts`, default environment — Node; часть UI-тестов использует jsdom. Тесты расположены рядом с lib, metrics, worker, компонентами и API. CI-команды и docs-only проверки — в [codex-workflow.md](codex-workflow.md).

[AGENTS.md](../AGENTS.md) задаёт правила работы, [GEMINI.md](../GEMINI.md) — дополнительные локальные соглашения. `PROJECT.md` и `skill.md` служат краткими указателями на текущую документацию. `.agents/` содержит материалы прежних задач; это исторические артефакты, а не спецификация текущего поведения.
