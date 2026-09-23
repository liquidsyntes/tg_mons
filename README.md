# TG Monitor (TgMon)

Веб-приложение для мониторинга и сравнения Telegram-каналов и групп. MTProto-сборщик сохраняет аудиторию и публикации в PostgreSQL; интерфейс показывает динамику, метрики вовлечённости, рекламную нагрузку, цитирование, эвристические сигналы риска и AI-отчёты.

<<<<<<< HEAD
Документация сверена с исходным кодом **23 сентября 2026 года**. Версии зависимостей и команды задаются в [package.json](package.json), точные установочные версии — в [package-lock.json](package-lock.json).
=======
Документация сверена с исходным кодом **20 сентября 2026 года**. Версии зависимостей и команды задаются в [package.json](package.json), точные установочные версии — в [package-lock.json](package-lock.json).
>>>>>>> improve_visual_design

**Стек:** Next.js 15 / React 19 / TypeScript, Prisma 6 / PostgreSQL 15, teleproto (преемник GramJS, npm alias `telegram`), node-cron 4, Tailwind CSS 3, Recharts, Vitest 4. Docker и CI используют Node.js 22. Web слушает порт **4000**.

## Возможности

- Главная: «Мой канал», избранное, сравнительная таблица, KPI, лидеры роста и падения, лучшее время публикации и сворачиваемый радар трендов.
- История подписчиков и постов за 24 часа, 7 и 30 дней; ER, ERR, VR, CR для групп, EP и Content Score. При неполной истории дельты показывают фактическое покрытие.
- Статьи Telegram: извлечение текста rich-сообщений, чтение в карточке публикации, поиск и использование в новых AI-отчётах; восстановление ранее пустых статей отдельной утилитой.
- Страница канала: графики аудитории и активности, heatmap, поиск постов, Content LTV, входящие и исходящие упоминания, Wrapped-карточка и AI-анализ.
- Рекламная нагрузка `Ad Load` за 7 дней, отдельные снимки рекламного охвата через 1/12/24/48 часов и оценка цены по фиксированным CPM из кода.
- Четыре эвристики антифрода, журнал `fraud_signals`, `RiskBadge` и индекс цитирования. Балл риска не является вероятностью или доказательством накрутки.
- Языковая статистика «Моего канала» при наличии доступа к Telegram BroadcastStats. География в текущей реализации недоступна и не выводится из языка.
- Восемь AI-маршрутов: summary, super-report, compare, trends, audience, persona, action-plan, compare-reports. История — `/reports`, отдельный отчёт — `/reports/:id`, экспорт — HTML; отдельные UI-компоненты также сохраняют PDF/изображения.
- Сканер анонсов мероприятий из собранных постов, страница `/events`.

Подробности и ограничения: [обзор продукта](docs/overview.md), [формулы](docs/analytics-formulas.md), [API](docs/api-reference.md).

## Быстрый старт (рекомендуемый: всё в Docker с Hot Reload)

Основной способ локальной разработки — запуск web и worker в Docker с поддержкой Hot Reload через файл переопределения `docker-compose.dev.yml`.

Требования: Node.js 22, npm и Docker Desktop / Docker Compose. В Windows основной checkout — `C:\TgMon`, в WSL — `/mnt/c/TgMon`.

### 1. Подготовка и авторизация на хосте

```bash
npm ci
cp .env.example .env
```

Заполните `TG_API_ID`, `TG_API_HASH`, `TG_PHONE` и непустой `COLLECT_API_TOKEN`. Для локальной разработки база данных запускается в Docker:

```bash
docker compose up -d postgres
npm run prisma:generate
npm run prisma:migrate
npm run auth
```

Дождитесь готовности PostgreSQL перед миграциями. `npm run auth` выполняет интерактивный вход в Telegram (код и 2FA при наличии) и записывает сессию `TG_SESSION` в `.env`. Не публикуйте вывод терминала с сессией.

### 2. Запуск в Docker с Hot Reload

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

