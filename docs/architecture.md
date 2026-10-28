# Архитектура TgMon

Состояние реализации сверено **27 октября 2026 года**. Источники: [Prisma-схема](../prisma/schema.prisma), [база данных](database.md), [worker](../src/worker/index.ts), [коллектор](../src/worker/collector.ts), [запросы метрик](../src/lib/metrics/queries.ts) и [Compose](../docker-compose.yml).

## 1. Контекст и контейнерная архитектура

```mermaid
flowchart TB
    subgraph Users["Пользователи (Браузер)"]
        Admin["Администратор (role = ADMIN)"]
        RegularUser["Пользователь (role = USER)"]
    end

    subgraph TgMon["Система TgMon (Docker Compose / Node.js 22)"]
        subgraph WebContainer["Контейнер Web App и REST API (:4000)"]
            MW["Middleware (Cookie v2/v1, Origin CSRF, Bearer)"]
            UI["Next.js 15 App Router UI (React 19, Recharts)"]
            API["Route Handlers (/api/channels, /stats, /posts, /ai, /events, /alerts, /settings, /ops)"]
            Cache["In-memory Cache (metricsCache 5м, bestTimeCache 30м, AI config 30с)"]
        end

        subgraph WorkerContainer["Контейнер MTProto Worker (:4001)"]
            WServer["Внутренний HTTP-сервер (:4001, Bearer)"]
            Cron["Планировщики node-cron (Collect, Demographics, Ad Reach, Digest, Events Scan)"]
            Coord["TaskCoordinator (последовательная очередь задач)"]
            Collector["Сборщик teleproto (collector, fetcher, persister, retry-policy)"]
        end

        DB[("PostgreSQL 15 + pg_trgm (22 таблицы, Advisory Lock)")]
    end

    subgraph External["Внешние системы"]
        TG["Telegram MTProto API (TG_SESSION на сервере / TG_SESSION_LOCAL локально)"]
        Bot["Telegram Bot API (Алерты и дайджесты)"]
        OR["OpenRouter API (LLM z-ai/glm-5.3-flash + Jev ~typesafe/jev-latest)"]
    end

    Admin -->|HTTPS| MW
    RegularUser -->|HTTPS| MW
    MW --> UI
    MW --> API
    API <--> Cache
    API -->|Prisma ORM| DB
    API -->|Генерация 9 AI-отчётов и скан событий| OR
    API -->|POST /collect, /channels/add (Bearer)| WServer

    Cron --> Coord
    WServer --> Coord
    Coord --> Collector
    Collector -->|MTProto TCP| TG
    Collector -->|Prisma ORM + pg_try_advisory_xact_lock| DB
    Collector -->|POST /api/internal/invalidate-cache (Bearer)| API
    Collector -->|Уведомления AlertRule и дайджесты| Bot
```

Web и worker работают отдельными Node.js-процессами. Web передаёт добавление канала и ручной сбор в закрытый HTTP API worker на порту 4001 с Bearer-токеном; порт не публикуется из Compose. Только worker использует MTProto-сессию:
- На боевом сервере (`ovh-vps`) worker работает с серверной сессией `TG_SESSION` (`TgMon Server Worker`) и выполняет фоновый сбор по расписанию cron.
- Локально worker использует отдельную сессию `TG_SESSION_LOCAL` (`TgMon Local Dev`) при `--local` или `WORKER_LOCAL_MODE=true`. `npm run worker:local` отключает cron флагом `--no-cron`; `bash dev-web.sh` запускает dev Compose, где cron по умолчанию включён. Режим локальной сессии сам по себе расписания не отключает.

---

## 2. Слои приложения и компонентная схема

