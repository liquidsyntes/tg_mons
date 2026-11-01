# Карта проекта TgMon

Короткий маршрут к исходникам. Текущее состояние и результаты проверок: [current-state.md](current-state.md). Правила: [AGENTS.md](../AGENTS.md), дополнительные соглашения: [GEMINI.md](../GEMINI.md).

## Назначение и устройство

Мониторинг и сравнение Telegram-каналов и групп: аудитория, публикации, аналитика, уведомления, AI-отчёты и события. Один npm-проект: Next.js 15 / React 19 / TypeScript, Prisma 6 / PostgreSQL 15, teleproto под npm alias `telegram`, Tailwind CSS 3, Vitest. Версии и команды проверять в [package.json](../package.json) и lock-файле.

| Область | Ответственность и точки входа |
| --- | --- |
| Web | Публичная стартовая `src/app/about/route.ts` с шаблоном `src/app/about/stitch.html`, исходными стилями `src/app/about/stitch.input.css`, конфигурацией `src/app/about/tailwind.config.cjs` и собранным `public/about/stitch.css`; защищённая главная `src/app/page.tsx`, `src/app/channel/[id]/page.tsx`; страницы сравнения, постов, отчётов, событий и настроек в `src/app/`; UI в `src/components/`, каркас AI-карточек в `src/components/channel/AIReportCardShell.tsx` |
| HTTP и доступ | `src/app/api/`, включая Telegram OIDC в `/api/auth/telegram/`, заявки в `/api/admin/registrations`, рейтинг, закладки и дайджест; `src/middleware.ts`, `src/lib/auth.ts`, `src/lib/telegram-login.ts`, `src/lib/users.ts`, `src/lib/user-channels.ts`, `src/lib/tags.ts`; сессии, роли, пользовательские каналы и актуальный статус доступа |
| Аналитика | `src/lib/metrics.ts`: публичные реэкспорты; `src/lib/metrics/queries.ts`: метрики канала, overview и detail; `src/lib/metrics/history.ts`: история VR, распределение постов, heatmap и рекламный охват; `src/lib/metrics/best-time.ts`: рекомендация времени; остальные расчёты в `src/lib/metrics/`; `src/lib/citationIndex.ts`: совместимый фасад, `src/lib/citations/`: нормализация, формула и запросы индекса; `src/lib/channel-activity.ts` и `/api/stats/channel/:id/activity`: 48 часовых строк; `src/lib/materialize.ts`: дневные агрегаты; `src/lib/types.ts`: общие контракты |
| Антифрод | `src/lib/fraudDetector.ts`: совместимый публичный фасад; `src/lib/fraud/types.ts`: контракты, `heuristics.ts`: пять проверок, `normalizers.ts`: входные данные и приоритеты сигналов, `audit.ts`: итоговый балл |
| Telegram worker | `src/worker/index.ts`: расписания; `src/worker/server.ts`: внутренний HTTP; `src/worker/auth.ts`: авторизация; сбор в `src/worker/collector.ts`, оценка сигналов после сбора в `src/worker/fraud-evaluator.ts`, разбор реакций в `src/worker/message-reactions.ts`, ссылки на посты в `src/worker/post-mentions.ts` |
| AI и события | `src/lib/openrouter.ts`, `src/lib/ai-reports.ts` (названия сохранённых отчётов), `src/lib/ai-report-html.ts` (безопасный HTML-экспорт), `src/lib/ai-markdown.ts`, `src/lib/events/` (включая `calendar.ts`), маршруты `src/app/api/ai/` (10 типов, включая `metrics-explainer` и `content-gap`) и `src/app/api/events/` |
| Хранилище | `prisma/schema.prisma`, `prisma/migrations/`, `src/lib/prisma.ts`; процессный кэш в `src/lib/cache.ts` |
| Эксплуатация | `docker-compose.yml` с dev/prod/local overrides, `Dockerfile.web`, `Dockerfile.worker`, `dev-web.sh`, `update.sh`; проверки в `.github/workflows/ci.yml` |

## Основные потоки

