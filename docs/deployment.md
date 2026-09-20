# Запуск и эксплуатация

Сверено 20 сентября 2026 года с [package.json](../package.json), [Compose](../docker-compose.yml), [dev override](../docker-compose.dev.yml), [Dockerfile.web](../Dockerfile.web), [Dockerfile.worker](../Dockerfile.worker) и [CI](../.github/workflows/ci.yml). Команды ниже — инструкции для оператора, а не подтверждение выполненного деплоя.

## Требования и подготовка

- Node.js 22 и npm — версия Node совпадает с Docker и CI.
- PostgreSQL; штатный Compose использует postgres:15. Prisma-схема требует расширение pg_trgm. SQLite текущим кодом не поддерживается.
- Для сбора — Telegram api_id/api_hash и пользовательская MTProto-сессия. Авторизация интерактивная: `npm run auth`.
- Все команды из корня проекта. На Windows основной checkout — `C:\TgMon`; в WSL — `/mnt/c/TgMon`. Установленные node_modules следует использовать в том окружении, где они были установлены.

```bash
npm ci
cp .env.example .env
```

Заполните конфигурацию, затем:

```bash
npm run prisma:generate
npm run auth
```

Авторизация обновляет TG_API_ID, TG_API_HASH, TG_SESSION и при наличии TG_PHONE в `.env`; строка сессии также печатается в терминал. Не включайте этот вывод в отчёты и логи общего доступа.

В `.env.example` приведены актуальные строки подключения к PostgreSQL (SQLite не поддерживается), а параметр MY_CHANNEL_USERNAME помечен как не используемый кодом. Ориентируйтесь на таблицу ниже и Prisma-схему. Runtime читает именно **TG_API_ID / TG_API_HASH / TG_SESSION**, не API_ID/API_HASH/TELEGRAM_SESSION.

## Переменные окружения

| Переменная | Потребитель | Default / смысл |
| --- | --- | --- |
| DATABASE_URL | Prisma, web, worker | URL PostgreSQL; для хоста адрес БД localhost/127.0.0.1, внутри Compose — postgres |
| TG_API_ID, TG_API_HASH | auth, MTProto | Ключи приложения Telegram |
| TG_PHONE | auth | Телефон; при отсутствии CLI запросит его |
| TG_SESSION | MTProto в web и worker | Сохранённая сессия |
| COLLECT_API_TOKEN | middleware, защищённые handlers, worker | Непустой общий токен; отсутствующий даёт 500 для мутаций |
| COLLECT_CRON | worker | `0 * * * *`; невалидное значение заменяется этим default с логом |
| COLLECT_ON_STARTUP | worker | Запуск только если значение строго `true`; пример и Compose задают true |
| DEMOGRAPHICS_CRON | worker | `0 3 * * 0`; при невалидном значении weekly fallback |
| WEB_INTERNAL_URL | worker | Нет default в коде collector; Compose default `http://web:4000` |
| TELEGRAM_REQUEST_TIMEOUT_MS | fetcher в web/worker | 30000 мс |
| CHANNEL_MAX_CONSECUTIVE_ERRORS | retry-policy | 10; отключение при достижении порога |
| TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID | retry-policy | Необязательные уведомления об изменениях аудитории и отключении |
| OPENROUTER_API_KEY | web AI/scanner | Обязателен для функций LLM |
| HEALTH_STUCK_THRESHOLD_MINUTES | web health | 120 |
| HEALTH_STALE_THRESHOLD_MINUTES | web health | 720 |
| MY_CHANNEL_USERNAME | Никем не читается | Сохранён в примере, но не назначает «Мой канал» |

Параметры DEMOGRAPHICS_CRON, CHANNEL_MAX_CONSECUTIVE_ERRORS и HEALTH-параметры приведены в `.env.example` с дефолтными значениями. Compose по умолчанию не передаёт их, а также TELEGRAM_REQUEST_TIMEOUT_MS, в environment контейнеров. Одного добавления переменной в `.env` недостаточно для Docker: добавьте нужное имя в environment сервиса либо используйте отдельный override. Не выводите развёрнутый `docker compose config` с реальными секретами в общий лог.

Ни compose, ни cron.schedule не задают timezone. Расписание и часть графиков используют часовой пояс процесса; дневная материализация — UTC. Учитывайте его при выборе расписания.

## Режим 1: Локальная разработка в Docker (рекомендуемый, Hot Reload)

Это основной и рекомендуемый способ локальной разработки. Сервисы `web` и `worker` запускаются внутри контейнеров Docker с монтированием директории проекта и поддержкой Hot Reload (Fast Refresh) без пересборки образов при изменении исходного кода.

### Пошаговая подготовка и запуск

