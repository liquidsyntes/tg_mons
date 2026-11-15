# Текущее состояние проекта

Дата обновления: 2026-11-15  
Ветка: `main` (базовая ревизия `6d306f3`)

## Реализовано в текущем цикле

- Выполнен **Issue #82** (`feat(bot): добавь интерактивные команды Telegram-бота для быстрой проверки каналов и дайджеста`):
  - **Парсинг, авторизация и обработчик команд** (`src/lib/telegram-bot-commands.ts`): реализованы `normalizeChannelTarget`, `parseTelegramBotUpdate` (поддержка `/start`, `/help`, `/status`, `/digest`, `/channel`, `/add`, суффиксов `@bot_name`, пересланных постов через `forward_origin` / `forward_from_chat` и прямых ссылок `t.me/...`) и `handleTelegramBotCommand`. Авторизация проверяет активного пользователя (`User.accessStatus === 'ACTIVE'`) с привязанным `telegramChatId` или системный `TELEGRAM_CHAT_ID`; непривязанные чаты получают только числовой `Chat ID` и инструкцию по привязке в `/settings` без утечки данных.
  - **Карточки, сводки и добавление каналов**: `/status` показывает последний `SyncJob`, число активных каналов и сводку «Моего канала»; `/digest` переиспользует `buildDailyDigest` / `formatDailyDigest` и добавляет лучший пост за 24 часа; `/channel` выводит подписчиков, динамику 7д/30д, ER, ERR, Ad Share 30д, `Trust Score = 100 - fraudScore` и ссылку на `/channel/:id` (или предлагает `/add` для неизвестных каналов); `/add` привязывает канал к `UserChannel` и запускает добавление через воркер.
  - **Фоновый поллер Bot API и интеграция в worker** (`src/worker/bot-poller.ts`, `src/worker/index.ts`): реализован неблокирующий `createTelegramBotPoller` (`getUpdates`, продвижение `offset`, разбиение длинных сообщений, защита от `409 Conflict` и сетевых сбоев без остановки основного MTProto-сборщика), добавлена функция `redactBotToken` с маскированием токена (`bot[REDACTED]`), настроено управление через `TELEGRAM_BOT_POLLING_ENABLED` (`.env.example`, `docker-compose.yml`) и корректная остановка при `SIGINT`/`SIGTERM`.
  - **Тесты и документация**: добавлены `src/lib/__tests__/telegram-bot-commands.test.ts` (10 тестов) и `src/worker/__tests__/bot-poller.test.ts` (4 теста); обновлены `docs/deployment.md`, `docs/project-map.md` и `docs/current-state.md`.

## Выполненные проверки

- `npx tsc --noEmit`: 0 ошибок.
- `npx eslint src`: 0 ошибок.
- `npm test`: 155 тестовых файлов, 1014 тестов пройдены.
- `npm run build`: `prisma generate && next build` завершены успешно (19 статических маршрутов).
- Docker (`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build worker web`): образы `tgmon-worker` и `tgmon-web` пересобраны и запущены; `GET http://localhost:4000/api/health` вернул `200 OK` (`"status":"ok"`), в логах `tgmon-worker` зафиксирован запуск `Telegram bot command poller started`.

## Ожидающие работы и блокеры

- Блокеров нет; изменений схемы БД и новых миграций Prisma не требовалось.

## Следующий шаг

- Выбрать следующую приоритетную задачу в GitHub Issues.
