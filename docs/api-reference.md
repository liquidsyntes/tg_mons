# Справочник API

Сверено со всеми `src/app/api/**/route.ts` 23 сентября 2026 года. Базовый URL локального web: `http://localhost:4000`. `:id` — внутренний ID PostgreSQL, а не Telegram ID. Типы сводных ответов: [src/lib/types.ts](../src/lib/types.ts).

## Формат и доступ

Большинство обработчиков возвращает JSON, даты — ISO-строки, Telegram BigInt — строки. Исключение: экспорт отчётов возвращает HTML, а некоторые его ошибки — plain text. Большинство ошибок имеет `{ "error": "..." }`; health использует `{ "status": "error", "message": "..." }`. Валидация неодинакова: многие ID разбираются через `parseInt`, строгая проверка положительного PostgreSQL Int реализована у демографии.

Ниже `Bearer` означает явный вызов `verifyBearerToken` в обработчике. Он возвращает 500 при отсутствии серверного `COLLECT_API_TOKEN`, 401 при отсутствующем/неправильном префиксе заголовка и 403 при несовпадающем токене.

**Граница доступа:** middleware для `/api/*` автоматически подставляет серверный токен в POST/PUT/PATCH/DELETE без Authorization. Он не проверяет пользователя или Origin и не отличает браузер от внешнего caller. GET проходят без этой проверки; настройки и scanner не вызывают verifier. Поэтому таблица Bearer описывает код обработчиков, а не полноценную защиту сетевого приложения. Передача неверного существующего заголовка не исправляется middleware.

## Каналы

| Метод и путь | Вход | Ответ / поведение | Bearer |
| --- | --- | --- | --- |
| `GET /api/channels` | — | Массив `ChannelMetrics` из overview, включая отключённые каналы | Нет |
| `POST /api/channels` | `{ "input": "@example_channel", "isMine": false }` | 201, метрики добавленного/повторно активированного канала; resolve и попытка backfill выполняются до ответа | Да |
| `GET /api/channels/:id` | ID | `ChannelMetrics`; 400 для нечислового ID, 404 если канала нет | Нет |
| `PATCH /api/channels/:id` | Необязательные boolean `isActive`, `isMine` | Обновлённые метрики; назначение `isMine: true` снимает прежний флаг в транзакции | Да |
| `DELETE /api/channels/:id` | Необязательное `?permanent=true` | По умолчанию `isActive=false`, ответ `{success,message,channel}`; permanent удаляет запись с каскадами и возвращает `{success,message}` | Да |
| `PUT /api/channels/:id/favorite` | `{ "isFavorite": true }` | `{ "success": true, "isFavorite": true }`; кэши метрик не сбрасывает | Да |
| `GET /api/channels/:id/ltv` | ID | `{ "ltv": [{ "hour": 1, "percent": 12.3 }, ...] }` либо `{ "ltv": [] }` | Нет |
| `GET /api/channels/:id/network` | ID | `{ "outbound": [...], "inbound": [...] }` | Нет |
| `GET /api/channels/:id/ad-price` | ID | `{estimatedPricePerPost,cpm,confidence,averageAdReach,averageReachCurve}`; 404 если канала нет | Нет |

`input` принимает username, Telegram-ссылку или invite-ссылку уже доступного аккаунту чата. Неверный/пустой input даёт 400. Неудачный backfill сохраняет `lastError`, но не обязательно отменяет 201. Добавление, PATCH и DELETE очищают `metricsCache`/`bestTimeCache`.

`GET /api/channels/:id` использует `calculateChannelMetrics`, который не добавляет все поля overview (например, EP/консолидированный антифрод); для полной детализации используйте `/api/stats/channel/:id`.

LTV строится по PostSnapshot для постов за 14 дней с ≥2 снимками и ранним замером до округлённого шестого часа; результат охватывает часы 1–72. Пустой LTV не означает отсутствие канала: отдельной проверки его существования нет. Network агрегирует сохранённые исходящие/входящие упоминания, а не обращается к Telegram за новым графом.

У ad-price отсутствие рекламы или пригодных просмотров возвращает 200 с `estimatedPricePerPost: null`, `averageAdReach: null`, пустой кривой. `confidence` — `high` при ≥3 рекламных постах, иначе `low`; это правило по числу постов, не статистический доверительный интервал.

## Статистика

