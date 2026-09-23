# Запуск и эксплуатация

Сверено 23 сентября 2026 года с [package.json](../package.json), [Compose](../docker-compose.yml), [dev override](../docker-compose.dev.yml), [Dockerfile.web](../Dockerfile.web), [Dockerfile.worker](../Dockerfile.worker) и [CI](../.github/workflows/ci.yml). Команды ниже — инструкции для оператора, а не подтверждение выполненного деплоя.

## Требования и подготовка

- Node.js 22 и npm — версия Node совпадает с Docker и CI.
- PostgreSQL; штатный Compose использует postgres:15. Prisma-схема требует расширение pg_trgm. SQLite текущим кодом не поддерживается.
- Для сбора — Telegram api_id/api_hash и пользовательская MTProto-сессия. Авторизация интерактивная: `npm run auth`.
- Все команды из корня проекта. На Windows основной checkout — `C:\TgMon`; в WSL — `/mnt/c/TgMon`. Установленные node_modules следует использовать в том окружении, где они были установлены. Prisma Client генерируется для целевой ОС: Windows-клиент не заменяет Linux-клиент в WSL, Docker генерирует свой клиент внутри образа.

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

В `.env.example` остались комментарии про SQLite и неиспользуемый MY_CHANNEL_USERNAME. Ориентируйтесь на таблицу ниже и Prisma-схему. Runtime читает именно **TG_API_ID / TG_API_HASH / TG_SESSION**, не API_ID/API_HASH/TELEGRAM_SESSION.

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

DEMOGRAPHICS_CRON, CHANNEL_MAX_CONSECUTIVE_ERRORS и HEALTH-параметры отсутствуют в `.env.example`. Compose не передаёт их, а также TELEGRAM_REQUEST_TIMEOUT_MS, в environment контейнеров. Одного добавления переменной в `.env` недостаточно для Docker: добавьте нужное имя в environment сервиса либо используйте отдельный override. Не выводите развёрнутый `docker compose config` с реальными секретами в общий лог.

Ни compose, ни cron.schedule не задают timezone. Расписание и часть графиков используют часовой пояс процесса; дневная материализация — UTC. Учитывайте его при выборе расписания.

## Режим 1: web и worker на хосте

PostgreSQL можно запустить из Compose:

```bash
docker compose up -d postgres
```

После готовности БД задайте в `.env` DATABASE_URL с адресом `127.0.0.1:5432`, именем `tgmon` и учётными данными **вашей** базы. Штатный YAML использует демонстрационные postgres/password.

```bash
npm run prisma:migrate
npm run dev:all
```