| Слой | Модули и ответственность |
| --- | --- |
| UI | `src/app/`, `src/components/`: страницы, интерактивные таблицы, графики, отчёты; главная и детализация загружают метрики через API |
| API | `src/app/api/`: чтение и управление каналами, статистика, AI (9 маршрутов), события, сохранённые изображения постов, удаление отчётов, настройки, алерты, дайджест, health и экспорт |
| Метрики | `src/lib/metrics/queries.ts`, `aggregate.ts`, `calculate.ts`, `engagement.ts`, `adShare.ts`; публичные реэкспорты в `src/lib/metrics.ts` |
| Производные оценки | `ep.ts`, `scoring.ts`, `fraudDetector.ts`, `citationIndex.ts`, `adAttribution.ts`, `pricing.ts`, `silenceDetector.ts`, `viralPosts.ts` |
| События и календарь | `src/lib/events/jev.ts`, `digest.ts`, `matching.ts`, `calendar.ts` (`.ics` и Google Calendar) |
| Уведомления и дайджест | `src/lib/alerts.ts`, `src/lib/digest.ts`, `src/lib/telegram.ts` |
| Сбор | `client.ts` → `fetcher.ts` → `collector.ts` → `persister.ts`; текст в `message-content.ts`, реакции в `message-reactions.ts`, упоминания в `post-mentions.ts`, изображения в `post-image.ts`, ошибки в `retry-policy.ts` |
| Дополнительные задания | `worker/demographics.ts`, `worker/ad-reach.ts` |
| Хранение и кэш | `prisma.ts`, `materialize.ts`, `cache.ts` |

### Компонентная архитектура Web & API

```mermaid
flowchart TB
    subgraph Presentation["Слой представления (src/app, src/components)"]
        Pages["Страницы App Router (/, /channel/:id, /posts, /compare, /reports, /events, /settings, /login)"]
        Widgets["Виджеты и графики (ChannelsTable, MyChannelCard, CitationNetworkWidget, AIReportsSection, EventCard)"]
    end

    subgraph Security["Контур безопасности и ролей"]
        Middleware["src/middleware.ts + src/lib/auth.ts (Проверка сессий v2/v1, роли ADMIN/USER, Origin CSRF)"]
        Scope["src/lib/users.ts (Фильтрация по UserChannel, изоляция данных пользователя)"]
    end

    subgraph Routes["Маршруты API (src/app/api)"]
        StatsAPI["/api/stats/* и /api/channels/*"]
        PostsAPI["/api/posts/search и /api/posts/advertisers"]
        AiAPI["/api/ai/* (9 генераторов отчётов)"]
        EventsAPI["/api/events/* (Список, скан, скрытие)"]
        AdminOpsAPI["/api/settings, /api/admin/registrations, /api/ops/status, /api/alerts"]
    end

    subgraph Domain["Доменное ядро и аналитика (src/lib)"]
        MetricsEngine["metrics/queries.ts, aggregate.ts, calculate.ts, engagement.ts"]
        ScoringEngine["ep.ts, scoring.ts, silenceDetector.ts, viralPosts.ts"]
        FraudCitation["fraudDetector.ts (runFraudAudit), citationIndex.ts, adAttribution.ts, pricing.ts"]
        EventsEngine["events/jev.ts, digest.ts, matching.ts, calendar.ts"]
        OpenRouterClient["openrouter.ts + ai-reports.ts + ai-markdown.ts"]
        InMemCache["cache.ts (metricsCache, bestTimeCache)"]
    end

    Pages --> Widgets
    Widgets -->|fetch JSON| Middleware
    Middleware --> StatsAPI
    Middleware --> PostsAPI
    Middleware --> AiAPI
    Middleware --> EventsAPI
    Middleware --> AdminOpsAPI

    StatsAPI --> Scope
    PostsAPI --> Scope
    AiAPI --> Scope
    EventsAPI --> Scope

    StatsAPI --> InMemCache
    StatsAPI --> MetricsEngine
    MetricsEngine --> ScoringEngine
    MetricsEngine --> FraudCitation
    PostsAPI --> FraudCitation
    AiAPI --> OpenRouterClient
    EventsAPI --> EventsEngine
    EventsEngine --> OpenRouterClient
```

### Архитектура фонового Worker и координация задач

```mermaid
flowchart LR
    subgraph Triggers["Источники запуска"]
        HTTP["HTTP :4001 (/collect, /channels/add)"]
        CronCollect["Cron: COLLECT_CRON (0 * * * *)"]
        CronDemo["Cron: DEMOGRAPHICS_CRON (0 3 * * 0)"]
        CronAd["Cron: Ad Reach (15 * * * *)"]
        CronDigest["Cron: Digest (*/5 * * * *)"]
        CronEvents["Cron: EVENTS_SCAN_CRON (опционально)"]
    end

    subgraph Queue["Координация (src/worker/task-coordinator.ts)"]
        TC["Последовательная очередь задач (1 активная задача MTProto в процессе)"]
        Lock["PostgreSQL Advisory Lock (захват SyncJob RUNNING)"]
    end

    subgraph Tasks["Обработчики задач"]
        MainCollect["runCollectCycle (collector.ts)"]
        Backfill["addAndBackfillChannel (collector.ts)"]
        DemoJob["collectAudienceDemographics (demographics.ts)"]
        AdJob["collectAdReachSnapshots (ad-reach.ts)"]
        DigestJob["sendDailyDigestIfDue + sendUserDigestsIfDue (digest.ts)"]
        EventsJob["POST /api/events/scan (через защищённый Web API)"]
    end

    HTTP -->|409 если main-collect уже идёт| TC
    CronCollect --> TC
    CronDemo --> TC
    CronAd --> TC

    TC --> MainCollect
    TC --> Backfill
    TC --> DemoJob
    TC --> AdJob

    MainCollect --> Lock
    CronDigest -->|Прямой вызов БД + Bot API| DigestJob
    CronEvents -->|HTTP Bearer к Web| EventsJob
```

