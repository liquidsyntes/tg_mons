# База данных и схема Prisma

Сверено с [schema.prisma](../prisma/schema.prisma) 16 октября 2026 года. СУБД проекта: **PostgreSQL 15** с расширением `pg_trgm`. SQLite кодовой базой не поддерживается.

## Общие сведения и требования к СУБД

- **СУБД:** PostgreSQL 15+ (официальный образ `postgres:15` в `docker-compose.yml`).
- **ORM:** Prisma Client (`prisma-client-js`) с генератором расширений PostgreSQL (`previewFeatures = ["postgresqlExtensions"]`).
- **Расширение `pg_trgm`:** активировано в `datasource` схемы (`extensions = [pg_trgm]`). Обеспечивает поддержку GIN-индекса на триграммах (`gin_trgm_ops`) по полю `Post.text` для эффективного поиска подстрок и поиска похожих текстов в Telegram-публикациях.
- **Несовместимость с SQLite:**
  - Провайдер схемы строго зафиксирован: `provider = "postgresql"`.
  - Использование специфических типов PostgreSQL: `DateTime @db.Date` для календарных дней метрик, `Json` (PostgreSQL `jsonb`) для хранения распределения демографии (`AudienceDemographics.languageBreakdown`, `countryBreakdown`) и цен мероприятий (`Event.prices`).
  - Поддержка триграммных GIN-индексов PostgreSQL (`@@index([text(ops: raw("gin_trgm_ops"))], type: Gin)`).
  - Попытка переключения на SQLite приведёт к ошибкам валидации схемы Prisma и отсутствию необходимых расширений.

## Перечисления (Enums)

### `SyncStatus`
Определяет статус выполнения фонового цикла сбора данных в модели `SyncJob`:

| Значение | Описание |
|---|---|
| `RUNNING` | Фоновый цикл сбора выполняется в данный момент |
| `COMPLETED` | Сбор данных успешно завершён для всех активных каналов |
| `PARTIAL` | Цикл сбора завершён, но сбор для одного или нескольких каналов завершился с ошибкой |
| `FAILED` | Критический сбой всего цикла сбора (например, потеря связи с Telegram MTProto или ошибка БД) |

## Сводная таблица моделей

Схема содержит **20 моделей**, сопоставленных с таблицами PostgreSQL через атрибут `@@map`:

| Модель | Таблица (`@@map`) | Первичный ключ | Уникальные ключи / Индексы | Связи и каскады | Назначение |
|---|---|---|---|---|---|
| `User` | `users` | `id` (Int, autoincrement) | `@unique username` | Связи 1:N с `UserChannel`, `AiReport`, `AlertRule`, `UserDismissedEvent`, `InviteCode` | Учётные записи пользователей (`ADMIN`, `USER`) и PBKDF2-хеши паролей |
| `InviteCode` | `invite_codes` | `id` (Int, autoincrement) | `@unique code`<br>`@unique usedById`<br>`@@index([createdById])` | `createdBy` -> `User` (`Cascade`)<br>`usedBy` -> `User?` (`SetNull`) | Одноразовые инвайт-коды для закрытой регистрации пользователей |
| `UserChannel` | `user_channels` | `id` (Int, autoincrement) | `@@unique([userId, channelId])`<br>`@@index([userId])`<br>`@@index([channelId])` | `user` -> `User` (`Cascade`)<br>`channel` -> `Channel` (`Cascade`) | Персональная подписка пользователя на канал из общего пула (`isMine`, `isFavorite`, `niche`, `isActive`) |
| `UserDismissedEvent` | `user_dismissed_events` | `id` (Int, autoincrement) | `@@unique([userId, eventId])`<br>`@@index([userId])`<br>`@@index([eventId])` | `user` -> `User` (`Cascade`)<br>`event` -> `Event` (`Cascade`) | Индивидуальное скрытие мероприятий из «Афиши» для конкретного пользователя |
| `Channel` | `channels` | `id` (Int, autoincrement) | `@unique username`<br>`@unique tgId` | Связи 1:N со всеми дочерними сущностями (`onDelete: Cascade`) | Telegram-каналы и группы, отслеживаемые системой, флаги и метаданные |
| `Snapshot` | `snapshots` | `id` (Int, autoincrement) | `@@index([channelId, collectedAt])` | `channel` -> `Channel` (`Cascade`) | Временные снимки численности аудитории (подписчиков) канала |
| `Post` | `posts` | `id` (Int, autoincrement) | `@@unique([channelId, messageId])`<br>`@@index([channelId, groupedId])`<br>`@@index([channelId, publishedAt])`<br>`@@index([text], type: Gin)` | `channel` -> `Channel` (`Cascade`)<br>Дочерние: `mentions`, `snapshots`, `viewSnapshots`, `eventMentions`, `image` (`Cascade`) | Собранные публикации Telegram: просмотры, реакции, репосты, текст |
| `PostImage` | `post_images` | `postId` (Int) | Нет | `post` -> `Post` (`Cascade`) | Одно ограниченное по размеру изображение публикации |
| `PostSnapshot` | `post_snapshots` | `id` (Int, autoincrement) | `@@index([postId, collectedAt])` | `post` -> `Post` (`Cascade`) | Снимки просмотров первых 72 часов для LTV; удаляются после 30 дней хранения |
| `PostViewSnapshot` | `post_view_snapshots` | `id` (Int, autoincrement) | `@@unique([postId, hoursAfterPost])`<br>`@@index([postId])` | `post` -> `Post` (`Cascade`) | Контрольные точки просмотров рекламных постов (1, 12, 24, 48 часов) для оценки рекламного охвата |
| `Mention` | `mentions` | `id` (Int, autoincrement) | `@@index([sourceChannelId])`<br>`@@index([targetUsername])` | `sourcePost` -> `Post` (`Cascade`)<br>`sourceChannel` -> `Channel` (`Cascade`) | Упоминания и репосты других каналов, найденные в собранных постах (без FK на целевой канал) |
| `SyncJob` | `sync_jobs` | `id` (Int, autoincrement) | — | Нет внешних связей | История и аудит запусков циклов сбора данных: статус `SyncStatus`, счётчики, длительность |
| `ChannelMetricDaily` | `channel_metrics_daily` | `id` (Int, autoincrement) | `@@unique([channelId, date])`<br>`@@index([date])` | `channel` -> `Channel` (`Cascade`) | Материализованные суточные агрегаты метрик канала (UTC) для быстрых аналитических выборок |
| `AudienceDemographics` | `audience_demographics` | `id` (Int, autoincrement) | `@@index([channelId, capturedAt])` | `channel` -> `Channel` (`Cascade`) | Снимки языкового и географического распределения аудитории канала |
| `AiReport` | `ai_reports` | `id` (Int, autoincrement) | `@@index([channelId, createdAt])` | `channel` -> `Channel?` (`Cascade`) | Сохранённые аналитические отчёты, сгенерированные LLM через OpenRouter |
| `Event` | `events` | `id` (Int, autoincrement) | — | Дочерние: `mentions` (`EventMention[]`, `Cascade`) | Мероприятия и события, извлечённые из публикаций Telegram |
| `EventMention` | `event_mentions` | `id` (Int, autoincrement) | `@@unique([eventId, postId])`<br>`@@index([eventId])`<br>`@@index([postId])` | `event` -> `Event` (`Cascade`)<br>`post` -> `Post` (`Cascade`) | Связь M:N между мероприятиями (`Event`) и постами (`Post`), где они упомянуты |
| `SystemSetting` | `system_settings` | `id` (String, default "global") | — | Нет внешних связей | Глобальная конфигурация AI-провайдера, модели, токена и расписания email/telegram дайджеста |
| `AlertRule` | `alert_rules` | `id` (Int, autoincrement) | `@@index([channelId])` | `channel` -> `Channel?` (`Cascade`) | Правила мониторинга и алертинга по метрикам канала (пороги, операторы, время последней успешной отправки) |
| `AlertRuleFire` | `alert_rule_fires` | `id` (Int, autoincrement) | `@@unique([ruleId, channelId])`<br>`@@index([channelId])` | `rule` -> `AlertRule` (`Cascade`)<br>`channel` -> `Channel` (`Cascade`) | Состояние cooldown для пары «правило и канал» |
| `FraudSignal` | `fraud_signals` | `id` (Int, autoincrement) | `@@index([channelId, detectedAt])` | `channel` -> `Channel` (`Cascade`) | Зафиксированные эвристиками факты подозрительной активности (накрутка подписчиков, реакций, просмотров) |

---

## Детальная спецификация моделей и полей

### 1. `Channel` (`channels`)
Хранит базовые данные Telegram-каналов и групп, отслеживаемых в системе.

