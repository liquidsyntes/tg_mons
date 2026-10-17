# Справочник API

Сверено со всеми `src/app/api/**/route.ts` 16 октября 2026 года. Базовый URL локального web: `http://localhost:4000`. `:id` обозначает внутренний ID PostgreSQL, а не Telegram ID. Типы сводных ответов: [src/lib/types.ts](../src/lib/types.ts).

## Формат и доступ

Большинство обработчиков возвращает JSON, даты сериализуются как ISO-строки, Telegram BigInt как строки. Экспорт отчётов возвращает HTML, отдельный маршрут изображения возвращает сохранённые байты; некоторые ошибки экспорта имеют plain text. Большинство ошибок имеет `{ "error": "..." }`; health использует `{ "status": "error", "message": "..." }`. Валидация неодинакова: часть ID разбирается через `parseInt`, строгая проверка положительного целого числа есть у демографии, скрытия событий, изображений постов и удаления отчётов.

Все страницы и API, кроме входа и health, проходят общий гард в middleware. Браузер использует подписанную HttpOnly-cookie, межсервисные запросы используют `Authorization: Bearer <COLLECT_API_TOKEN>`. Указание «Гард в обработчике» ниже означает дополнительную проверку внутри маршрута. Отсутствующий серверный ключ даёт 500, отсутствие авторизации даёт 401, неверный Bearer или неподходящий `Origin` для cookie-мутации дают 403.

Middleware больше не добавляет Bearer к запросам браузера. Если клиент передал неверный заголовок `Authorization`, действующая cookie не подменяет его. Cookie действует 12 часов и привязана к текущему `COLLECT_API_TOKEN` через HMAC; смена ключа делает старые cookie недействительными. `SameSite=Strict` и проверка точного `Origin` защищают изменения по cookie от межсайтового запроса. В приложении нет пользовательских ролей и серверного списка сессий: выход очищает cookie браузера, а выданная ранее копия действует до истечения срока или смены ключа. Для внешнего доступа необходим HTTPS. `/api/internal/*` принимает только Bearer.

### Вход и выход

- `GET /login`: форма для ручного ввода ключа доступа. Значение ключа не встраивается в клиентский bundle.
- `POST /api/auth/login`: JSON `{accessKey}` и `Origin` текущего сайта. При правильном ключе возвращает `{success:true}` и устанавливает подписанную HttpOnly-cookie на 12 часов; неверный ключ даёт 401, чужой или отсутствующий `Origin` даёт 403.
- `POST /api/auth/logout`: очищает cookie и перенаправляет на `/login` со статусом 303. Требует действующей сессии или Bearer; для cookie нужен совпадающий `Origin`.
- `GET /api/health` остаётся открытым для проверки состояния сервиса. Все остальные GET API требуют сессию или Bearer; изменения также проходят гард в соответствующем обработчике.

## Каналы

| Метод и путь | Вход | Ответ / поведение | Гард в обработчике |
| --- | --- | --- | --- |
| `GET /api/channels` | — | Массив `ChannelMetrics` из overview, включая отключённые каналы | Нет |
| `POST /api/channels` | `{ "input": "@example_channel", "isMine": false }` | 201, метрики добавленного/повторно активированного канала; worker выполняет resolve и попытку backfill до ответа; при недоступном worker 503 | Да |
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
| `GET /api/stats/dashboard` | Нет тела | KPI, `avgErr`, `avgScore`, topGainers/topLosers, postsTimeline/subscribersTimeline только по активным каналам |
| `GET /api/stats/channel/:id` | `period=24h`, `7d` или `30d`, default `7d` | `{channel,myChannel,period,scoreBreakdown,membersHistory,postsDistribution,vrHistory,heatmapData,myHeatmapData,recentPosts}` |
| `GET /api/stats/compare` | Обязательные `a`, `b` — ID каналов; `period` как выше | `{ "a": ChannelDetailStats, "b": ChannelDetailStats, "period": "7d" }`; 400 без ID, 404 если канал не найден |
| `GET /api/stats/best-time` | — | `{bestDay,bestHour,score,avgViews,avgVr,postCount,heatmap}` или `null`, если нет активных конкурентов |
| `GET /api/stats/trends` | — | Последний сохранённый trend: `{createdAt,data}`; `null` при отсутствии/невалидном JSON, новую генерацию не запускает |
| `GET /api/stats/demographics/:id` | Положительный Int ID | Последний языковой снимок; контракт ниже |