`src/worker/task-coordinator.ts` ставит основной сбор, демографию, рекламный охват и первичный backfill в одну последовательную очередь. Повторный запрос основного сбора получает 409. Создание `SyncJob` сериализовано транзакционным advisory lock PostgreSQL; активный `RUNNING` блокирует второй цикл между процессами. `RUNNING` старше порога `HEALTH_STUCK_THRESHOLD_MINUTES` (по умолчанию 120 минут) помечается `FAILED` перед новым запуском. При `SIGINT`/`SIGTERM` worker прекращает приём задач, ждёт активное задание до 30 секунд и останавливает основной сбор между каналами, завершает `SyncJob` как `PARTIAL`/`FAILED` при прерывании и отключает `TelegramClient`.

Очередь действует в одном процессе worker. Для одновременного запуска нескольких worker демография и рекламный охват потребуют отдельной межпроцессной координации; штатный Compose запускает один worker.

---

## 3. Многопользовательская изоляция и модель данных

```mermaid
flowchart TB
    subgraph AuthModes["Способы аутентификации (/login и API)"]
        LoginPass["Логин + Пароль (PBKDF2-SHA256)"]
        TelegramOIDC["Telegram OIDC (вход и заявка)"]
        MasterKey["Мастер-ключ (COLLECT_API_TOKEN)"]
    end

    subgraph SessionTypes["Типы сессий и заголовков"]
        CookieV2["HttpOnly Cookie v2 (userId, role: ADMIN | USER, 12ч)"]
        CookieV1["HttpOnly Cookie v1 (резервный мастер-вход ADMIN)"]
        Bearer["Authorization: Bearer (межсервисный доступ worker <-> web)"]
    end

    Review["User.accessStatus: PENDING, ACTIVE, BLOCKED"]
    AdminDecision["ADMIN: одобрить, удалить заявку или заблокировать"]

    subgraph PersonalWorkspace["Персональное пространство пользователя (изоляция по userId)"]
        UC["UserChannel (список каналов, isMine, isFavorite, niche, customAdPriceUah, customCpmUah)"]
        AIR["AiReport (личная история отчётов; persona скрыт от USER)"]
        AR["AlertRule + AlertRuleFire + AlertRulePostFire (личные правила уведомлений)"]
        UDE["UserDismissedEvent (персонально скрытые карточки Афиши)"]
        UDigest["User.telegramChatId + digestEnabled + digestHour (личный дайджест)"]
    end

    subgraph SharedPool["Общий пул данных системы (собирается один раз для всех)"]
        Ch["Channel, Snapshot, ChannelMetricDaily, AudienceDemographics, FraudSignal"]
        Posts["Post, PostImage, PostSnapshot, PostViewSnapshot, Mention"]
        Ev["Event, EventMention"]
        Sys["SystemSetting (общий ключ и модель OpenRouter, глобальный дайджест)"]
    end

    LoginPass --> CookieV2
    TelegramOIDC --> Review
    AdminDecision --> Review
    Review --> CookieV2
    MasterKey --> CookieV1
    MasterKey --> Bearer

    CookieV2 -->|Только ACTIVE после проверки БД| PersonalWorkspace
    PersonalWorkspace -->|Чтение только подключённых каналов| SharedPool
    CookieV1 -->|Полный доступ ADMIN| SharedPool
    CookieV1 -->|Управление /settings и заявками| Sys
```

Полная спецификация моделей PostgreSQL 15, типов полей, вторичных индексов, перечислений и каскадов приведена в документе [База данных и схема Prisma](database.md).