Или два терминала: `npm run dev` и `npm run worker`. Web — [localhost:4000](http://localhost:4000). Для сброса кэша задайте WEB_INTERNAL_URL=http://localhost:4000.

## Режим 2: Docker PostgreSQL/worker, Next.js на хосте

Это локальная схема с hot reload web. Установите зависимости, сгенерируйте Prisma Client, выполните auth и миграции на хосте как выше. Для worker укажите WEB_INTERNAL_URL=http://host.docker.internal:4000, затем:

```bash
docker compose up -d --build postgres worker
npm run dev
```

На Docker Desktop адрес host.docker.internal используется для доступа к хосту. В Linux при необходимости добавьте worker `extra_hosts: ["host.docker.internal:host-gateway"]` в локальный override. Если имя недоступно, задайте доступный из контейнера адрес хоста. Web должен быть запущен к моменту инвалидации; ранний startup-cycle может завершиться до него.

Встроенный Compose-default `http://web:4000` подходит для режима 3, но не для отсутствующего web-контейнера. Не запускайте одновременно второй обычный worker на хосте.

## Режим 3: полный Compose

Сначала получите TG_SESSION. В `.env` задайте **WEB_INTERNAL_URL=http://web:4000**: значение localhost из примера иначе перекроет default YAML и направит worker к самому себе.

```bash
docker compose up -d postgres
docker compose build web worker
```

Дождитесь готовности PostgreSQL и примените миграции:

```bash
docker compose run --rm --no-deps worker npm run prisma:migrate
docker compose up -d web worker
```

`depends_on` задаёт порядок запуска, но без healthcheck не гарантирует готовность БД. Ни Dockerfile, ни CMD не выполняют migrate автоматически. DATABASE_URL обоих приложений в YAML задан явно и не наследует одноимённую переменную из `.env`.

Web публикует 4000:4000, PostgreSQL — 5432:5432. Для сетевого размещения замените демонстрационный пароль согласованно в postgres и URL обоих приложений, ограничьте публикацию БД и доступ к web. Изменение POSTGRES_PASSWORD в YAML само по себе не меняет пароль существующего пользователя в уже созданном volume.

`docker-compose.dev.yml` — дополнительный override, не самостоятельная конфигурация:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

Он включает `npm run dev` для web, `tsx watch` для worker и bind mount проекта с отдельными volumes для node_modules/.next. Этот режим сохраняет сборочные требования базовых Dockerfile и отличается от рекомендуемого локального web на хосте.

## Порт 4000 и Docker Desktop / WSL

Полный Compose публикует TgMon на `http://localhost:4000/`. На этом порту не должен работать другой Next.js-проект или локальный `npm run dev` того же TgMon. Статуса `running` у контейнера недостаточно: в `docker compose ps` ожидается публикация вида `0.0.0.0:4000->4000/tcp`, а не только `4000/tcp`.

```bash
docker compose ps
docker compose port web 4000
curl -i http://localhost:4000/
curl -i http://localhost:4000/api/health
```

Если браузер показывает другое приложение, страницу входа или 404 для health, определите владельца порта: в WSL — `ss -ltnp 'sport = :4000'`, в PowerShell — `Get-NetTCPConnection -State Listen -LocalPort 4000`. При работе через WSL проверьте обе стороны. Уточните рабочую папку процесса; не останавливайте все Node.js-процессы. После согласованной остановки конфликтующего сервиса можно повторно создать только web:

```bash
docker compose up -d --no-deps --force-recreate web
```

Команда использует текущий собранный образ web и заново применяет публикацию порта; новый образ не собирается, PostgreSQL и worker не пересоздаются. Повторите HTTP-проверки именно с хоста, а не только из контейнера. Внутренний успешный ответ не доказывает, что браузер попадает в нужное приложение.

Если команда `docker` в WSL сообщает об отсутствии интеграции Docker Desktop, выполните те же команды в Windows PowerShell из `C:\TgMon` либо используйте установленный Windows `docker.exe`. Это проблема доступа к Docker, а не повод создавать другую копию проекта.

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

Если миграций нет, образы можно собрать до переключения, пока старые сервисы работают:

```bash
docker compose build web worker
docker compose up -d --no-deps web worker
```

Изменения MTProto-клиента и общего сборщика требуют обновления **web и worker**: ручной `/api/collect/run` выполняется в web. Для поддержки статей используется `teleproto@1.229.0` под alias `telegram`; новая миграция и повторная авторизация только из-за этой замены не требуются. Уже сохранённые статьи останутся текстом при смене версии клиента, но старый клиент не сможет получать новые rich-сообщения. [ADR 0002](adr/0002-telegram-rich-messages.md).

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

При `COLLECT_ON_STARTUP=false` перезапуск worker не создаёт новый SyncJob: health до следующего цикла показывает прежний результат. Для проверки нового сборщика дождитесь cron или выполните один ручной сбор кнопкой в UI / `POST /api/collect/run`; не запускайте параллельно несколько циклов. Проверяйте `result.successCount/errorCount`, затем `lastSyncStatus=COMPLETED` и `channelsFailed=0`. Сам ответ `success:true` не гарантирует успех всех каналов.

Проверьте доступность главной, добавленного канала и последних метрик. Отсутствие демографии не обязательно ошибка запуска: задание недельное и требует canViewStats. Рекламные точки появляются отдельным cron в :15, если найдены подходящие isAd-посты. Ни демография, ни рекламный сбор не выполняются startup-триггером основного цикла.

## Восстановление ранее пустых статей

После обновления обоих образов утилита читает старые пустые посты по ID, даже если они уже вне последних 200 сообщений. N — внутренний ID канала TgMon. Сначала выполните проверку:

```bash
docker compose exec worker npx tsx scripts/backfill-articles.ts --channel-id=N
```

Проверьте `recoverable` и `unavailable`, затем выполните сохранение:

```bash
docker compose exec worker npx tsx scripts/backfill-articles.ts --channel-id=N --apply
```

Обновляются только пустые тексты статей, их рекламная классификация и упоминания. Миграций, пересоздания постов и изменения счётчиков нет. Для больших выборок используйте `--limit` и `--after-id` по [инструкции](../scripts/README.md#восстановление-текста-статей). Не все пустые сообщения являются статьями; обычные медиа без подписи не получат вымышленный текст.

Утилита не сбрасывает web-кэш. После записи дождитесь его истечения (метрики — 5 минут), вызовите штатный `POST /api/internal/invalidate-cache` с Bearer-токеном из защищённого окружения либо проверьте после следующего успешного основного сбора. Не вставляйте реальный токен в документацию или общий терминальный лог. Поиск `/api/posts/search` не кэшируется этим кэшем.

Повторный dry-run не должен вновь предлагать уже восстановленные статьи. Откройте публикацию в TgMon, проверьте полный текст и прокрутку на десктопной и мобильной ширине. Сохранённые AI-отчёты не переписываются; нужные отчёты создайте заново через UI.

## AI и настройки

Для генерации задайте OPENROUTER_API_KEY web-процессу. `callOpenRouter` использует модель `z-ai/glm-5.3-flash`, JSON response format и timeout 60 секунд; scanner — 120 секунд. Фактическая доступность модели зависит от провайдера. Сохранение aiProvider/aiModel/aiToken через `/settings` пока не меняет работу этого клиента.

## Зависимости и CI

Используйте `npm ci` с зафиксированным lockfile. package.json содержит overrides: next → postcss 8.5.26 и sharp 0.35.4; @prisma/config → deepmerge-ts 8.0.2. Пересматривайте их при обновлении родительских пакетов; наличие override само по себе не подтверждает отсутствие уязвимостей.

CI использует Node 22: Prisma generate, `npx tsc --noEmit`, `npx eslint src`, `npm test`, затем `npm run build`. Скрипт `npm run lint` вызывает работающий в Next.js 15, но устаревающий `next lint`; CI использует прямой вызов ESLint. При ограничениях запуска тестовых процессов можно проверить `npm test -- --maxWorkers=2`; это не меняет набор тестов. Workflow срабатывает на push main/VPS_Ready, PR в main и вручную. Автоматического деплоя в нём нет. Совместимость cron и Prisma config проверяется отдельными unit-тестами; результаты нужно получать текущим запуском, а не брать из старых отчётов.