| Поле | Тип Prisma | SQL колонка | Nullable | По умолчанию | Описание |
|---|---|---|---|---|---|
| `id` | `Int` | `id` | Нет | `autoincrement()` | Первичный ключ |
| `username` | `String` | `username` | Да | — | Уникальный юзернейм канала в Telegram (без `@`) |
| `tgId` | `BigInt` | `tgId` | Да | — | Уникальный числовой Telegram ID чата/канала |
| `title` | `String` | `title` | Нет | — | Отображаемое название канала |
| `type` | `String` | `type` | Нет | — | Тип Telegram-сущности: `"channel"` или `"group"` |
| `niche` | `String` | `niche` | Нет | `"general"` | Категория/ниша канала для сравнительного анализа |
| `isMine` | `Boolean` | `isMine` | Нет | `false` | Флаг «Мой канал» (определяет доступ к статистике демографии) |
| `isFavorite` | `Boolean` | `isFavorite` | Нет | `false` | Флаг избранного (Watchlist); участвует в анализе трендов |
| `isActive` | `Boolean` | `isActive` | Нет | `true` | Флаг активности сбора; отключается при превышении лимита ошибок |
| `consecutiveErrors` | `Int` | `consecutiveErrors` | Нет | `0` | Счётчик последовательных ошибок сбора подряд |
| `lastMessageId` | `BigInt` | `lastMessageId` | Да | — | Идентификатор последнего обработанного сообщения |
| `lastError` | `String` | `lastError` | Да | — | Текст последней ошибки при сборе |
| `lastCollectedAt` | `DateTime` | `lastCollectedAt` | Да | — | Дата и время последнего успешного сбора данных |
| `createdAt` | `DateTime` | `createdAt` | Нет | `now()` | Время добавления канала в мониторинг |

- **Индексы и ограничения:**
  - `@unique username`
  - `@unique tgId`
- **Связи:**
  - `snapshots`: `Snapshot[]` (каскадное удаление)
  - `posts`: `Post[]` (каскадное удаление)
  - `aiReports`: `AiReport[]` (каскадное удаление)
  - `mentions`: `Mention[]` (каскадное удаление)
  - `channelMetricDailies`: `ChannelMetricDaily[]` (каскадное удаление)
  - `demographics`: `AudienceDemographics[]` (каскадное удаление)
  - `alertRules`: `AlertRule[]` (каскадное удаление)
  - `alertRuleFires`: `AlertRuleFire[]` (каскадное удаление)
  - `fraudSignals`: `FraudSignal[]` (каскадное удаление)

---

### 2. `Snapshot` (`snapshots`)
Хранит исторические замеры количества подписчиков.

| Поле | Тип Prisma | SQL колонка | Nullable | По умолчанию | Описание |
|---|---|---|---|---|---|
| `id` | `Int` | `id` | Нет | `autoincrement()` | Первичный ключ |
| `channelId` | `Int` | `channel_id` | Нет | — | Внешний ключ на `Channel.id` |
| `membersCount` | `Int` | `members_count` | Нет | — | Число участников/подписчиков на момент замера |
| `collectedAt` | `DateTime` | `collected_at` | Нет | `now()` | Время фиксации снимка |

- **Индексы:**
  - `@@index([channelId, collectedAt])`
- **Связи:**
  - `channel`: `Channel` (`fields: [channelId], references: [id], onDelete: Cascade`)

---

### 3. `Post` (`posts`)
Публикации каналов, их метрики вовлечённости и текст.

| Поле | Тип Prisma | SQL колонка | Nullable | По умолчанию | Описание |
|---|---|---|---|---|---|
| `id` | `Int` | `id` | Нет | `autoincrement()` | Первичный ключ |
| `channelId` | `Int` | `channel_id` | Нет | — | Внешний ключ на `Channel.id` |
| `messageId` | `BigInt` | `message_id` | Нет | — | ID сообщения в Telegram |
| `groupedId` | `BigInt` | `grouped_id` | Да | — | Идентификатор медиагруппы (альбома) для группировки сообщений |
| `publishedAt` | `DateTime` | `published_at` | Нет | — | Дата и время публикации сообщения в Telegram |
| `views` | `Int` | `views` | Да | — | Текущее количество просмотров |
| `reactions` | `Int` | `reactions` | Да | — | Суммарное количество реакций всех эмодзи |
| `comments` | `Int` | `comments` | Да | — | Количество комментариев |
| `forwards` | `Int` | `forwards` | Да | — | Количество репостов / пересылок |
| `text` | `String` | `text` | Да | — | Текст публикации |
| `subscribersAtPublish` | `Int` | `subscribers_at_publish` | Да | — | Число подписчиков канала на момент публикации (для расчёта ERR) |
| `isAd` | `Boolean` | `is_ad` | Нет | `false` | Флаг рекламной публикации (помечается эвристиками) |
| `contentType` | `String` | `content_type` | Нет | `'text'` | Тип контента публикации (`text`, `photo`, `video`, `poll`, `link`) |
| `eventsScannedAt` | `DateTime` | `events_scanned_at` | Да | нет | Время успешной проверки поста сканером событий |