Схема `prisma/schema.prisma` включает **24 модели** и два перечисления: `SyncStatus` для заданий worker и `UserAccessStatus` для заявок и блокировок. Роль пользователя хранится строкой `User.role` (`ADMIN` или `USER`):

| Prisma-модель | Таблица | Назначение |
| --- | --- | --- |
| `User` | `users` | Учётные записи (`username`, необязательный `passwordHash`, `telegramSub`, `accessStatus`, `role`, настройки дайджеста) |
| `InviteCode` | `invite_codes` | Исторические коды; новая регистрация их не использует |
| `UserChannel` | `user_channels` | Персональные подписки пользователя на каналы (`isMine`, `isFavorite`, `niche`, `customAdPriceUah`, `customCpmUah`, `isActive`); unique `(userId, channelId)` |
| `UserDismissedEvent` | `user_dismissed_events` | Персонально скрытые пользователем карточки событий; unique `(userId, eventId)` |
| `Channel` | `channels` | Общий пул Telegram-каналов: идентификаторы, тип, ниша, статус и ошибки сбора |
| `Snapshot` | `snapshots` | История численности аудитории |
| `Post` | `posts` | Текущие счётчики, разбивка реакций (`reactionBreakdown`), формат (`contentType`) и текст публикации; unique `(channelId, messageId)` |
| `PostImage` | `post_images` | Одно изображение поста до 1 МБ; байты и MIME-тип хранятся отдельно от строки Post |
| `PostSnapshot` | `post_snapshots` | Нерегулярная история просмотров свежих постов для LTV |
| `PostViewSnapshot` | `post_view_snapshots` | Рекламные контрольные точки (1, 12, 24, 48 часов); unique `(postId, hoursAfterPost)` |
| `Mention` | `mentions` | Ссылка из собранного поста на `username`/`tgId`/`targetMessageId`; target не является внешним ключом на Channel |
| `SyncJob` | `sync_jobs` | Начало/конец цикла, статус (`SyncStatus`), счётчики и краткая ошибка |
| `ChannelMetricDaily` | `channel_metrics_daily` | Дневные агрегаты UTC; unique `(channelId, date)` |
| `AudienceDemographics` | `audience_demographics` | Языковые доли, доля включённых уведомлений (`notificationsEnabledPercent`), дата снимка, nullable JSONB `countryBreakdown` |
| `AiReport` | `ai_reports` | Тип (9 видов отчётов) и строковый JSON-ответ LLM, необязательный `channelId` и `userId` владельца отчёта |
| `Event` | `events` | Мероприятия и события, извлечённые из публикаций Telegram |
| `EventMention` | `event_mentions` | Связи M:N событий с исходными постами; unique `(eventId, postId)` |
| `SystemSetting` | `system_settings` | Запись `global` с общими настройками AI (`aiToken`, `aiModel`) и полями глобального дайджеста |
| `AlertRule` | `alert_rules` | Глобальные и канальные правила Telegram-уведомлений (метрики, `keyword`, `viralPostMultiplier`) с привязкой `userId` |
| `AlertRuleFire` | `alert_rule_fires` | Время последней отправки и значение для пары «правило и канал» (24ч cooldown) |
| `AlertRulePostFire` | `alert_rule_post_fires` | Фиксация отправленных постовых алертов (`keyword` и `viralPostMultiplier`) для пары «правило и пост» |
| `FraudSignal` | `fraud_signals` | Тип, значение, причина и время срабатывания эвристики |

Миграции находятся в `prisma/migrations/` (**26 миграций**). Последние миграции в репозитории:
- `20261026210800_add_user_personal_digest` — поля персонального Telegram-дайджеста в таблице `users`;
- `20261026201200_add_keyword_alert_rules` — колонка `alert_rules.keyword_query` и таблица `alert_rule_post_fires`;
- `20261026162020_add_user_channel_ad_pricing` — персональные цены рекламы `custom_ad_price_uah` и `custom_cpm_uah` в `user_channels`;
- `20261026153255_add_mention_target_message_id` — `mentions.target_message_id` для цепочек цитирования;
- `20261026132043_add_post_reaction_breakdown` — `posts.reaction_breakdown` (JSONB);
- `20261024195714_add_events_scanned_at` — `posts.events_scanned_at`.