Эти GET доступны с Web UI-сессией или Bearer; отдельного гарда в обработчиках нет. Overview/dashboard/detail кэшируются в web на 5 минут, best-time на 30 минут. Detail берёт EP из кэшированного overview; при пустом кэше overview рассчитывается и сохраняется для следующих запросов. Неизвестное значение period заменяется на `7d`. Best-time использует VR и количество постов; `avgVr` уже в процентах. Дни/часы слотов берутся в часовом поясе процесса.

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

`GET /api/posts/search`: GET с query-параметрами, доступен после входа или с Bearer.

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

Все восемь маршрутов используют **POST** и явно проверяют общий гард: UI-сессию или Bearer. Тело JSON. Все используют сохранённый в `SystemSetting` ключ OpenRouter с резервом `OPENROUTER_API_KEY`, стандартный timeout 60 секунд и сохранённую модель с резервом `z-ai/glm-5.3-flash`.

| Путь | Тело | Выборка / основание | Успешный ответ | Тип в AiReport |
| --- | --- | --- | --- | --- |
| `/api/ai/summary` | `{channelId, days?: 7}` | До 50 текстовых постов за период | `{summary: string}` | `summary` |
| `/api/ai/super-report` | `{channelId}` | Последние 50 текстовых постов канала | `{summary: string}` | `super_report` |
| `/api/ai/compare` | `{channelId, days?: 7}` | Целевой канал и «Мой канал», до 50 постов каждого | `{summary: string}` | `compare` |
| `/api/ai/trends` | Не требуется | До 100 текстовых постов активных (`isActive: true`) каналов из избранного (Watchlist, `isFavorite: true`) и «Моего канала» (`isMine: true`) за 48 часов | JSON-объект LLM | `trend` |
| `/api/ai/audience` | `{channelId, days?: 7}` | До 20 текстовых постов | `{audience: string}` | `audience` |
| `/api/ai/persona` | `{channelId}` | До 30 последних текстовых постов | `{persona: string}` | `persona` |
| `/api/ai/action-plan` | `{reportId}` | Существующий отчёт | `{summary: string}` | `action_plan` |
| `/api/ai/compare-reports` | `{reportId1, reportId2}` | Два существующих отчёта | `{summary: string}` | `evolution` |

Обозначение `days?: 7` в таблице означает необязательное поле с default 7; пример действительного JSON: `{ "channelId": 1, "days": 7 }`.

Статьи участвуют через `Post.text` наравне с обычными текстовыми публикациями. Дополнительно ограничивается длина контента в промпте: summary и trends — 30 000 символов, super-report — 80 000, compare — по 15 000 на канал. Это лимиты строк в коде, а не лимиты токенов. Audience/persona ограничивают число постов, без отдельного `substring` для всего контента. Восстановление текста не меняет существующие AiReport; новые отчёты запускаются отдельно.

Поля summary/audience/persona содержат **строку**, обычно с JSON от LLM; это не уже распарсенный объект. Ошибки обязательных параметров — 400; отсутствие контента/канала/отчёта даёт 400 или 404 согласно конкретному обработчику. AbortError превращается в 504, остальные сбои — в 500. `saveAiReport` перехватывает ошибку записи, поэтому 200 не гарантирует наличия отчёта в истории.

### Экспорт

`GET /api/reports/:id/export` возвращает HTML-документ отчёта (`text/html`) после авторизации в middleware. Невалидный ID даёт 400 с текстом, отсутствующий отчёт даёт 404 с текстом, ошибка разбора/рендера даёт 500 с HTML. Это не PDF-endpoint; клиентский PDF-экспорт реализован отдельно.

`DELETE /api/reports/:id` физически удаляет запись `AiReport` после проверки UI-сессии или Bearer. Успех: 200 и `{success:true}`; некорректный ID: 400, отсутствующий отчёт: 404, ошибка БД: 500. После удаления страница отчёта и его HTML-экспорт недоступны. Уже скачанные пользователем файлы не затрагиваются.