- **Индексы и ограничения:**
  - `@@unique([channelId, messageId])`
  - `@@index([channelId, groupedId])`
  - `@@index([channelId, publishedAt])`
  - `@@index([channelId, contentType])`
  - `@@index([eventsScannedAt, publishedAt])` для выборки непроверенных постов за период
  - `@@index([text(ops: raw("gin_trgm_ops"))], type: Gin)` — триграммный индекс для полнотекстового поиска
- **Связи:**
  - `channel`: `Channel` (`fields: [channelId], references: [id], onDelete: Cascade`)
  - `mentions`: `Mention[]` (каскадное удаление)
  - `snapshots`: `PostSnapshot[]` (каскадное удаление)
  - `viewSnapshots`: `PostViewSnapshot[]` (каскадное удаление)
  - `eventMentions`: `EventMention[]` (каскадное удаление)
  - `image`: `PostImage?` (каскадное удаление)

---

### 3a. `PostImage` (`post_images`)
Одно изображение поста, сохранённое при сборе отдельного фото или изображения-документа Telegram. Размер загружаемого файла ограничен 1 МБ; байты не включаются в ответы со списком событий.

| Поле | Тип Prisma | SQL колонка | Nullable | По умолчанию | Описание |
|---|---|---|---|---|---|
| `postId` | `Int` | `post_id` | Нет | Нет | Первичный ключ и внешний ключ на `Post.id` |
| `contentType` | `String` | `content_type` | Нет | Нет | MIME-тип изображения |
| `data` | `Bytes` | `data` | Нет | Нет | Байты изображения |
| `createdAt` | `DateTime` | `created_at` | Нет | `now()` | Время сохранения |

Удаление поста каскадно удаляет его изображение. Миграция: `20261016000000_add_post_images`.

---

### 4. `PostSnapshot` (`post_snapshots`)
Промежуточные замеры просмотров публикаций за первые 72 часа для анализа динамики удержания (LTV). Повторный замер того же поста создаётся не чаще одного раза в 45 минут. После основного цикла удаляется до 10 000 замеров старше 30 дней партиями по 1000; остаток обрабатывается следующими циклами.

| Поле | Тип Prisma | SQL колонка | Nullable | По умолчанию | Описание |
|---|---|---|---|---|---|
| `id` | `Int` | `id` | Нет | `autoincrement()` | Первичный ключ |
| `postId` | `Int` | `post_id` | Нет | — | Внешний ключ на `Post.id` |
| `views` | `Int` | `views` | Нет | — | Зафиксированное число просмотров |
| `collectedAt` | `DateTime` | `collected_at` | Нет | `now()` | Время замера |

- **Индексы:**
  - `@@index([postId, collectedAt])`
- **Связи:**
  - `post`: `Post` (`fields: [postId], references: [id], onDelete: Cascade`)

---

### 5. `PostViewSnapshot` (`post_view_snapshots`)
Фиксированные контрольные точки просмотров рекламных постов (1ч, 12ч, 24ч, 48ч).

| Поле | Тип Prisma | SQL колонка | Nullable | По умолчанию | Описание |
|---|---|---|---|---|---|
| `id` | `Int` | `id` | Нет | `autoincrement()` | Первичный ключ |
| `postId` | `Int` | `post_id` | Нет | — | Внешний ключ на `Post.id` |
| `hoursAfterPost` | `Int` | `hours_after_post` | Нет | — | Часовой интервал фиксации: 1, 12, 24 или 48 |
| `viewsCount` | `Int` | `views_count` | Нет | — | Зафиксированное число просмотров в данной точке |
| `capturedAt` | `DateTime` | `captured_at` | Нет | `now()` | Фактическое время фиксации снимка |