1. **Запуск базы данных PostgreSQL**:
   ```bash
   docker compose up -d postgres
   ```

2. **Генерация Prisma Client и применение миграций к БД**:
   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   ```

3. **Интерактивная авторизация в Telegram (если сессия ещё не создана)**:
   ```bash
   npm run auth
   ```
   Утилита авторизует MTProto-клиент и сохранит параметры `TG_API_ID`, `TG_API_HASH`, `TG_SESSION` в файл `.env`.

4. **Запуск web и worker в dev-режиме через Compose override**:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
   ```

Web-интерфейс доступен по адресу [http://localhost:4000](http://localhost:4000). Встроенный Compose-default `WEB_INTERNAL_URL=http://web:4000` обеспечивает корректную связь воркера с web-сервисом внутри сети Docker.

### Как устроен Hot Reload в Docker

- Файл `docker-compose.dev.yml` переопределяет команду запуска сервиса `web` на `command: npm run dev` (`next dev -p 4000`), а `worker` — на `command: npx tsx watch src/worker/index.ts` (автоматический перезапуск воркера при изменениях в `src/worker/`).
- **Монтирование томов (Volumes)**:
  - `.:/app` — bind-mount рабочей директории хоста внутрь контейнера. Любые изменения файлов в `src/` мгновенно становятся видны в контейнере.
  - `/app/node_modules` и `/app/.next` — анонимные тома Docker. Они изолируют зависимости и кэш сборки Next.js от хостовой файловой системы, предотвращая конфликты бинарных модулей между хостом (например, Windows) и Linux-контейнером.
- **Опрос файловой системы**: в `docker-compose.dev.yml` задана переменная окружения `WATCHPACK_POLLING=true`. Это критически важно для сред Docker Desktop и WSL2 на Windows, где стандартные события файловой системы `inotify` могут не доставляться через bind-mount томов. Watchpack переходит на поллинг, корректно обнаруживает изменения и запускает Fast Refresh / Hot Reload без перезапуска контейнера.
- **Предостережение**: не запускайте `npm run dev` на хосте параллельно с Docker-контейнерами во избежание конфликтов портов и ошибок блокировки файлов Prisma engine (Windows EPERM).

## Режим 2: Запуск web и worker на хосте (альтернативный / отладочный)

Используется для быстрой изоляции проблем, отладки отдельных обработчиков или профилирования процессов на хосте без использования контейнеров для Node.js.

1. Запустите PostgreSQL из Compose:
   ```bash
   docker compose up -d postgres
   ```

2. Задайте в `.env` параметр `DATABASE_URL` с адресом `127.0.0.1:5432`, именем `tgmon` и учётными данными вашей базы (демонстрационные по умолчанию: `postgresql://postgres:password@localhost:5432/tgmon?schema=public`).

3. Примените миграции и запустите процессы:
   ```bash
   npm run prisma:migrate
   npm run dev:all
   ```
   Или в двух отдельных терминалах: `npm run dev` и `npm run worker`. Web доступен на [http://localhost:4000](http://localhost:4000). Для сброса кэша из воркера задайте `WEB_INTERNAL_URL=http://localhost:4000`.

## Режим 3: Production-развёртывание (полный Compose)

В production контейнеры компилируются в оптимизированные standalone-образы без монтирования локального исходного кода и без Hot Reload (`Dockerfile.web` выполняет `npm run build`, а запуск происходит через `npm start`).

1. Убедитесь, что MTProto-сессия получена (`TG_SESSION` в `.env`).
2. В `.env` задайте **`WEB_INTERNAL_URL=http://web:4000`**: значение `localhost` из примера перекроет default YAML и направит worker к самому себе.
3. Запустите PostgreSQL и соберите production-образы:
   ```bash
   docker compose up -d postgres
   docker compose build web worker
   ```
4. Дождитесь готовности PostgreSQL и примените миграции через одноразовый контейнер:
   ```bash
   docker compose run --rm --no-deps worker npm run prisma:migrate
   docker compose up -d web worker
   ```

`depends_on` задаёт порядок запуска, но без healthcheck не гарантирует готовность БД. Ни Dockerfile, ни CMD не выполняют migrate автоматически. DATABASE_URL обоих приложений в YAML задан явно и не наследует одноимённую переменную из `.env`.

Web публикует 4000:4000, PostgreSQL — 5432:5432. Для сетевого размещения замените демонстрационный пароль согласованно в postgres и URL обоих приложений, ограничьте публикацию БД и доступ к web. Изменение POSTGRES_PASSWORD в YAML само по себе не меняет пароль существующего пользователя в уже созданном volume.

## Миграции и демонстрационные данные

- `npm run prisma:migrate` выполняет **prisma migrate deploy**: применяет существующие миграции, не создаёт новые.
- `npm run prisma:generate` обновляет клиент, не меняя БД. `npm run build` также запускает генерацию перед Next build.
- `npm run prisma:push` синхронизирует схему без истории миграций; не используйте его как обычную процедуру обновления существующей БД.
- `npm run seed` удаляет посты, снимки и каналы, затем создаёт демонстрационные данные. Только отдельная тестовая база.
- Для Windows EPERM при генерации проверьте Node-процессы именно этого проекта, которые могут удерживать Prisma engine; остановите нужные процессы перед повтором.

Текущая последовательность миграций включает fraud_signals, post_view_snapshots и nullable country_breakdown. Последняя — `20260916213000_add_demographics_country`; она не заполняет географию и не переписывает языковые снимки. Перед обновлённым worker примените все миграции и пересоберите приложения.

## Обновление существующего окружения

Сделайте резервную копию БД и выберите проверенный revision. Для работающих сервисов согласуйте окно остановки: миграции и перезапуск могут прервать сбор. После получения кода и проверки конфигурации:

```bash
docker compose stop web worker
docker compose build web worker
docker compose run --rm --no-deps worker npm run prisma:migrate
docker compose up -d web worker
```

Для запуска на хосте остановите процессы этого проекта, выполните `npm ci`, `npm run prisma:migrate`, `npm run build`, затем запустите `npm start` и `npm run worker` под выбранным менеджером процессов. В репозитории нет PM2 ecosystem-файла или update.sh, поэтому они не являются частью штатного деплоя. Не перезапускайте все процессы сервера общей командой.

Обратное переключение исходников не откатывает схему/данные. Стратегия отката зависит от SQL конкретной миграции и резервной копии. `docker compose down -v` удаляет volume БД и не нужен для обычного обновления.

## Доступ и обратный прокси

Текущий middleware не аутентифицирует пользователя: он автоматически добавляет серверный Bearer в мутации без Authorization. GET /api/settings возвращает сохранённый aiToken; настройки и scanner не проверяют Bearer в handler. Публичный доступ к :4000 нельзя считать защищённым COLLECT_API_TOKEN. Размещайте приложение в доверенной сети либо за внешней аутентификацией/ограничением доступа.

Если используется Nginx, upstream — `http://127.0.0.1:4000`. Таймауты должны учитывать синхронный ручной сбор и AI/scanner (до 60/120 секунд для вызова LLM плюс работа с БД). Конфигурация Nginx/TLS и внешний вход в репозитории отсутствуют.

## Проверка после запуска

```bash
docker compose ps
curl -i http://localhost:4000/api/health
```

Логи нужного сервиса можно изучить локально через `docker compose logs --tail=100 worker` или `web`; они могут содержать данные каналов, поэтому перед публикацией их нужно обезличить.

Health без SyncJob возвращает 503. Зависший незавершённый цикл старше 120 минут и завершённый старше 720 минут также дают 503. **Свежий FAILED/PARTIAL может вернуть 200**: проверяйте lastSyncStatus и channelsFailed в теле. UI отдельно считает канал stale после 3 часов.

Проверьте доступность главной, добавленного канала и последних метрик. Отсутствие демографии не обязательно ошибка запуска: задание недельное и требует canViewStats. Рекламные точки появляются отдельным cron в :15, если найдены подходящие isAd-посты. Ни демография, ни рекламный сбор не выполняются startup-триггером основного цикла.

## AI и настройки

Для генерации задайте OPENROUTER_API_KEY web-процессу. `callOpenRouter` использует модель `z-ai/glm-5.3-flash`, JSON response format и timeout 60 секунд; scanner — 120 секунд. Фактическая доступность модели зависит от провайдера. Сохранение aiProvider/aiModel/aiToken через `/settings` пока не меняет работу этого клиента.

## Зависимости и CI

Используйте `npm ci` с зафиксированным lockfile. package.json содержит overrides: next → postcss 8.5.26 и sharp 0.35.4; @prisma/config → deepmerge-ts 8.0.2. Пересматривайте их при обновлении родительских пакетов; наличие override само по себе не подтверждает отсутствие уязвимостей.

CI использует Node 22: Prisma generate, `npx tsc --noEmit`, `npx eslint src`, `npm test`, затем `npm run build`. Скрипт `npm run lint` всё ещё содержит next lint; ориентир проверки — команда ESLint из CI. Workflow срабатывает на push main/VPS_Ready, PR в main и вручную. Автоматического деплоя в нём нет. Совместимость cron и Prisma config проверяется отдельными unit-тестами; результаты нужно получать текущим запуском, а не брать из старых отчётов.
