# Карта проекта TgMon

Короткий маршрут к исходникам. Текущее состояние и результаты проверок: [current-state.md](current-state.md). Правила: [AGENTS.md](../AGENTS.md), дополнительные соглашения: [GEMINI.md](../GEMINI.md).

## Назначение и устройство

Мониторинг и сравнение Telegram-каналов и групп: аудитория, публикации, аналитика, уведомления, AI-отчёты и события. Один npm-проект: Next.js 15 / React 19 / TypeScript, Prisma 6 / PostgreSQL 15, teleproto под npm alias `telegram`, Tailwind CSS 3, Vitest. Версии и команды проверять в [package.json](../package.json) и lock-файле.

| Область | Ответственность и точки входа |
| --- | --- |
| Web | `src/app/page.tsx`, `src/app/channel/[id]/page.tsx`; страницы сравнения, постов, отчётов, событий и настроек в `src/app/`; UI в `src/components/` |
| HTTP и доступ | `src/app/api/`, `src/middleware.ts`, `src/lib/auth.ts`, `src/lib/users.ts`; сессии, роли, пользовательский доступ |
| Аналитика | `src/lib/metrics.ts` и `src/lib/metrics/`: выборки и расчёты, включая сводку реакций; `src/lib/materialize.ts`: дневные агрегаты; `src/lib/types.ts`: общие контракты |
| Telegram worker | `src/worker/index.ts`: расписания; `src/worker/server.ts`: внутренний HTTP; `src/worker/auth.ts`: авторизация; сбор в `src/worker/collector.ts`, разбор реакций в `src/worker/message-reactions.ts` |
| AI и события | `src/lib/openrouter.ts`, `src/lib/ai-reports.ts`, `src/lib/events/`, маршруты `src/app/api/ai/` и `src/app/api/events/` |
| Хранилище | `prisma/schema.prisma`, `prisma/migrations/`, `src/lib/prisma.ts`; процессный кэш в `src/lib/cache.ts` |
| Эксплуатация | `docker-compose.yml` с dev/prod/local overrides, `Dockerfile.web`, `Dockerfile.worker`, `dev-web.sh`, `update.sh`; проверки в `.github/workflows/ci.yml` |

## Основные потоки

- UI -> API -> `src/lib/worker-client.ts` -> внутренний HTTP worker -> `src/worker/task-coordinator.ts` -> collector -> fetcher/client -> Telegram -> persister -> PostgreSQL. Ручной сбор и добавление канала выполняются в worker.
- Cron запускает задания worker; основной цикл обновляет дневные агрегаты, сигналы и уведомления, затем запрашивает сброс web-кэша. API метрик читает БД через `src/lib/metrics/queries.ts`; UI отображает результат.
- Сохранённые тексты -> AI API -> OpenRouter -> `AiReport` -> архив отчётов. Сканер событий использует Jev и генеративную модель, сохраняет события и связи с постами. Подробности и лимиты: [API](api-reference.md).

## Типовая задача -> исходники -> ближайшие тесты

Все пути ниже относительны корню репозитория. Это отправные точки, не обязательный общий набор тестов.

| Задача | Где менять / читать | Ближайшая проверка |
| --- | --- | --- |
| Таблица и карточка канала | `src/components/channel/`, `src/components/ChannelsTable.tsx` | `src/components/__tests__/ui-polish.test.ts`, `src/components/__tests__/channel-detail-ui.test.ts` |
| Формулы и агрегация | `src/lib/metrics/`, `src/lib/scoring.ts`, `src/lib/ep.ts` | `src/lib/metrics/__tests__/`, `src/lib/__tests__/scoring.test.ts`, `src/lib/ep.test.ts` |
| Сбор, очередь, повторы | `src/worker/collector.ts`, `src/worker/persister.ts`, `src/worker/task-coordinator.ts`, `src/worker/retry-policy.ts` | `src/worker/__tests__/collector.test.ts`, `src/worker/__tests__/sync-job-lock.test.ts`, `src/worker/__tests__/retry-policy.test.ts` |
| Статьи и медиа | `src/worker/message-content.ts`, `src/worker/post-image.ts` | `src/worker/__tests__/article-collection.test.ts`, `src/worker/__tests__/post-image.test.ts` |
| Доступ и API | `src/middleware.ts`, `src/lib/auth.ts`, нужный `route.ts` в `src/app/api/` | `src/__tests__/middleware.test.ts`, `src/lib/__tests__/auth.test.ts`, соседний `__tests__/route.test.ts`, если существует |
| AI, радар, события | `src/app/api/ai/trends/route.ts`, `src/lib/ai-reports.ts`, `src/lib/events/` | `src/app/api/ai/trends/__tests__/route.test.ts`, `src/lib/__tests__/ai-reports.test.ts`, `src/lib/events/__tests__/` |
| Уведомления и эксплуатация | `src/lib/alerts.ts`, `src/lib/digest.ts`, `src/lib/ops.ts`, `src/worker/index.ts` | `src/lib/__tests__/alerts.test.ts`, `src/lib/__tests__/digest.test.ts`, `src/lib/__tests__/ops.test.ts` |
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