- **Индексы и ограничения:**
  - `@@unique([postId, hoursAfterPost])`
  - `@@index([postId])`
- **Связи:**
  - `post`: `Post` (`fields: [postId], references: [id], onDelete: Cascade`)

---

### 6. `Mention` (`mentions`)
Упоминания других каналов в текстах постов или пересылки (репосты).

| Поле | Тип Prisma | SQL колонка | Nullable | По умолчанию | Описание |
|---|---|---|---|---|---|
| `id` | `Int` | `id` | Нет | `autoincrement()` | Первичный ключ |
| `sourcePostId` | `Int` | `source_post_id` | Нет | — | Внешний ключ на `Post.id` |
| `sourceChannelId` | `Int` | `source_channel_id` | Нет | — | Внешний ключ на `Channel.id` канала-автора |
| `targetUsername` | `String` | `target_username` | Да | — | Юзернейм упомянутого канала |
| `targetTgId` | `BigInt` | `target_tg_id` | Да | — | Telegram ID упомянутого канала |
| `type` | `String` | `type` | Нет | — | Тип упоминания: `"forward"` или `"mention"` |
| `createdAt` | `DateTime` | `created_at` | Нет | `now()` | Время записи упоминания |

- **Индексы:**
  - `@@index([sourceChannelId])`
  - `@@index([targetUsername])`
- **Связи:**
  - `sourcePost`: `Post` (`fields: [sourcePostId], references: [id], onDelete: Cascade`)
  - `sourceChannel`: `Channel` (`fields: [sourceChannelId], references: [id], onDelete: Cascade`)
  - *Примечание:* на целевой канал внешний ключ отсутствует, так как упомянутый канал может не отслеживаться в системе.

---

### 7. `SyncJob` (`sync_jobs`)
Журнал выполнения циклов синхронизации Telegram.

| Поле | Тип Prisma | SQL колонка | Nullable | По умолчанию | Описание |
|---|---|---|---|---|---|
| `id` | `Int` | `id` | Нет | `autoincrement()` | Первичный ключ |
| `startedAt` | `DateTime` | `startedAt` | Нет | — | Время старта цикла |
| `endedAt` | `DateTime` | `endedAt` | Да | — | Время завершения цикла |
| `status` | `SyncStatus` | `status` | Нет | — | Статус: `RUNNING`, `COMPLETED`, `PARTIAL`, `FAILED` |
| `channelsTotal` | `Int` | `channelsTotal` | Нет | `0` | Общее число каналов в очереди цикла |
| `channelsSucceeded` | `Int` | `channelsSucceeded` | Нет | `0` | Число успешно обработанных каналов |
| `channelsFailed` | `Int` | `channelsFailed` | Нет | `0` | Число каналов с ошибками при сборе |
| `postsAdded` | `Int` | `postsAdded` | Нет | `0` | Число обработанных сообщений (включая обновления) |
| `durationMs` | `Int` | `durationMs` | Да | — | Длительность выполнения цикла в миллисекундах |
| `errorSummary` | `String` | `errorSummary` | Да | — | Краткая сводка возникших ошибок |
| `createdAt` | `DateTime` | `createdAt` | Нет | `now()` | Время создания записи |

---

### 8. `ChannelMetricDaily` (`channel_metrics_daily`)
Материализованные суточные метрики каналов (агрегируются по дням UTC).

| Поле | Тип Prisma | SQL колонка | Nullable | По умолчанию | Описание |
|---|---|---|---|---|---|
| `id` | `Int` | `id` | Нет | `autoincrement()` | Первичный ключ |
| `channelId` | `Int` | `channel_id` | Нет | — | Внешний ключ на `Channel.id` |
| `date` | `DateTime` (`@db.Date`) | `date` | Нет | — | Календарная дата замера (PostgreSQL DATE, полночь UTC) |
| `followers` | `Int` | `followers` | Нет | — | Количество подписчиков на конец суток |
| `avgViews` | `Int` | `avgViews` | Нет | — | Средние просмотры постов за сутки |
| `vr` | `Float` | `vr` | Нет | — | View Rate (доля просмотров от аудитории) |
| `err` | `Float` | `err` | Нет | — | Engagement Rate by Reach (вовлечённость по охвату) |
| `postsCount` | `Int` | `postsCount` | Нет | — | Количество публикаций за эти сутки |