- UI -> API -> `src/lib/worker-client.ts` -> внутренний HTTP worker -> `src/worker/task-coordinator.ts` -> collector -> fetcher/client -> Telegram -> persister -> PostgreSQL. Ручной сбор и добавление канала выполняются в worker.
- Cron запускает задания worker; основной цикл обновляет дневные агрегаты, сигналы и уведомления, затем запрашивает сброс web-кэша. API метрик читает БД через `src/lib/metrics/queries.ts`, `history.ts` и `best-time.ts`; UI отображает результат.
- Сохранённые тексты -> AI API -> OpenRouter -> `AiReport` -> архив отчётов. Сканер событий использует Jev и генеративную модель, сохраняет события и связи с постами. Подробности и лимиты: [API](api-reference.md).
- `src/lib/user-channels.ts` разрешает доступ к `UserChannel`, накладывает персональные поля на общий `Channel` и ищет «Мой канал». Метрики, AI-анализ и страница отчёта используют этот модуль.

## Типовая задача -> исходники -> ближайшие тесты

Все пути ниже относительны корню репозитория. Это отправные точки, не обязательный общий набор тестов.

| Задача | Где менять / читать | Ближайшая проверка |
| --- | --- | --- |
| Таблица и карточка канала | `src/components/channel/`, `src/components/ChannelsTable.tsx` | `src/components/__tests__/ui-polish.test.ts`, `src/components/__tests__/channel-detail-ui.test.ts` |
| Почасовая активность канала | `src/lib/channel-activity.ts`, `src/app/api/stats/channel/[id]/activity/route.ts`, `src/components/channel/ChannelActivityTimeline.tsx`, `src/worker/persister.ts` | `src/lib/__tests__/channel-activity.test.ts`, соседние API/UI тесты, `src/worker/__tests__/collector.test.ts` |
| Экспорт PDF-отчётов каналов | `src/components/pdf/ChannelPdfTemplate.tsx`, `src/components/ExportPdfButton.tsx`, `src/lib/channel-pdf-report.ts` | `src/components/pdf/__tests__/ChannelPdfTemplate.test.ts` |
| Формулы и агрегация | `src/lib/metrics/`, `src/lib/scoring.ts`, `src/lib/ep.ts` | `src/lib/metrics/__tests__/`, `src/lib/__tests__/scoring.test.ts`, `src/lib/ep.test.ts` |
| История и время публикации | `src/lib/metrics/history.ts`, `src/lib/metrics/best-time.ts`, вызов из `queries.ts` | `src/lib/metrics/__tests__/history.test.ts`, `best-time.test.ts`, `queries.test.ts` |
| Эвристики антифрода и нормализация | `src/lib/fraud/`, фасад `src/lib/fraudDetector.ts`; потребители в `src/lib/metrics/queries.ts`, `src/worker/fraud-evaluator.ts` и UI | `src/lib/__tests__/fraudDetector.test.ts`, `src/lib/fraud/__tests__/normalizers.test.ts`, `src/worker/__tests__/fraud-evaluator.test.ts`, `src/components/__tests__/RiskBadge.test.ts` |
| Индекс цитирования | `src/lib/citationIndex.ts`, `src/lib/citations/`, потребители в `src/lib/metrics/` и `src/lib/citationNetwork.ts` | `src/lib/__tests__/citationIndex.test.ts`, `src/lib/__tests__/citationNetwork.test.ts`, `src/lib/metrics/__tests__/queries.test.ts` |
| Сбор, очередь, повторы | `src/worker/collector.ts`, `src/worker/fetcher.ts` (типизированная граница MTProto), `src/worker/persister.ts`, `src/worker/task-coordinator.ts`, `src/worker/sync-jobs.ts` (жизненный цикл SyncJob, реэкспорт из persister), `src/worker/retry-policy.ts` | `src/worker/__tests__/collector.test.ts`, `src/worker/__tests__/fetcher-errors.test.ts`, `src/worker/__tests__/timeout.test.ts`, `src/worker/__tests__/sync-job-lock.test.ts`, `src/worker/__tests__/retry-policy.test.ts` |
| Статьи и медиа | `src/worker/message-content.ts`, `src/worker/post-image.ts` | `src/worker/__tests__/article-collection.test.ts`, `src/worker/__tests__/post-image.test.ts` |
| Доступ и API | `src/middleware.ts`, `src/lib/auth.ts`, нужный `route.ts` в `src/app/api/` | `src/__tests__/middleware.test.ts`, `src/lib/__tests__/auth.test.ts`, соседний `__tests__/route.test.ts`, если существует |
| Поиск публикаций | `src/app/api/posts/search/route.ts`: HTTP и доступ; `src/lib/posts-search.ts`: параметры, фильтры, сортировка, выборка и обогащение; потребители `src/app/posts/page.tsx` и `src/components/channel/RecentPosts.tsx` | `src/app/api/posts/search/__tests__/route.test.ts`, `src/lib/__tests__/posts-search.test.ts` |
| Пользовательские каналы и «Мой канал» | `src/lib/user-channels.ts`, `src/lib/metrics/queries.ts`, маршруты AI и страница отчёта | `src/lib/__tests__/user-channels.test.ts`, `src/lib/metrics/__tests__/queries.test.ts`, тесты затронутых AI-маршрутов |
| Telegram-вход и одобрение | `src/lib/telegram-login.ts`, `src/app/api/auth/telegram/`, `src/app/api/admin/registrations/`, `src/app/login/page.tsx`, `src/app/pending/page.tsx` | `src/lib/__tests__/telegram-login.test.ts`, соседние тесты маршрутов, `src/__tests__/middleware.test.ts` |
| AI, радар, события | `src/app/api/ai/trends/route.ts`, `src/lib/ai-reports.ts`, `src/lib/events/` | `src/app/api/ai/trends/__tests__/route.test.ts`, `src/lib/__tests__/ai-reports.test.ts`, `src/lib/events/__tests__/` |
| Карточки и HTML-экспорт AI-отчётов | `src/components/channel/AIReportsSection.tsx`, `AIReportCardShell.tsx`, `src/lib/ai-report-html.ts`, `src/app/api/reports/[id]/export/route.ts` | `src/components/__tests__/channel-detail-ui.test.ts`, `src/components/channel/__tests__/AIReportCardShell.test.ts`, `src/lib/__tests__/ai-report-html.test.ts`, тест экспорта маршрута |
| Уведомления и эксплуатация | `src/lib/alerts.ts`: совместимый фасад; `src/lib/alerts/`: типы, чистые правила, резервирования, доставка и оценка канала; `src/lib/digest.ts`, `src/lib/ops.ts`, `src/worker/index.ts` | `src/lib/__tests__/alerts.test.ts`, `src/app/api/alerts/__tests__/route.test.ts`, `src/worker/__tests__/alert-collection.test.ts`, `src/worker/__tests__/rule-alert.test.ts`, тесты digest и ops |
| Данные и миграции | `prisma/schema.prisma`, `prisma/migrations/`, затронутые чтение и запись | Проверить SQL миграции и ближайшие тесты потребителей; порядок в [эксплуатации](deployment.md) |