Откройте [http://localhost:4000](http://localhost:4000).

- Директория проекта монтируется в контейнер (`.:/app`), а переменная `WATCHPACK_POLLING=true` обеспечивает надёжный Fast Refresh / Hot Reload при изменении исходников на любых ОС.
- Каталоги `node_modules` и `.next` изолированы в анонимных томах Docker во избежание конфликтов сред.
- Worker запускается в режиме отслеживания (`tsx watch`) с автоперезапуском при изменении кода сбора.
- **Не запускайте `npm run dev` на хосте** во избежание конфликтов портов и файловых блокировок Prisma engine.

### Альтернативный режим: запуск на хосте

Для отладки без Docker-контейнеров для Node.js (при запущенном `docker compose up -d postgres`):
```bash
npm run dev:all
```
(или `npm run dev` и `npm run worker` в отдельных терминалах). В этом режиме задайте `WEB_INTERNAL_URL=http://localhost:4000`.

После старта добавьте канал через интерфейс. API сразу пытается собрать историю за 30 дней, ограниченную 1000 последними сообщениями; дальнейший плановый цикл периодически обновляет метрики.

`npm run seed` **удаляет существующие посты, снимки и каналы** перед созданием демонстрационных данных. Это команда только для отдельной тестовой БД, она не нужна для обычного старта. `npm run prisma:push` не заменяет применение миграций в существующем окружении.

## Статьи и ранее пустые публикации

Сборщик использует `teleproto@1.229.0` под именем пакета `telegram`. Он читает `richMessage`, при необходимости догружает полный текст и сохраняет его в `Post.text`. В интерфейсе доступны абзацы, списки, таблицы и подписи как обычный текст; изображения не скачиваются, OCR и точная вёрстка Telegram не выполняются. Ошибка догрузки не затирает ранее сохранённый текст.

Надпись «Текст недоступен» не доказывает отсутствие содержания в Telegram. Старые пропуски за пределами последних 200 сообщений восстанавливаются через [backfill-articles.ts](scripts/README.md#восстановление-текста-статей): сначала dry-run, затем явный `--apply`. Новые AI-отчёты используют восстановленный текст в пределах своих [периодов и лимитов](docs/api-reference.md#ai-отчёты); сохранённые отчёты нужно создать заново.

## Docker и развёртывание

[Инструкция развёртывания](docs/deployment.md) описывает три режима:
1. **Локальная разработка в Docker с Hot Reload** (`docker-compose.dev.yml`) — рекомендуемый режим.
2. **Запуск на хосте** (`dev:all` или раздельные `npm run dev` / `npm run worker`) — альтернативный режим для отладки.
3. **Production-развёртывание** (полный Compose) — автономные production-образы.

Миграции не запускаются автоматически при старте контейнеров.

### Команды разработки vs Production

- **Локальная разработка с Hot Reload**:
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
  ```
  Команда монтирует исходный код в контейнеры, запускает `npm run dev` (`next dev -p 4000`), `tsx watch` для worker и поллинг `WATCHPACK_POLLING=true`.

- **Production-сборка (полный Compose)**:
  Для production задайте в `.env` **`WEB_INTERNAL_URL=http://web:4000`** (скопированное из примера значение `localhost` иначе переопределит корректный Docker-default):
  ```bash
  docker compose up -d postgres
  docker compose build web worker
  docker compose run --rm --no-deps worker npm run prisma:migrate
  docker compose up -d web worker
  ```
  В production контейнеры собираются начисто (`Dockerfile.web` компилирует Next.js через `npm run build`), и сервер запускается через `npm start` без монтирования локальных файлов.

Web и worker в полном Compose запускаются из собранных образов без hot reload. После изменения сборщика или Telegram-клиента обновляйте оба образа: ручной сбор выполняется также в web. Порт 4000 должен быть свободен; проверяйте публикацию через `docker compose ps` и ответы главной и `/api/health` с хоста. [Обновление и диагностика порта](docs/deployment.md#обновление-существующего-окружения).

В приложении нет пользовательского входа. Middleware автоматически добавляет Bearer-токен к мутациям API без `Authorization`, не проверяя источник запроса. `/api/settings` возвращает сохранённый AI-токен. Поэтому сетевой доступ к развёрнутому приложению должен ограничиваться отдельно; `COLLECT_API_TOKEN` сам по себе не защищает публичный сайт.

## Конфигурация

| Переменная | Использование |
| --- | --- |
| `DATABASE_URL` | PostgreSQL для web, worker и Prisma CLI |
| `TG_API_ID`, `TG_API_HASH`, `TG_SESSION` | MTProto в worker и web-маршрутах добавления/ручного сбора |
| `TG_PHONE` | Подсказка для интерактивной авторизации |
| `COLLECT_API_TOKEN` | Middleware и проверка Bearer в защищённых обработчиках |
| `COLLECT_CRON` | Основной сбор, по умолчанию `0 * * * *` |
| `COLLECT_ON_STARTUP` | Первичный цикл только при строке `true` |
| `DEMOGRAPHICS_CRON` | Демография, по умолчанию `0 3 * * 0` |
| `WEB_INTERNAL_URL` | Адрес web для сброса кэша из worker |
| `TELEGRAM_REQUEST_TIMEOUT_MS` | Таймаут MTProto, по умолчанию 30000 мс |
| `CHANNEL_MAX_CONSECUTIVE_ERRORS` | Отключение после N последовательных ошибок, по умолчанию 10 |
| `OPENROUTER_API_KEY` | AI-отчёты и сканер событий |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Уведомления об изменениях аудитории и отключении каналов |
| `HEALTH_STUCK_THRESHOLD_MINUTES` | Порог зависшего SyncJob, по умолчанию 120 минут |
| `HEALTH_STALE_THRESHOLD_MINUTES` | Порог давности завершённого SyncJob, по умолчанию 720 минут |

Не все параметры перечислены в `.env.example` или передаются Compose. `MY_CHANNEL_USERNAME` есть в примере, но код его не читает: «Мой канал» назначается через UI/API. Поля AI на `/settings` сохраняются в БД, однако текущий клиент использует `OPENROUTER_API_KEY` и модель `z-ai/glm-5.3-flash` из кода. [Подробности конфигурации](docs/deployment.md).

## Разработка и проверки

```bash
npm test
npm run test:coverage
npx tsc --noEmit
npx eslint src
npm run build
```

`npm run lint` пока содержит `next lint`; CI запускает `npx eslint src` с `eslint.config.mjs`. При проверке используйте команду CI. Количество тестов не фиксируется в документации: актуальный результат даёт `npm test`.

GitHub Actions выполняет typecheck, ESLint, Vitest и затем build: push в `main`/`VPS_Ready`, PR в `main`, ручной запуск. Workflow не развёртывает приложение.

## Документация

- [Обзор продукта и ограничения](docs/overview.md)
- [Архитектура, схема хранения и потоки](docs/architecture.md)
- [Карта кодовой базы](docs/codebase.md)
- [Метрики и формулы](docs/analytics-formulas.md)
- [Полный справочник API](docs/api-reference.md)
- [Запуск, конфигурация и эксплуатация](docs/deployment.md)
- [Решение по архитектуре антифрода](docs/adr/0001-anti-fraud-detection-architecture.md)
- [Решение по Telegram-клиенту и статьям](docs/adr/0002-telegram-rich-messages.md)
- [Служебные скрипты](scripts/README.md)
- [Git-процесс](docs/git-workflow.md), [порядок работы с кодом](docs/codex-workflow.md)
- [Краткая карта проекта](PROJECT.md), [локальная памятка](skill.md)

## Допущения

1. Отключение мониторинга сохраняет историю; `DELETE /api/channels/:id?permanent=true` физически удаляет канал и связанные записи по каскадам Prisma.
2. Назначение «Моего канала» снимает предыдущий флаг в транзакции. Флаг можно снять совсем; уникального ограничения `isMine` в БД нет.
3. Сбор приватных каналов требует предварительного участия аккаунта сборщика.
4. Отсутствующие данные Telegram не равны нулю; подпись ячейки — объяснение UI, а не подтверждение причины отсутствия данных.
5. Точность истории зависит от расписания и доступной глубины сбора. Материализованные и сырые агрегаты имеют разные временные окна.