- **Индексы и ограничения:**
  - `@@unique([channelId, date])`
  - `@@index([date])`
- **Связи:**
  - `channel`: `Channel` (`fields: [channelId], references: [id], onDelete: Cascade`)

---

### 9. `AudienceDemographics` (`audience_demographics`)
Снимки демографических данных аудитории (языки, страны).

| Поле | Тип Prisma | SQL колонка | Nullable | По умолчанию | Описание |
|---|---|---|---|---|---|
| `id` | `Int` | `id` | Нет | `autoincrement()` | Первичный ключ |
| `channelId` | `Int` | `channel_id` | Нет | — | Внешний ключ на `Channel.id` |
| `capturedAt` | `DateTime` | `captured_at` | Нет | `now()` | Время снятия статистики |
| `languageBreakdown` | `Json` | `language_breakdown` | Нет | — | JSONB-распределение аудитории по языкам |
| `countryBreakdown` | `Json` | `country_breakdown` | Да | — | JSONB-распределение по странам (добавлено миграцией) |
| `notificationsEnabledPercent` | `Float` | `notifications_enabled_percent` | Да | — | Доля подписчиков с включёнными уведомлениями в процентах (`0..100`), полученная из `enabledNotifications` Telegram API |

- **Индексы:**
  - `@@index([channelId, capturedAt])`
- **Связи:**
  - `channel`: `Channel` (`fields: [channelId], references: [id], onDelete: Cascade`)

---

### 10. `AiReport` (`ai_reports`)
Аналитические отчёты, сгенерированные с помощью LLM (OpenRouter).

| Поле | Тип Prisma | SQL колонка | Nullable | По умолчанию | Описание |
|---|---|---|---|---|---|
| `id` | `Int` | `id` | Нет | `autoincrement()` | Первичный ключ |
| `channelId` | `Int` | `channel_id` | Да | — | Внешний ключ на `Channel.id` (null для общих трендов) |
| `type` | `String` | `type` | Нет | Нет | Строковый тип: `summary`, `super_report`, `compare`, `trend`, `audience`, `persona`, `action_plan` или `evolution` |
| `content` | `String` | `content` | Нет | — | JSON-строка полезной нагрузки отчёта |
| `createdAt` | `DateTime` | `created_at` | Нет | `now()` | Время создания отчёта |

- **Индексы:**
  - `@@index([channelId, createdAt])`
- **Связи:**
  - `channel`: `Channel?` (`fields: [channelId], references: [id], onDelete: Cascade`)

Удаление отчёта через `DELETE /api/reports/:id` физически удаляет эту строку. Другие отчёты не связаны с ней внешним ключом и не удаляются вместе с ней.

---

### 11. `Event` (`events`)
События и мероприятия, найденные в Telegram-постах с помощью эвристического Event Scanner.

| Поле | Тип Prisma | SQL колонка | Nullable | По умолчанию | Описание |
|---|---|---|---|---|---|
| `id` | `Int` | `id` | Нет | `autoincrement()` | Первичный ключ |
| `title` | `String` | `title` | Нет | — | Название мероприятия |
| `date` | `DateTime` | `date` | Нет | — | Дата проведения мероприятия |
| `timeStr` | `String` | `timeStr` | Да | — | Строка времени проведения (например, `"22:00 - 05:00"`) |
| `organizer` | `String` | `organizer` | Да | — | Организатор или площадка мероприятия |
| `prices` | `Json` | `prices` | Да | — | JSONB-структура категорий стоимости билетов |
| `createdAt` | `DateTime` | `createdAt` | Нет | `now()` | Время сохранения события |
| `dismissedAt` | `DateTime` | `dismissed_at` | Да | `null` | Время ручного скрытия из «Афиши»; событие и связи с постами сохраняются |

- **Связи:**
  - `mentions`: `EventMention[]` (каскадное удаление)
  - `dismissedByUsers`: `UserDismissedEvent[]` (каскадное удаление)

После успешного сканирования совпавшие по дате и правилам `isSameEvent` записи объединяются: связям `EventMention` и `UserDismissedEvent` сначала создаются аналоги у самой ранней записи, затем дубли удаляются в той же транзакции. Отсутствующие время, организатор и цены канонического события дополняются из дублей; глобальное `dismissedAt` сохраняется.

---