Схема включает `pg_trgm` и GIN-индекс текста постов. Отключение канала меняет `isActive`; физическое удаление использует каскады связей Prisma. `isMine` переносится транзакцией, но уникального ограничения в БД нет. `SystemSetting.aiToken` хранится в БД; API возвращает только признак наличия и маскированное превью.

---

## 4. Основной цикл сбора, алертинга и антифрода

```mermaid
sequenceDiagram
    autonumber
    participant S as Очередь worker (cron / POST collect)
    participant C as runCollectCycle
    participant T as Telegram MTProto
    participant D as PostgreSQL
    participant B as Telegram Bot API
    participant W as Web Cache (/api/internal/invalidate-cache)

    S->>C: Запуск задачи main-collect
    C->>D: Транзакционный advisory lock и создание SyncJob (RUNNING)
    loop Каждый активный канал (Channel.isActive = true)
        C->>T: Resolve и GetFullChannel (участники, название)
        opt Доступна численность аудитории
            C->>D: Запись Snapshot
        end
        C->>T: Чтение сообщений (до 1000 при первом сборе / до 200 далее)
        opt Частичная статья (richMessage.part = true)
            C->>T: getRichMessage с retry и timeout
        end
        C->>C: Разбор текста, реакций, формата, рекламы (detectAd) и упоминаний
        C->>D: Upsert Post, Mention, PostSnapshot (для постов моложе 72ч)
        opt Подходящее фото или изображение-документ до 1 МБ
            C->>T: Скачать изображение поста
            C->>D: Upsert PostImage
        end
        C->>D: Обновить статус канала и прогресс SyncJob
        C->>D: materializeDailyMetrics(channelId, 30)
        C->>D: Проверка числовых AlertRule (резерв AlertRuleFire, cooldown 24ч)
        C->>D: Проверка постовых AlertRule (keyword и viralPostMultiplier, резерв AlertRulePostFire)
        opt Найдены сработавшие правила и настроен Bot API
            C->>B: Отправка уведомлений (в личный или системный chatId)
        end
        C->>D: Запуск 4 эвристик антифрода и синхронизация FraudSignal
    end
    C->>D: Очистка старых PostSnapshot (>30 дней) и завершение SyncJob (COMPLETED / PARTIAL)
    C->>W: POST /api/internal/invalidate-cache (Bearer)
```

1. Первый сбор получает до 1000 сообщений и оставляет последние 30 дней; последующие циклы перечитывают до 200 последних сообщений без `min_id`. `lastMessageId` хранит максимум, но не ограничивает текущий запрос.
2. `FullChannel` даёт число участников. При изменении названия оно обновляется; отдельного суточного задания метаданных нет. Ошибка `FullChannel` может оставить доступный fallback-счётчик, таймаут передаётся выше.
3. После материализации worker оценивает включённые `AlertRule`:
   - для числовых метрик канала применяется cooldown 24 часа на пару «правило и канал» (`AlertRuleFire`);
   - для правил по ключевым словам (`metric = "keyword"`) и виральным постам (`metric = "viralPostMultiplier"`, превышение 30-дневной медианы просмотров в `threshold` раз при минимум 5 постах и ≥100 просмотрах) проверяются свежие посты за последние 24 часа, а отправка фиксируется однократно на пару «правило и пост» (`AlertRulePostFire`).
   - если у владельца правила задан `User.telegramChatId`, уведомление отправляется в его личный чат; иначе используется системный `TELEGRAM_CHAT_ID`. Ошибка уведомления не прерывает основной сбор.
4. Альбомы сводятся к существующему посту с тем же `groupedId`. Upsert обновляет известные счётчики, `reactionBreakdown` и текст, а `subscribersAtPublish` задаёт только при создании. Для backfill это число участников во время сбора.
5. Для постов не старше 72 часов с известными просмотрами создаётся `PostSnapshot` не чаще одного раза в 45 минут на пост. Снимки старше 30 дней удаляются ограниченными партиями в конце основного цикла. Упоминания при непустом новом списке удаляются и создаются заново; `createdAt` отражает время записи, не исходную дату публикации.
6. `postsAdded` увеличивается на обработанное сообщение, включая обновления и части альбомов. Это не число новых уникальных строк `Post`.
7. Материализация пересчитывает 30 календарных UTC-дней; её ошибка логируется отдельно. Затем общий `try/catch` обрабатывает блок антифрода: сбой в нём может пропустить оставшиеся проверки канала, но не отменяет сбор. Сигналы обновляются в пределах текущих UTC-суток и удаляются из активного 30-дневного окна, когда соответствующая проверка перестаёт срабатывать.
8. Для поста с подходящим медиа сборщик сохраняет одно фото или изображение-документ до 1 МБ в `PostImage`; у альбома сохраняется первое доступное изображение связанного поста. Ошибка загрузки изображения логируется без отмены сбора постов.