## Ограничения, которые легко пропустить

- Данные каналов общие, пользовательские списки и флаги хранятся в `UserChannel`; доступ проверять на сервере. OpenRouter-ключ общий.
- `WORKER_LOCAL_MODE` выбирает `TG_SESSION_LOCAL`, а отключение cron задаётся отдельно. `worker:local` включает `--no-cron`, dev Compose по умолчанию оставляет cron. Локальный запуск по правилам GEMINI выполняется в Docker.
- Очередь MTProto действует внутри процесса; SyncJob дополнительно защищён PostgreSQL advisory lock. Не выводить гарантии других заданий из блокировки SyncJob.
- Материализованные UTC-дни и сырые скользящие окна различаются. `null` не равен нулю; антифрод является эвристикой. PostSnapshot для LTV и PostViewSnapshot для рекламы имеют разные назначения.
- Кэш находится в памяти web-процесса. Успешный HTTP health не подтверждает полноту сбора. Наличие теста не означает, что он запускался.
- `npm run lint` содержит `next lint`; фактическая команда CI: `npx eslint src`. Команды проверок сверять с конфигурацией, не переносить результаты прежних запусков.

## Подробности по необходимости

[Обзор](overview.md) · [Архитектура](architecture.md) · [БД](database.md) · [Формулы](analytics-formulas.md) · [API](api-reference.md) · [Эксплуатация](deployment.md) · [Утилиты](../scripts/README.md) · [Git](git-workflow.md) · [Рабочий процесс](codex-workflow.md).

Карту обновлять при изменении структуры, связей модулей или точек входа. Статусы сессий сюда не добавлять; правила передачи работы находятся в AGENTS.md.
