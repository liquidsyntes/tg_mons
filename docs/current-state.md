# Текущее состояние и передача работы

Снимок: 26 октября 2026 года. База задачи Issue #52: `f14fe56`, ветка `main`, upstream `origin/main`; рабочее дерево до изменений было чистым. Перед следующей задачей проверить Git заново. Это состояние исходников и локальных проверок, не заключение о production.

## Реализовано в исходниках

- В `prisma/schema.prisma` в модель `User` добавлены поля персонального дайджеста (`telegramChatId`, `digestEnabled`, `digestHour`, `lastDigestAt`) и создана миграция `20261026210800_add_user_personal_digest`.
- В `src/worker/retry-policy.ts` функция `sendTelegramRuleAlert(message, chatIdOverride?)` расширена опциональным переопределением `chat_id` с сохранением fallback на `process.env.TELEGRAM_CHAT_ID`.
- В `src/lib/digest.ts` добавлена нормализация `normalizeTelegramChatId`, функция `buildDailyDigest(now, userId?)` формирует сводку и считает сигналы антифрода строго по активным подпискам `UserChannel` указанного пользователя, а `runDailyDigestIfDue(now)` независимо обслуживает глобальный админский дайджест (`SystemSetting`) и персональные дайджесты пользователей с идемпотентностью по UTC-дню (`lastDigestAt`) и откатом при ошибке отправки.
- Добавлен маршрут `GET`/`PATCH`/`POST` `/api/settings/digest` (`src/app/api/settings/digest/route.ts`), доступный ролям `USER` и `ADMIN`, и клиентский блок `PersonalDigestSettings.tsx` на странице `/settings`.
- Обновлены `docs/api-reference.md`, `docs/database.md` и `docs/overview.md`.

## Проверки текущей задачи

- Целевые тесты дайджеста, настроек и Telegram-отправки (`src/lib/__tests__/digest.test.ts`, `src/app/api/settings/digest/__tests__/route.test.ts`, `src/app/api/settings/__tests__/route.test.ts`, `src/worker/__tests__/rule-alert.test.ts`): 4 файла, 31 тест прошёл. Полный `npm test -- --maxWorkers=4`: 103 файла, 685 тестов прошли. `npx tsc --noEmit`, `npx eslint src` и `npm run build` прошли.
- В локальном Docker Compose применена миграция `20261026210800_add_user_personal_digest` (`npx prisma migrate deploy`), перегенерирован Prisma Client в контейнерах `web` и `worker`, контейнеры перезапущены.
- `git diff --check` прошёл без ошибок. Живая отправка в Telegram Bot API и production не проверялись.

## Ограничения и следующий шаг

Для получения персонального дайджеста в Telegram пользователь должен сначала запустить бота (`/start`) или добавить его в целевой чат, а в окружении должен быть задан `TELEGRAM_BOT_TOKEN`.

После доставки перед следующей задачей проверить `git status -sb` и выбрать относящиеся к ней исходники по [карте проекта](project-map.md). Исторические `.agents/` handoff-файлы не задают план следующей работы.