## События

- `GET /api/events`: `{events}`, нескрытые события по дате с привязанными постами и каналами; упоминания из явно распознанных дайджестов исключены из ответа, а карточки без других упоминаний скрыты. Совпавшие карточки отображаются одной карточкой со ссылками на все исходные посты. `imageUrl` указывает на сохранённое изображение одного из видимых исходных постов или равен `null`; байты изображения в JSON не включаются. Данные в БД не удаляются. Доступ требует UI-сессию или Bearer через middleware. POST на этом пути не реализован.
- `POST /api/events/scan`: без тела; выбирает до 2000 постов за 14 дней без eventMentions. Явные дайджесты отбрасывает до OpenRouter Decisions API. Модель `~typesafe/jev-latest` оценивает анонс, пять признаков для ранжирования и отдельные условия: один основной будущий анонс (от 0.5), конкретная дата с условием участия (от 0.5), не отчёт о прошедшем событии (ниже 0.8), не дайджест (ниже 0.8). При ошибке Jev включается прежний фильтр по ключевым словам после удаления явных дайджестов. До 100 отобранных постов передаются в генеративную модель (таймаут 120 секунд) для извлечения деталей; она также должна отклонять отчёты, общую рекламу и тизеры без условий участия. Event создаётся только с действительным ID исходного поста из выборки. Ответ: `{success:true,savedCount,parsedEvents,selectionMode}`, где `selectionMode` равен `jev`, `keyword_fallback` или `no_candidates`. Маршрут явно проверяет UI-сессию или Bearer.
- `PATCH /api/events/:id/dismiss`: без тела, отмечает событие временем скрытия и возвращает `{success:true}`. Повторный вызов также возвращает успех. Некорректный ID даёт 400, отсутствующее событие даёт 404. Маршрут проверяет UI-сессию или Bearer; для cookie-запроса требуется совпадающий `Origin`. Связи EventMention остаются, поэтому прежние посты не сканируются снова, а новые анонсы могут привязаться к скрытому событию при совпадении даты и названия.
- `GET /api/posts/:id/image`: отдаёт сохранённое изображение поста с исходным `Content-Type`; 400 при некорректном ID, 404 при отсутствии изображения. Доступ требует UI-сессию или Bearer через middleware. Изображение появляется после прохода сборщика по соответствующему посту.

## Настройки

`GET /api/settings` возвращает `{settings}`; при первом чтении создаёт запись `global` с текущей моделью по умолчанию. Поле `aiToken` не возвращается. Вместо него доступны `hasToken`, `tokenPreview` (до четырёх последних символов, для коротких ключей скрыто полностью) и `tokenSource` (`saved`, `environment` или `null`). Доступ требует UI-сессию или Bearer; маршрут также явно проверяет гард.

`POST /api/settings` принимает `{aiProvider,aiModel,aiToken,clearToken}` и возвращает `{success:true,settings}` без полного токена. Поддерживается `aiProvider: "openrouter"`; пустая модель выбирает `z-ai/glm-5.3-flash`. Пропущенный, пустой или маскированный `aiToken` не меняет сохранённый ключ. Для явного удаления сохранённого ключа передайте `clearToken: true`; если задан `OPENROUTER_API_KEY`, он продолжит работать как резерв. Успешная запись сбрасывает кэш конфигурации текущего web-процесса. Маршрут явно проверяет UI-сессию или Bearer. Поля digest этот POST не настраивает.

## Сбор, health и кэш

### `POST /api/collect/run`

Явная проверка UI-сессии или Bearer, тело не требуется. Web передаёт задачу во внутренний API worker, ждёт завершения цикла и очищает оба кэша. Ответ:

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

Это иллюстрация формы, не результат реального сбора. `success: true` не гарантирует успех каждого канала; проверяйте счётчики и SyncJob. Если сбор уже выполняется или ожидает в очереди, маршрут возвращает 409 `{ "error": "Сбор уже выполняется" }`. При недоступном worker возвращает 503. Активный SyncJob защищён транзакционной блокировкой PostgreSQL.

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