### 12. `EventMention` (`event_mentions`)
Связывает мероприятие с конкретным постом, в котором оно было обнаружено.

| Поле | Тип Prisma | SQL колонка | Nullable | По умолчанию | Описание |
|---|---|---|---|---|---|
| `id` | `Int` | `id` | Нет | `autoincrement()` | Первичный ключ |
| `eventId` | `Int` | `event_id` | Нет | — | Внешний ключ на `Event.id` |
| `postId` | `Int` | `post_id` | Нет | — | Внешний ключ на `Post.id` |

- **Индексы и ограничения:**
  - `@@unique([eventId, postId])`
  - `@@index([eventId])`
  - `@@index([postId])`
- **Связи:**
  - `event`: `Event` (`fields: [eventId], references: [id], onDelete: Cascade`)
  - `post`: `Post` (`fields: [postId], references: [id], onDelete: Cascade`)

---

### 13. `SystemSetting` (`system_settings`)
Хранилище глобальных настроек интеграций и дайджеста.

| Поле | Тип Prisma | SQL колонка | Nullable | По умолчанию | Описание |
|---|---|---|---|---|---|
| `id` | `String` | `id` | Нет | `"global"` | Первичный ключ (единственная запись `"global"`) |
| `aiProvider` | `String` | `ai_provider` | Нет | `"openrouter"` | Имя провайдера нейросети |
| `aiModel` | `String` | `ai_model` | Нет | `"meta-llama/llama-3.1-8b-instruct:free"` | Идентификатор модели для инференса |
| `aiToken` | `String` | `ai_token` | Да | — | API-токен для обращения к AI-провайдеру |
| `digestEnabled` | `Boolean` | `digest_enabled` | Нет | `false` | Флаг активности регулярного дайджеста |
| `digestHour` | `Int` | `digest_hour` | Нет | `9` | Час суток (0..23) для отправки дайджеста |
| `lastDigestAt` | `DateTime` | `last_digest_at` | Да | — | Время последней успешной отправки дайджеста |
| `updatedAt` | `DateTime` | `updated_at` | Нет | `@updatedAt` | Время последнего изменения настроек |

---

### 14. `AlertRule` (`alert_rules`)
Правила мониторинга и формирования оповещений по метрикам каналов.

`channelId = null` задаёт глобальное правило. Для владельца с `userId` оно действует только на активные `UserChannel`, а системное правило без владельца действует на все активные каналы. Cooldown 24 часа хранится отдельно для каждой пары в `AlertRuleFire`; `AlertRule.lastFiredAt` остаётся временем последней успешной отправки для UI. Для `delta24h` и `delta7d` сравнивается абсолютное изменение числа подписчиков со знаком; ER, ERR и VR измеряются в процентах. Сравнения `gt` и `lt` строгие, отсутствующие значения не вызывают отправку.

| Поле | Тип Prisma | SQL колонка | Nullable | По умолчанию | Описание |
|---|---|---|---|---|---|
| `id` | `Int` | `id` | Нет | `autoincrement()` | Первичный ключ |
| `channelId` | `Int` | `channel_id` | Да | — | Внешний ключ на `Channel.id` (null для глобального правила) |
| `metric` | `String` | `metric` | Нет | — | Отслеживаемая метрика (`followers`, `delta24h`, `delta7d`, `er7d`, `err7d`, `vr7d`, `avgViews7d`, `posts7d`, `contentScore`) |
| `operator` | `String` | `operator` | Нет | — | Оператор сравнения: `"lt"` (меньше) или `"gt"` (больше) |
| `threshold` | `Float` | `threshold` | Нет | — | Пороговое значение срабатывания правила |
| `enabled` | `Boolean` | `enabled` | Нет | `true` | Флаг активности правила |
| `lastFiredAt` | `DateTime` | `last_fired_at` | Да | нет | Время последней успешной отправки по любому каналу |
| `createdAt` | `DateTime` | `created_at` | Нет | `now()` | Время создания правила |

- **Индексы:**
  - `@@index([channelId])`
- **Связи:**
  - `channel`: `Channel?` (`fields: [channelId], references: [id], onDelete: Cascade`)
  - `fires`: `AlertRuleFire[]` (каскадное удаление)

#### `AlertRuleFire` (`alert_rule_fires`)

