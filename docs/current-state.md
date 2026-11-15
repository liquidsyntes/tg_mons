# Current State

Дата снимка: 2026-11-15  
Базовая ревизия: `670202d` (`main`, синхронизирован с `origin/main` до фиксации изменений Issue #84)

## Что реализовано

Выполнена задача **Issue #84** (`feat(bot): интерактивные команды афиши мероприятий в Telegram-боте`):

- **`src/lib/telegram-bot-commands.ts`**:
  - Добавлены команды `/events` (алиас `/afisha`), `/event <id>` (поддерживает префикс `#`) и `/dismiss <id>` (алиас `/hide <id>`).
  - Парсер `/events` распознаёт временные пресеты (`today`/`сегодня`, `weekend`/`выходные`, `week`/`неделя`, `month`/`месяц`), фильтр `free`/`бесплатно` и произвольный поисковый запрос; общие правила фильтрации, дедупликации, отсеивания анонсов-дайджестов и генерации ссылки Google Calendar переиспользованы из `src/lib/events/calendar.ts`, `src/lib/events/digest.ts` и `src/lib/events/matching.ts`.
  - В выборке `/events`, карточке `/event` и скрытии `/dismiss` учтена изоляция по `UserChannel` и `UserDismissedEvent` для привязанного пользователя (`chatId`) и глобальный админ-доступ через `TELEGRAM_CHAT_ID`.
  - Обновлена справка `/help` и подсказка при неизвестной команде.
- **`src/lib/__tests__/telegram-bot-commands.test.ts`**: добавлены модульные и интеграционные тесты парсинга и выполнения `/events`, `/event`, `/dismiss`, дедупликации, фильтрации, проверки прав доступа и обновлённого `/help`.
- **`docs/deployment.md`**, **`docs/project-map.md`**, **`docs/current-state.md`**: актуализированы команды Telegram-бота, карта модулей и текущее состояние.

## Выполненные проверки

- Целевые тесты бота: `npm test -- src/lib/__tests__/telegram-bot-commands.test.ts src/worker/__tests__/bot-poller.test.ts` -> **2 файла, 18 тестов пройдены**.
- Проверка типов: `npx tsc --noEmit` -> код `0`, без ошибок.
- Линтинг: `npx eslint src` -> код `0`, без предупреждений и ошибок.
- Полный прогон тестов: `npm test` -> **155 файлов, 1018 тестов пройдены** (первый прогон споткнулся на таймерной гонке `src/worker/__tests__/timeout.test.ts` под параллельной нагрузкой; изолированный перезапуск `timeout.test.ts` прошёл за 177 мс, последующий полный `npm test` прошёл полностью `155/155`, `1018/1018`).
- Производственная сборка: `npx prisma generate && next build` (`npm run build`) -> код `0`, сгенерировано `19/19` статических страниц.
- Docker-сервисы: пересобраны и перезапущены `worker` и `web` (`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build worker web`), все сервисы запущены (`tgmon-postgres` healthy, `tgmon-web` `:4000`, `tgmon-worker` `:4001`), `curl.exe -s -i http://localhost:4000/api/health` вернул `HTTP/1.1 200 OK` (`{"status":"ok","lastSyncStatus":"COMPLETED",...}`), в логах `tgmon-worker` зафиксирован запуск `Telegram bot command poller started`.

## Непроверенное / остаточные риски

- Отправка и приём реальных сообщений `/events`, `/event <id>` и `/dismiss <id>` через live Telegram Bot API не выполнялись вручную в чате из-за отсутствия интерактивного клиентского шага пользователя; работа парсера, форматирования, прав и Prisma-запросов подтверждена unit/integration тестами с моками, а запуск long-polling loop подтверждён логами `tgmon-worker`.

## Следующий конкретный шаг

Протестировать команды `/events`, `/events today free`, `/event <id>` и `/dismiss <id>` в личном чате с Telegram-ботом и перейти к следующим задачам по плану развития.
