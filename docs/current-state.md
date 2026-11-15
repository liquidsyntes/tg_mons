# Current State

Дата снимка: 2026-11-15  
Базовая ревизия: `6fca9bb` (`main`, синхронизирован с `origin/main`, тег релиза `v1.56`)

## Что реализовано

- Опубликован официальный релиз на GitHub: **`Tg Monitor v1.56 (public version feature update)`** (тег `v1.56` на коммите `6fca9bb`, статус `Latest`, URL: `https://github.com/liquidsyntes/tg_mons/releases/tag/v1.56`).
- В релиз `v1.56` вошли 38 коммитов после `v1.18`, включая:
  - интерактивного Telegram-бота и интеграцию с афишей мероприятий (`#82`, `#84`);
  - рекламную аналитику, Ad Spy и детектор удалений рекламных постов (`#75`, `#76`, `#77`);
  - контент-план, Newsjacking Speed, мульти-сравнение каналов и ночную антифрод-эвристику (`#78`-`#81`);
  - 30-дневные метрики ER/ERR, PDF Media Kit, события на графике подписчиков и аналитику длины/структуры постов;
  - архитектурный рефакторинг (`#63`-`#74`), повышение надёжности MTProto worker и публикацию Docker-образов в GHCR (`.github/workflows/docker-publish.yml`).
- Issue #84 закрыт (`CLOSED`).

## Выполненные проверки

- Для кодовой базы релиза `6fca9bb` (до обновления `docs/current-state.md`):
  - `npm test -- src/lib/__tests__/telegram-bot-commands.test.ts src/worker/__tests__/bot-poller.test.ts`: **2 файла, 18 тестов пройдены**;
  - `npx tsc --noEmit`: код `0`, без ошибок;
  - `npx eslint src`: код `0`, без предупреждений и ошибок;
  - `npm test`: **155 файлов, 1018 тестов пройдены**;
  - `npm run build` (`prisma generate && next build`): код `0`, `19/19` статических страниц;
  - Docker (`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build worker web`): сервисы запущены, `GET /api/health` вернул `HTTP/1.1 200 OK`, в логах `tgmon-worker` зафиксирован запуск `Telegram bot command poller started`.
- Для релиза `v1.56`: релиз и тег `v1.56` подтверждены через `gh release view v1.56` и `git fetch --tags origin`.

## Непроверенное / остаточные риски

- Отправка и приём реальных команд `/events`, `/event <id>` и `/dismiss <id>` через live Telegram Bot API не выполнялись вручную в чате.
- Данное обновление затрагивает только `docs/current-state.md` без изменения кода приложения и Docker-образов.

## Следующий конкретный шаг

Проверить новые команды бота в личном чате Telegram и приступать к новым задачам после `v1.56`.