| Метод и путь | Параметры | Ответ |
| --- | --- | --- |
| `GET /api/stats/overview` | — | `{myChannel,channels,totalChannels,activeChannels,lastGlobalUpdate}` |
| `GET /api/stats/dashboard` | — | KPI, `avgErr`, `avgScore`, topGainers/topLosers, postsTimeline/subscribersTimeline |
| `GET /api/stats/channel/:id` | `period=24h`, `7d` или `30d`, default `7d` | `{channel,myChannel,period,scoreBreakdown,membersHistory,postsDistribution,vrHistory,heatmapData,myHeatmapData,recentPosts}` |
| `GET /api/stats/compare` | Обязательные `a`, `b` — ID каналов; `period` как выше | `{ "a": ChannelDetailStats, "b": ChannelDetailStats, "period": "7d" }`; 400 без ID, 404 если канал не найден |
| `GET /api/stats/best-time` | — | `{bestDay,bestHour,score,avgViews,avgVr,postCount,heatmap}` или `null`, если нет активных конкурентов |
| `GET /api/stats/trends` | — | Последний сохранённый trend: `{createdAt,data}`; `null` при отсутствии/невалидном JSON, новую генерацию не запускает |
| `GET /api/stats/demographics/:id` | Положительный Int ID | Последний языковой снимок; контракт ниже |

Эти GET не требуют Bearer. Overview/dashboard/detail кэшируются в web на 5 минут, best-time — на 30 минут. Неизвестное значение period заменяется на `7d`. Best-time использует VR и количество постов; `avgVr` уже в процентах. Дни/часы слотов берутся в часовом поясе процесса.

### Демография

```json
{
  "demographics": {
    "capturedAt": "2026-09-16T00:00:00.000Z",
    "languages": [{ "code": "en", "name": "English", "percent": 100 }],
    "countries": null,
    "geographyStatus": "unsupported"
  }
}
```

- Некорректный ID: 400; отсутствующий канал: 404.
- Нет снимка: 200 и `{ "demographics": null }`. Причина отсутствия из этого ответа не определяется.
- Повреждённые доли или ошибка БД: 500 с безопасным сообщением.
- `languages` отсортированы по убыванию доли. Страны не определяются по языкам; `countries: null` не означает нулевую аудиторию.
- API читает БД; MTProto-сбор запускается отдельным cron worker.

## Поиск постов

`GET /api/posts/search` — GET с query-параметрами, без Bearer.

| Параметр | Значение |
| --- | --- |
| `channelId` | Обязательный ID; отсутствие даёт 400 |
| `q` | Подстрока текста, поиск без учёта регистра |
| `dateFrom`, `dateTo` | Границы публикации; dateTo расширяется до конца дня в часовом поясе процесса |
| `minViews`, `maxViews` | Границы просмотров |
| `type` | `all` по умолчанию; `ads` и `partners` включают отдельные текстовые фильтры |
| `limit`, `offset` | По умолчанию 15 и 0 |
| `sortBy` | `date` по умолчанию, `views_desc`, `views_asc` |

`posts[].text` — обычный текст или `null`. Для успешно собранной статьи это текст, извлечённый из `richMessage`, а не HTML и не набор блоков Telegram. Нового поля или отдельного endpoint статей нет. При неудачной догрузке сохраняется прежний текст, если он был; причина отсутствия текста отдельным полем не возвращается.

Ответ: `{posts,total,absoluteTotal}`. `posts` содержит строковые messageId/groupedId и результат `detectAd` в `ad`; total учитывает фильтры, absoluteTotal — все посты канала. Поиск реализован Prisma `contains`, не полнотекстовым ранжированием. Фильтры ads/partners ищут слова в тексте и не равны фильтрации по `Post.isAd`.

## AI-отчёты

Все восемь маршрутов — **POST**, каждый явно проверяет Bearer. Тело JSON. Все используют `OPENROUTER_API_KEY`, стандартный timeout 60 секунд и модель из `src/lib/openrouter.ts`.

| Путь | Тело | Выборка / основание | Успешный ответ | Тип в AiReport |
| --- | --- | --- | --- | --- |
| `/api/ai/summary` | `{channelId, days?: 7}` | До 50 текстовых постов за период | `{summary: string}` | `summary` |
| `/api/ai/super-report` | `{channelId}` | До 150 текстовых постов за фиксированные 42 дня | `{summary: string}` | `super_report` |
| `/api/ai/compare` | `{channelId, days?: 7}` | Целевой канал и «Мой канал», до 50 постов каждого | `{summary: string}` | `compare` |
| `/api/ai/trends` | Не требуется | До 100 текстовых постов активных конкурентов за 48 часов | JSON-объект LLM | `trend` |
| `/api/ai/audience` | `{channelId, days?: 7}` | До 20 текстовых постов | `{audience: string}` | `audience` |
| `/api/ai/persona` | `{channelId}` | До 30 последних текстовых постов | `{persona: string}` | `persona` |
| `/api/ai/action-plan` | `{reportId}` | Существующий отчёт | `{summary: string}` | `action_plan` |
| `/api/ai/compare-reports` | `{reportId1, reportId2}` | Два существующих отчёта | `{summary: string}` | `evolution` |