Хранит время и значение последнего срабатывания для конкретного канала. При ошибке доставки резервирование удаляется или возвращается к прежнему значению. Миграция переносит старый cooldown адресных правил. Для старых глобальных правил канал прошлого срабатывания неизвестен, поэтому их состояние по каналам начинается заново.

| Поле | Тип Prisma | SQL колонка | Nullable | По умолчанию | Описание |
|---|---|---|---|---|---|
| `id` | `Int` | `id` | Нет | `autoincrement()` | Первичный ключ |
| `ruleId` | `Int` | `rule_id` | Нет | нет | Внешний ключ на `AlertRule.id` |
| `channelId` | `Int` | `channel_id` | Нет | нет | Внешний ключ на `Channel.id` |
| `lastFiredAt` | `DateTime` | `last_fired_at` | Нет | нет | Время резервирования или успешной отправки |
| `lastValue` | `Float` | `last_value` | Да | нет | Значение метрики последнего срабатывания |

Уникальность пары `(ruleId, channelId)` обеспечивает независимый cooldown. Обе связи удаляются каскадно.

---

### 15. `FraudSignal` (`fraud_signals`)
Результаты срабатывания эвристик обнаружения накрутки аудитории и активности.

| Поле | Тип Prisma | SQL колонка | Nullable | По умолчанию | Описание |
|---|---|---|---|---|---|
| `id` | `Int` | `id` | Нет | `autoincrement()` | Первичный ключ |
| `channelId` | `Int` | `channel_id` | Нет | — | Внешний ключ на `Channel.id` |
| `signalType` | `String` | `signal_type` | Нет | — | Тип детектора (`views_to_subs`, `growth_smoothness`, `uncorrelated_spikes`, `uniform_reaction_ratio`) |
| `value` | `Float` | `value` | Нет | — | Числовое значение зафиксированной метрики или CV |
| `reason` | `String` | `reason` | Нет | — | Текстовое описание причины срабатывания |
| `detectedAt` | `DateTime` | `detected_at` | Нет | `now()` | Время регистрации сигнала |

- **Индексы:**
  - `@@index([channelId, detectedAt])`
- **Связи:**
  - `channel`: `Channel` (`fields: [channelId], references: [id], onDelete: Cascade`)

Worker сохраняет не более одного актуального сигнала каждого типа на канал за UTC-сутки. Если проверка перестала срабатывать, записи этого типа за последние 30 дней удаляются. Это политика записи и очистки, отдельного уникального ограничения в схеме нет.

---

## Каскадное удаление (Cascades) и целостность данных

Все внешние ключи (`foreign key`) в Prisma-схеме спроектированы с политикой `onDelete: Cascade`:
1. **Удаление канала (`Channel`):**
   При физическом удалении канала из таблицы `channels` PostgreSQL автоматически и каскадно удаляет все связанные с ним записи:
   - Снимки аудитории (`snapshots`);
   - Посты (`posts`) и все их дочерние сущности (`post_snapshots`, `post_view_snapshots`, `mentions`, `event_mentions`);
   - Исходящие упоминания (`mentions`), где данный канал выступал источником (`sourceChannelId`);
   - Суточные агрегаты метрик (`channel_metrics_daily`);
   - Снимки демографии (`audience_demographics`);
   - Сгенерированные AI-отчёты (`ai_reports`);
   - Пользовательские правила алертов (`alert_rules`);
   - Зафиксированные сигналы накрутки (`fraud_signals`).
2. **Удаление постов (`Post`):**
   Каскадно удаляет замеры просмотров (`post_snapshots`), рекламные точки (`post_view_snapshots`), упоминания (`mentions`), связи с мероприятиями (`event_mentions`) и сохранённое изображение (`post_images`).
3. **Удаление событий (`Event`):**
   Каскадно удаляет промежуточные связующие записи `event_mentions`.

## Миграции и версионирование схемы

Файлы миграций расположены в каталоге `prisma/migrations/`.
- На 16 октября 2026 года в проекте 16 миграций. Последняя, `20261016000000_add_post_images`, создаёт таблицу `post_images`; предыдущая, `20261013212052_add_event_dismissed_at`, добавляет nullable-время скрытия события.
- Для генерации клиента Prisma используется скрипт `npm run prisma:generate`.
- **Особенность Windows-окружения:** Если `npx prisma generate` завершился с `EPERM`, проверьте процессы Next.js и worker именно этого checkout на блокировку Prisma Query Engine. Останавливайте только установленный блокирующий процесс, затем повторите генерацию.