`fetcher.ts` делает паузу 1000–1299 мс перед попыткой и до трёх попыток при `FLOOD_WAIT`. Ожидание — указанное Telegram время + 2 секунды + jitter до 1499 мс; экспоненциального backoff в этом коде нет. Это задержка на вызов, а не распределённый глобальный rate limiter.

### Статьи Telegram

Пакет `telegram` установлен как npm alias для `teleproto@1.229.0` (слой API 229), преемника GramJS. Импорты и формат `StringSession` сохранены. [Причины и последствия выбора](adr/0002-telegram-rich-messages.md). Старый слой 198 возвращал новые статьи как `MessageMediaUnsupported` без текста.

`message-content.ts` преобразует `richMessage` в обычный текст с абзацами через `Rich.toPlainText`: заголовки, списки, таблицы, цитаты и подписи медиа. Изображения внутри статей не извлекаются, OCR и воспроизведение оформления Telegram не выполняются. Отдельные фото постов сохраняет `post-image.ts`. Для `part=true` полный текст догружается через `getRichMessage` с существующими ограничением частоты, повторными попытками и таймаутом. Ошибка догрузки изолирована: счётчики поста сохраняются, прежние текст, рекламная классификация и упоминания не перезаписываются неполным результатом.

Полный текст сохраняется в существующее `Post.text`; миграция БД не нужна. Он доступен интерфейсу, поиску, рекламной классификации и новым AI-отчётам в пределах их существующих выборок и лимитов длины. Старые отчёты автоматически не пересчитываются. Восстановление пустых записей за пределами последних 200 сообщений описано в [инструкции утилиты](../scripts/README.md#восстановление-текста-статей).

### Ошибки основного цикла

`retry-policy.ts` увеличивает `consecutiveErrors` и отключает канал при достижении `CHANNEL_MAX_CONSECUTIVE_ERRORS` (по умолчанию 10). Успех сбрасывает счётчик. При `TelegramTimeoutError` цикл пытается переподключить клиент; неудачный reconnect завершает цикл с fatal error. Некоторые ошибки чтения сообщений внутри `collectChannelData` только логируются, поэтому успешный статус не гарантирует полноту постов.

---

## 5. Материализация, чтение API, кэш и гибридный антифрод

```mermaid
sequenceDiagram
    autonumber
    actor User as Пользователь (Браузер)
    participant UI as Next.js UI
    participant API as Web API (/api/stats/*)
    participant Cache as metricsCache (TTL 5м)
    participant DB as PostgreSQL
    participant Engine as Metrics & Fraud Engine

    User->>UI: Открытие дашборда (/) или страницы канала (/channel/:id)
    UI->>API: GET /api/stats/overview или /api/stats/channel/:id
    API->>Cache: Проверка кэша по ключу (с учётом userId)
    alt Кэш актуален
        Cache-->>API: Готовый JSON-ответ
    else Кэш пуст или истёк
        API->>DB: Загрузка доступных UserChannel, Channel, ChannelMetricDaily (30д), Post, Snapshot
        API->>DB: Загрузка входящих Mention (30д) и сохранённых FraudSignal (30д)
        API->>Engine: Выбор пути (Materialized при наличии ChannelMetricDaily, иначе Raw Fallback)
        API->>Engine: Расчёт ER, ERR, VR, CR, дельт, Content Score, EP, вирусных постов
        API->>Engine: getCitationIndicesForChannels() и runFraudAudit()
        Engine-->>API: Сводные метрики + citationIndex + fraudScore (0..100) + причины
        API->>Cache: Сохранение результата на 5 минут
    end
    API-->>UI: JSON-ответ
    UI-->>User: Отрисовка таблиц, графиков, RiskBadge и индикаторов цитирования
```

API предпочитает `ChannelMetricDaily`, если за период есть хотя бы одна строка; иначе использует сырые `Snapshot`/`Post`. Worker рассчитывает дневные агрегаты, web — сводные метрики, EP, Content Score, CI и динамический антифрод. Это не модель «worker только пишет сырые данные».

`metricsCache` живёт 5 минут, `bestTimeCache` — 30 минут. Кэш находится в памяти одного процесса. API добавления, `PATCH`/`DELETE` канала, ручного сбора и внутренней инвалидации очищают оба кэша. `PUT` избранного их не очищает. Перезапуск процесса очищает кэш; общего кэша между репликами нет.

В `finally` основного цикла worker отправляет запрос на `WEB_INTERNAL_URL` с `COLLECT_API_TOKEN`, если оба заданы. Сетевое исключение логируется; текущий caller не проверяет HTTP-статус ответа.

### Гибридный антифрод

Worker анализирует до 30 дневных строк и до 30 последних постов, сохраняет только сработавшие сигналы. При чтении `overview`/`detail` web загружает сигналы за 30 дней и вызывает чистую функцию `runFraudAudit`; сама она не читает БД. Сохранённый сигнал соответствующего типа имеет приоритет перед повторным вычислением этого типа.

При отсутствии сохранённых сигналов расчёт использует переданные данные. Overview передаёт посты за 7 дней и дневные метрики за 30 дней; detail — последние 20 постов (либо `recentPosts` при короткой выборке) и сырую историю аудитории выбранного периода. Даты упоминаний эти вызовы не передают, поэтому динамическая проверка скачков не эквивалентна фоновой. [Формулы и ограничения](analytics-formulas.md), [ADR](adr/0001-anti-fraud-detection-architecture.md).

---

## 6. Демография, рекламный охват и ежедневные дайджесты

- **Демография**: `DEMOGRAPHICS_CRON`, default `0 3 * * 0`; только активные `isMine` broadcast-каналы без успешного снимка с начала текущей недели (воскресенье 00:00 по часовому поясу процесса). Проверка `canViewStats`, вызовы `GetBroadcastStats`/`LoadAsyncGraph` в `statsDc`, разбор последней общей точки и доли включённых уведомлений (`notificationsEnabledPercent`). Ошибки изолированы от основного сбора. `countryBreakdown` остаётся SQL `NULL`.
- **Рекламный охват**: фиксированный cron `15 * * * *`, посты с `isAd: true` не старше 50 часов. Фильтра `channel.isActive` здесь нет. Проверяются отсутствующие точки 1/12/24/48 часов с допуском 5 минут до срока. Все просроченные точки получают текущие просмотры; фактическое время хранится в `capturedAt`.
- **Ежедневные Telegram-дайджесты**: вне локального режима worker каждые 5 минут (`*/5 * * * *`) вызывает:
  1. `sendDailyDigestIfDue()` — глобальный дайджест из `SystemSetting` (отправляется на системный `TELEGRAM_CHAT_ID` в выбранный час UTC по всем активным каналам);
  2. `sendUserDigestsIfDue()` — персональные дайджесты для всех пользователей с `User.digestEnabled = true` и непустым `User.telegramChatId` в их `User.digestHour` UTC строго по их активным `UserChannel`. Повторная отправка в те же UTC-сутки блокируется через `lastDigestAt`.
- Дополнительные задания не запускаются автоматически при старте: `COLLECT_ON_STARTUP` относится только к основному циклу.

Тепловые карты канала, почасовое распределение и рекомендация времени публикации используют `APP_TIMEZONE` (по умолчанию `Europe/Moscow`) независимо от часового пояса процесса. Cron по-прежнему использует часовой пояс Node.js-процесса; материализация использует UTC.

---

## 7. AI-отчёты и двухэтапный сканер событий («Афиша»)

### Пайплайн генерации AI-отчётов

```mermaid
flowchart LR
    subgraph ClientUI["Интерфейс пользователя"]
        ChPage["Страница канала (/channel/:id)"]
        Dash["Виджет трендов (/)"]
        CompPage["Сравнение (/compare)"]
        RepPage["Архив отчётов (/reports)"]
    end

    subgraph AIRoutes["9 маршрутов /api/ai/*"]
        R1["summary, super-report, audience, action-plan"]
        R2["compare, compare-reports"]
        R3["trends (все активные каналы за 48ч)"]
        R4["content-gap (Мой канал vs топ-60 постов конкурентов)"]
        R5["persona (только для role = ADMIN, 403 для USER)"]
    end

    subgraph Execution["Выполнение и хранение"]
        Config["getAiConfig (SystemSetting кэш 30с -> fallback .env)"]
        OR["OpenRouter API (z-ai/glm-5.3-flash)"]
        Save["saveAiReport -> таблица ai_reports"]
        Export["Markdown / HTML экспорт (/api/reports/:id/export) и удаление"]
    end

    ChPage --> R1
    ChPage --> R4
    ChPage --> R5
    Dash --> R3
    Dash --> R4
    CompPage --> R2
    RepPage --> R2

    R1 --> Config
    R2 --> Config
    R3 --> Config
    R4 --> Config
    R5 --> Config

    Config --> OR
    OR --> Save
    Save --> Export
```

AI-обработчики формируют промпты из сохранённых данных, вызывают `callOpenRouter` и сохраняют ответ через `saveAiReport`. Девять типов отчётов описаны в [API](api-reference.md). Отчёт `persona` («Психологический портрет») защищён проверкой роли: он виден в UI и доступен на сервере только администратору (`role = 'ADMIN'`). Для анализа рыночных трендов (`/api/ai/trends`) берутся все активные каналы из списка пользователя за последние 48 часов, до 10 текстовых постов на канал. Для анализа упущенных тем конкурентов (`/api/ai/content-gap`) сопоставляются до 40 последних текстовых постов «Моего канала» и топ-60 наиболее эффективных постов активных конкурентов за выбранный период (по умолчанию 14 дней).

### Двухэтапный пайплайн сканера событий и «Афиши»

```mermaid
flowchart TD
    Start["Запуск POST /api/events/scan (кнопка в UI или EVENTS_SCAN_CRON)"] --> Fetch["Выборка до 2000 непроверенных постов за 14 дней (eventsScannedAt IS NULL)"]
    Fetch --> PreFilter["Предварительный отсев явных дайджестов и подборок (isLikelyEventDigestPost)"]
    PreFilter --> JevStage["Этап 1: OpenRouter Jev (~typesafe/jev-latest) — оценка признаков одного будущего анонса и условий участия"]
    JevStage -->|Успех Jev| Rank["Отсев score < 0.2 и дайджестов >= 0.8; ранжирование топ-100 кандидатов"]
    JevStage -->|Ошибка Jev| Fallback["Fallback: фильтр по ключевым словам (selectionMode = keyword_fallback)"]
    Rank --> LLMStage["Этап 2: Генеративная модель (z-ai/glm-5.3-flash, timeout 120с) — извлечение title, date, timeStr, organizer, prices"]
    Fallback --> LLMStage
    LLMStage --> Dedup["Сопоставление дублей (isSameEvent) и транзакционное слияние (mergeDuplicateEventsInDb)"]
    Dedup --> Persist["Сохранение Event + EventMention и отметка Post.eventsScannedAt"]
    Persist --> AfishaUI["Страница /events: пресеты дат, фильтр бесплатных, обложки из PostImage, экспорт в .ics и Google Календарь"]
```

`callOpenRouter` использует ключ и модель из `SystemSetting`, затем резервные `OPENROUTER_API_KEY` и `z-ai/glm-5.3-flash`. Jev использует тот же ключ и фиксированную модель `~typesafe/jev-latest`. Конфигурация кэшируется на 30 секунд в процессе web и сбрасывается при сохранении настроек в том же процессе. `DELETE /api/reports/:id` физически удаляет выбранный `AiReport`, после чего его страница и HTML-экспорт недоступны. Изображение для карточки «Афиши» выбирается из видимых упоминаний и выдаётся отдельным маршрутом `/api/posts/:id/image`, без передачи байтов в списке событий. На карточке события доступны скачивание `.ics` (RFC 5545) и добавление в Google Календарь (`src/lib/events/calendar.ts`).

---

## 8. Граница доступа и безопасность Middleware

Middleware (`src/middleware.ts`) проверяет `Bearer` для сервисных запросов либо подписанную `HttpOnly`-cookie Web UI (`v2` с `userId` и `role` либо `v1` при резервном мастер-входе). Для пользовательской cookie middleware в Node.js runtime дополнительно читает текущие роль и `User.accessStatus` из БД. `PENDING` видит только страницу ожидания, `BLOCKED` теряет доступ с действующей cookie. Сессия действует 12 часов и не содержит секретный ключ. Cookie-мутации требуют совпадающий `Origin`; `/api/internal/*` принимает только `Bearer`. Заявками управляет `ADMIN` через `/api/admin/registrations`; данные каналов, отчётов, алертов и скрытых событий изолированы по `userId`. [Эксплуатация](deployment.md).