Обозначение `days?: 7` в таблице означает необязательное поле с default 7; пример действительного JSON: `{ "channelId": 1, "days": 7 }`.

Статьи участвуют через `Post.text` наравне с обычными текстовыми публикациями. Дополнительно ограничивается длина контента в промпте: summary и trends — 30 000 символов, super-report — 80 000, compare — по 15 000 на канал. Это лимиты строк в коде, а не лимиты токенов. Audience/persona ограничивают число постов, без отдельного `substring` для всего контента. Восстановление текста не меняет существующие AiReport; новые отчёты запускаются отдельно.

Поля summary/audience/persona содержат **строку**, обычно с JSON от LLM; это не уже распарсенный объект. Ошибки обязательных параметров — 400; отсутствие контента/канала/отчёта даёт 400 или 404 согласно конкретному обработчику. AbortError превращается в 504, остальные сбои — в 500. `saveAiReport` перехватывает ошибку записи, поэтому 200 не гарантирует наличия отчёта в истории.

### Экспорт

`GET /api/reports/:id/export` возвращает HTML-документ отчёта (`text/html`), без Bearer. Невалидный ID — 400 с текстом, отсутствующий отчёт — 404 с текстом, ошибка разбора/рендера — 500 с HTML. Это не PDF-endpoint; клиентский PDF-экспорт реализован отдельно.

## События

- `GET /api/events`: `{events}`, события по дате с привязанными постами и каналами; Bearer не проверяется. POST на этом пути не реализован.
- `POST /api/events/scan`: без тела; выбирает до 2000 постов за 14 дней без eventMentions, фильтрует по ключевым словам, отправляет до 100 кандидатов в OpenRouter (120 секунд). Создаёт Event/EventMention; вернёт `{success:true,savedCount,parsedEvents}` или `{message}` при отсутствии кандидатов. Явной проверки Bearer нет; действует общий middleware.

## Настройки

`GET /api/settings` возвращает `{settings}`; при первом чтении создаёт запись `global`. В ответ входят **немаскированный aiToken**, aiProvider, aiModel и поля схемы. Пользовательская авторизация не реализована.

`POST /api/settings` принимает `{aiProvider,aiModel,aiToken}` и возвращает `{success:true,settings}`. При пустых provider/model используются `openrouter` и `meta-llama/llama-3.1-8b-instruct:free`; пропущенный token сбрасывается в null. Явной проверки Bearer нет. Сохранённые настройки пока не читаются `callOpenRouter`; реальный ключ задаётся окружением, модель — кодом клиента. Поля digest этот POST не настраивает.

## Сбор, health и кэш

### `POST /api/collect/run`

Явная проверка Bearer, тело не требуется. Выполняет цикл в **web-процессе**, ждёт его завершения и очищает оба кэша. Ответ:

```json
{
  "success": true,
  "message": "Цикл сбора успешно завершен",
  "result": {
    "totalChannels": 2,
    "successCount": 1,
    "errorCount": 1,
    "totalPosts": 20,
    "totalSnapshots": 1,
    "durationMs": 5000
  }
}
```

Это иллюстрация формы, не результат реального сбора. `success: true` не гарантирует успех каждого канала; проверяйте счётчики и SyncJob. Защита cron от повторного старта не блокирует этот HTTP-вызов.

### `GET /api/health`

Читает последний SyncJob по startedAt, без Bearer:

| Условие | Статус |
| --- | --- |
| SyncJob ещё нет | 503, `no sync jobs found` |
| Нет endedAt и прошло больше HEALTH_STUCK_THRESHOLD_MINUTES (120) | 503, `sync job stuck` |
| После endedAt прошло больше HEALTH_STALE_THRESHOLD_MINUTES (720) | 503, `sync job stale` |
| Ошибка запроса к БД | 500, `internal server error` |
| Остальное | 200, `{status:"ok",lastSyncStatus,lastSyncEndedAt,channelsSucceeded,channelsFailed}` |

Свежий FAILED/PARTIAL также может дать HTTP 200: handler проверяет давность, а не успешность сбора. Это не проверка lastCollectedAt каждого канала.

### `POST /api/internal/invalidate-cache`

Явная проверка Bearer, пустое тело. Очищает `metricsCache` и `bestTimeCache` **текущего web-процесса**. Ответ: `{ "success": true }`, HTTP 200. Worker вызывает его после основного цикла, если заданы WEB_INTERNAL_URL и COLLECT_API_TOKEN.
