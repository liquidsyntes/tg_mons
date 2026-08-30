# Дорожная карта развития TgMon

> Основано на аудите проекта (август 2026), проделанной работе и анализе текущего стека.
> Стек: Next.js 15, GramJS, Prisma/SQLite, OpenRouter/DeepSeek, Tailwind, Recharts.

---

## 1. Автоматический сбор данных по расписанию

**Проблема:** Сбор данных (`/api/collect/run`) запускается вручную. Нет cron-задачи, которая периодически собирает снапшоты и посты.

```
Добавь автоматический сбор данных в проект TgMon. Сейчас collect/run вызывается вручную.

1. Создай src/worker/scheduler.ts:
   - setInterval-задача, запускается каждые N минут (из env COLLECT_INTERVAL_MIN, дефолт 30)
   - Вызывает runCollectCycle() из worker/collector
   - Логирует результаты в console с timestamp
   - Graceful shutdown: при SIGTERM/SIGINT очищает интервал

2. Интегрируй в Next.js:
   - Запуск через src/instrumentation.ts (Next.js instrumentation hook)
   - Или отдельный процесс: npm run worker (node --import tsx src/worker/scheduler.ts)
   - Добавь в package.json script "worker": "node --import tsx src/worker/scheduler.ts"

3. Добавь env-переменные:
   - COLLECT_INTERVAL_MIN=30 — интервал сбора
   - COLLECT_ENABLED=true — вкл/выкл

4. В docker-compose.yml добавь отдельный сервис worker, который запускает npm run worker.

5. Добавь API endpoint GET /api/collect/status — возвращает: lastRun, nextRun, isRunning, interval.
```

---

## 2. Уведомления о росте/падении каналов

**Проблема:** Нет алертов. Пользователь не знает, когда канал резко вырос или упал, пока не откроет дашборд.

```
Добавь систему уведомлений в TgMon. Сейчас нет алертов при резких изменениях метрик каналов.

1. Создай prisma-модель Alert:
   - id, channelId (FK), type (growth | decline | milestone | anomaly), threshold, message, createdAt, isRead
   - Migration: prisma migrate dev --name add-alerts

2. Создай src/lib/alerts.ts:
   - checkAlerts(channelId): после каждого сбора проверяет дельты (24h, 7d)
   - Если delta24h.abs > threshold (5% от currentMembers) → создаёт Alert
   - Если milestone (1000, 5000, 10000, 100000 подписчиков) → создаёт Alert
   - Дедупликация: не создавать алерт того же типа для того же канала чаще 1 раза в 24ч

3. Интегрируй в collect cycle:
   - После runCollectCycle() вызывай checkAlerts() для каждого канала

4. API endpoints:
   - GET /api/alerts — список непрочитанных алертов
   - PATCH /api/alerts/[id]/read — отметить как прочитанное
   - PATCH /api/alerts/read-all — отметить все как прочитанные

5. UI: в Header.tsx добавь иконку колокольчика с бейджем непрочитанных алертов. Дропдаун с последними 10 алертами.

6. Telegram-уведомления: если в .env есть BOT_TOKEN и CHAT_ID, отправляй алерт через Telegram Bot API (fetch на api.telegram.org/bot{token}/sendMessage).
```

---

## 3. Экспорт метрик в CSV/Excel

**Проблема:** Нет экспорта данных кроме PDF. Пользователь не может выгрузитьraw-данные для внешнего анализа.

```
Добавь экспорт метрик в CSV в проект TgMon. Сейчас экспорт только в PDF (через ExportPdfButton).

1. Создай src/lib/export.ts:
   - exportToCsv(data: Record<string, any>[], filename: string): генерирует CSV строку и триггерит скачивание
   - exportToJson(data: any, filename: string): JSON-экспорт
   - Корректное экранирование запятых, кавычек, переносов строк в CSV

2. API endpoint GET /api/export/channels:
   - Возвращает CSV со всеми каналами: title, username, currentMembers, delta24h, delta7d, delta30d, posts30d, avgPostsPerDay, status, lastCollectedAt
   - Заголовок Content-Type: text/csv, Content-Disposition: attachment

3. API endpoint GET /api/export/channel/[id]:
   - Параметр type: subscribers | posts | full
   - subscribers: CSV с историей подписчиков (collectedAt, membersCount, delta)
   - posts: CSV с постами (publishedAt, views, text_preview, isAd)
   - full: ZIP-архив с обоими CSV

4. UI: в ChannelHeader.tsx рядом с ExportPdfButton добавь dropdown с опциями "Экспорт в PDF", "Экспорт в CSV", "Экспорт в Excel".
   - В ChannelsTable.tsx в toolbar добавь кнопку "Экспорт CSV" для всех каналов.
```

---

## 4. Сравнение каналов попарно (страница /compare)

**Проблема:** Сравнение работает только через AI (сравнительный отчёт). Нет визуального side-by-side сравнения метрик двух каналов на графиках.

```
Доработай страницу /compare в TgMon. Сейчас там AI-сравнение, но нет визуального сравнения метрик.

1. Расширь GET /api/stats/compare:
   - Принимает channelId1, channelId2, period
   - Возвращает: оба канала с метриками + общая история подписчиков (выровненная по датам) + сравнение постов + heatmap обоих

2. Перепиши /compare/page.tsx:
   - Выбор двух каналов через dropdown (или через URL: /compare?id1=1&id2=2)
   - Side-by-side KPI карточки: подписчики, Δ24h, Δ7d, посты/день, ERR — с цветовой индикацией кто больше
   - Overlay LineChart: оба канала на одном графике подписчиков
   - Сравнительный BarChart: посты по дням двух каналов рядом
   - Две heatmap рядом (или одна с двумя цветами — конкурент оранжевый, мой — фиолетовый)
   - Сохранить существующий AI Compare Report ниже

3. Добавь возможность выбора каналов через search input с автодополнением (GET /api/channels?q=...).
```

---

## 5. Исторический тренд ERR (Engagement Rate by Reach)

**Проблема:** ERR считается только для текущего периода. Нет графика изменения ERR во времени — важнейший показатель здоровья канала.

```
Добавь исторический тренд ERR в TgMon. Сейчас ERR показывается только как точка в текущем периоде.

1. В src/lib/metrics.ts:
   - Создай функцию getErrHistory(channelId, days):
     - Группирует посты по дням (как postsDistribution)
     - Для каждого дня считает: avgViews, membersCount (из снапшота), ERR = avgViews / membersCount * 100
     - Возвращает: [{ date, err, avgViews, membersCount }]

2. В ChannelDetailStats тип добавь поле errHistory: { date: string; err: number; avgViews: number }[]

3. В getChannelDetailStats добавь вызов getErrHistory и включи в ответ.

4. UI: новый компонент src/components/channel/ErrChart.tsx:
   - LineChart с ERR по дням (YAxis — %, зелёная линия)
   - Включить существующие графики вовлечённости, но заменить статичный ERR на исторический
   - Добавь benchmark-линию (средний ERR по нише, если есть данные)

5. Размести в ChannelDetailClient между PostsActivity и ChannelHeatmap.
```

---

## 6. Telegram-бот для управления мониторингом

**Проблема:** Все действия — через веб-интерфейс. Нет мобильного управления: добавить канал, запустить сбор, посмотреть метрики.

```
Добавь Telegram-бота в TgMon для управления мониторингом через Telegram.

1. Установи grammy или node-telegram-bot-api.

2. Создай src/bot/index.ts:
   - Запуск как отдельный процесс (npm run bot)
   - Токен из env TELEGRAM_BOT_TOKEN
   - Авторизация: только пользователь с chat_id из env TELEGRAM_ADMIN_CHAT_ID

3. Команды бота:
   - /start — приветствие + список команд
   - /channels — список отслеживаемых каналов с подписчиками и Δ7d
   - /add <username> — добавить канал (вызывает addChannelByInput)
   - /remove <id> — удалить канал (soft delete)
   - /collect — запустить сбор (вызывает runCollectCycle)
   - /stats — overview: топ-5 каналов по росту, общий ERR, публикаций за неделю
   - /report <channelId> — сгенерировать AI summary (вызывает callOpenRouter)
   - /alerts — последние 5 алертов

4. Инлайн-кнопки: после /channels — кнопки "Обновить", "Добавить канал".
   После /stats — кнопки "Детальнее" с callback_data.

5. Добавь в docker-compose.yml сервис bot.
6. Добавь в package.json: "bot": "node --import tsx src/bot/index.ts".
```

---

## 7. Контент-календарь и рекомендации по времени постинга

**Проблема:** Heatmap показывает когда выходят посты, но нет рекомендаций когда лучше публиковать. Нет планировщика.

```
Добавь контент-календарь в TgMon на основе heatmap-данных.

1. Расширь getBestTimeRecommendation в src/lib/metrics.ts:
   - Для каждого дня недели вернуть: top-3 часа по активности, engagement score (ERR в эти часы), "свободные окна" (когда конкуренция минимальна)
   - Добавить поле confidence: high | medium | low (на основе объёма данных)

2. API endpoint GET /api/stats/best-time/[channelId]:
   - Возвращает best-time конкретного канала, а не только общий

3. UI: src/components/channel/ContentCalendar.tsx:
   - 7-дневная сетка (Пн–Вс) с рекомендуемыми часами для постинга
   - Цветовая индикация: зелёный — лучшее время, жёлтый — норма, серый — не рекомендовано
   - Подсказка: "Лучшее время: Вт 18:00–20:00 (ERR ~12%, 3 поста конкурентов)"

4. Для "Моего канала":
   - Сравнение: когда ты публикуешь vs когда лучше публиковать
   - Список "упущенных окон" — часы с высокой аудиторией, но низким количеством твоих постов

5. Добавь в ChannelDetailClient после ChannelHeatmap.
```

---

## 8. Миграция на PostgreSQL для production

**Проблема:** SQLite — отлично для разработки, но при >50 каналов и >100K постов начнутся блокировки и тормоза.

```
Подготовь миграцию TgMon с SQLite на PostgreSQL.

1. Обнови prisma/schema.prisma:
   - datasource provider: "postgresql"
   - Добавь индексы:
     - @@index([channelId, publishedAt]) на Post
     - @@index([channelId, collectedAt]) на Snapshot
     - @@index([type, createdAt]) на AiReport
   - Добавь поле @@map для таблиц (snake_case: channel → channels, post → posts и т.д.)

2. Обнови .env:
   - Замените DATABASE_URL на postgresql://user:pass@localhost:5432/tgmon
   - Оставь старый SQLITE_DATABASE_URL для dev-режима
   - В prisma.ts: определяй провайдер по env DATABASE_PROVIDER (sqlite | postgresql)

3. Обнови docker-compose.yml:
   - Верни сервис postgres с volume
   - healthcheck для postgres
   - Переменные окружения для подключения

4. Создай миграцию: npx prisma migrate dev --name migrate-to-postgresql

5. Скрипт миграции данных src/scripts/migrate-sqlite-to-pg.ts:
   - Читает данные из SQLite (открывает через better-sqlite3)
   - Записывает в PostgreSQL батчами по 1000 записей
   - Прогресс-бар в консоли
   - Idempotent: проверяет, есть ли уже данные

6. Обнови README с инструкцией миграции.
```

---

## 9. CI/CD pipeline через GitHub Actions

**Проблема:** Нет автоматических проверок при push. Билд и тесты проверяются вручную.

```
Добавь CI/CD pipeline в TgMon через GitHub Actions.

1. Создай .github/workflows/ci.yml:
   - Triggers: push to main, pull request to main
   - Jobs:
     a) lint:
        - npm ci
        - npx eslint src/ --max-warnings=0
     b) test:
        - npm ci
        - npx prisma generate
        - npx vitest run
        - Upload coverage report as artifact
     c) build:
        - npm ci
        - npx prisma generate
        - npm run build
        - Cache .next между запусками
     d) docker:
        - Build docker image
        - Не пушить, только проверить что билдится

2. Создай .github/workflows/deploy.yml:
   - Trigger: push to main (после успешного ci.yml)
   - Build and push Docker image to ghcr.io
   - SSH deploy на production сервер
   - Health check после деплоя

3. Добавь .github/dependabot.yml:
   - Проверка обновлений npm-зависимостей (weekly)
   - Проверка обновлений Docker base images (weekly)

4. Добавь .nvmrc с версией Node.js.

5. Добавь в README.md бейджи CI.
```

---

## 10. Поиск и фильтрация постов по контенту

**Проблема:** Посты показываются последние 15, без поиска. Нет возможности найти посты по ключевым словам или по просмотрам.

```
Добавь поиск и фильтрацию постов в TgMon. Сейчас показывается последние 15 постов без поиска.

1. Создай prisma-индекс: @@index([channelId, publishedAt, text])

2. В SQLite включи FTS5 (Full-Text Search):
   - Создай виртуальную таблицу posts_fts через raw SQL в Prisma
   - Триггеры для синхронизации при INSERT/UPDATE/DELETE
   - Или используй LIKE с %keyword% (проще, но медленнее на больших объёмах)

3. API endpoint GET /api/posts/search:
   - Параметры: channelId, q (query), dateFrom, dateTo, minViews, maxViews, isAd, limit, offset
   - Возвращает: посты с пагинацией + total count

4. UI: расширь RecentPosts.tsx:
   - Search input с дебаунсом 300ms
   - Фильтры: дата (from/to), просмотры (min/max), тип (all/ads/partners)
   - Пагинация: "Показать ещё" кнопка (load more, offset += 15)
   - Сортировка: по дате (desc), по просмотрам (desc/asc)
   - Highlight найденного текста в результатах

5. Добавь счётчик: "Найдено N постов из M".
```

---


---

## 12. Авторизация пользователей (multi-user)

**Проблема:** Сейчас нет авторизации. Любой кто знает URL имеет доступ к дашборду. Bearer-тoken — для API, но не для UI.

```
Добавь авторизацию в TgMon. Сейчас нет защиты UI — любой с URL имеет доступ.

1. Установи next-auth (Auth.js) сCredentials provider:
   - Один администратор (логин/пароль из env: ADMIN_LOGIN, ADMIN_PASSWORD_HASH)
   - Или через Telegram Login Widget (telegram.org/apps/auth)

2. Создай src/app/api/auth/[...nextauth]/route.ts:
   - Credentials provider: проверяет логин/пароль
   - JWT-стратегия с httpOnly cookie
   - Session: 24 часа

3. Создай src/app/login/page.tsx:
   - Минималистичная форма логина (тёмная тема)
   - После успешного логина → редирект на /
   - При ошибке → сообщение "Неверный логин или пароль"

4. Обнови src/middleware.ts:
   - Проверка сессии для всех маршрутов кроме /login, /api/auth/*
   - Если не авторизован → редирект на /login
   - Если авторизован → пропускает + инжектит Bearer token в API запросы (как сейчас)

5. В Header.tsx:
   - Добавь кнопку "Выйти"
   - Показывать логин администратора

6. Пароль хранить в .env как bcrypt hash, не plain text.
   - Скрипт src/scripts/hash-password.ts для генерации хэша.

7. В .env.example: ADMIN_LOGIN="admin", ADMIN_PASSWORD_HASH="$2a$12$..."
```

---

## 13. Вебхуки для интеграций

**Проблема:** Нет способа получать уведомления во внешние системы (Slack, Discord, Make/n8n) при событиях.

```
Добавь webhook-систему в TgMon для интеграций с внешними сервисами.

1. Создай prisma-модель Webhook:
   - id, url, secret, events (JSON array: ["collect.finished", "alert.growth", "alert.milestone", "ai.report.ready"]), isActive, createdAt
   - И модель WebhookDelivery: id, webhookId, event, payload (JSON), status (pending/sent/failed), attempts, sentAt

2. Создай src/lib/webhooks.ts:
   - triggerWebhook(event, payload): находит все активные вебхуки, подписанные на event
   - POST на url с заголовком X-Webhook-Secret и HMAC-подписью в X-Webhook-Signature
   - Retry: 3 попытки с экспоненциальным backoff (5s, 30s, 120s)
   - Логирует доставку в WebhookDelivery

3. События:
   - collect.finished — после каждого цикла сбора
   - alert.growth — при алерте о росте
   - alert.milestone — при достижение里程碑а
   - ai.report.ready — после генерации AI-отчёта
   - channel.added — при добавлении канала

4. API endpoints:
   - GET /api/webhooks — список вебхуков
   - POST /api/webhooks — создать (url, events, secret)
   - DELETE /api/webhooks/[id] — удалить
   - POST /api/webhooks/[id]/test — отправить тестовый payload

5. UI: простая страница /settings с таблицей вебхуков и формой добавления.
```

---

## 14. Прогнозирование роста канала (ML-линейная регрессия)

**Проблема:** Есть простой linear regression forecast на графике, но нет отдельной страницы с прогнозом и сценариями.

```
Добавь прогнозирование роста канала в TgMon. Сейчас есть простой forecast на графике, но нет отдельной аналитики.

1. Создай src/lib/forecast.ts:
   - forecastGrowth(channelId, days):
     - Linear regression по снапшотам за 30/60/90 дней
     - 3 сценария: optimistic (+20% к slope), realistic (текущий slope), conservative (-20% к slope)
     - Точки: когда достигнет следующих milestone (1000, 5000, 10000, 50000, 100000, 500000, 1M)
     - R² coefficient of determination — оценка точности модели
     - Сезонность: если данных >90 дней, определить недельный паттерн (день недели с наибольшим ростом)

2. API endpoint GET /api/stats/forecast/[channelId]:
   - Параметр days: период обучения (30/60/90)
   - Возвращает: scenarios { optimistic, realistic, conservative }, milestones, r2, seasonality

3. UI: src/components/channel/ForecastPanel.tsx:
   - Три линии на графике (optimistic/realistic/conservative)
   - Таблица milestone: "10K — через ~45 дней (realistic)"
   - Карточка с R²: "Точность модели: 87%"
   - Рекомендация: "При текущем темпе канал достигнет 10K через 45 дней. Для ускорения: +2 поста/неделю в лучшие часы"

4. Размести в ChannelDetailClient после SubscriberChart.
```

---

## 15. Дневник изменений канала (CHANGELOG)

**Проблема:** Нет истории изменений: когда канал переименован, когда сменился username, когда происходили резкие скачки.

```
Добавь дневник изменений канала в TgMon. Нет истории метаданных и событий.

1. Создай prisma-модель ChannelEvent:
   - id, channelId (FK), type (renamed | username_changed | milestone | spike | drop | ad_detected | added | removed), description, metadata (JSON), createdAt

2. Создай src/lib/events.ts:
   - logEvent(channelId, type, description, metadata)
   - В collect cycle: проверять изменения title, username — логировать
   - Проверять резкие скачки (Δ > 10% за один сбор) — логировать как spike/drop
   - При достижении milestone — логировать

3. API endpoint GET /api/events/[channelId]:
   - Параметры: limit, offset, type (filter)
   - Возвращает список событий с пагинацией

4. UI: src/components/channel/ChannelChangelog.tsx:
   - Timeline-компонент с иконками по типу события:
     - 📛 renamed — "Канал переименован: 'Старый' → 'Новый'"
     - 🔗 username_changed — "@old → @new"
     - 🎯 milestone — "10 000 подписчиков!"
     - 📈 spike — "+500 подписчиков за один сбор (+12%)"
     - 📉 drop — "-200 подписчиков"
     - 📢 ad_detected — "Обнаружена рекламная интеграция"
   - Каждый элемент: иконка, описание, timestamp, метаданные

5. Размести в ChannelDetailClient после RecentPosts (или как вкладка).
```

---

## 16. Скоринг качества контента (Content Score)

**Проблема:** Нет агрегированной оценки качества канала. ERR — один показатель, но нет комплексной оценки.

```
Добавь скоринг качества контента в TgMon. ERR — один показатель, нет комплексной оценки.

1. Создай src/lib/scoring.ts:
   - calculateContentScore(channelId):
     - ERR score (0-30): ERR > 10% → 30, 5-10% → 20, 2-5% → 10, < 2% → 5
     - Consistency score (0-20): публикаций в день / target (1-3/день) → 20, 0.5-1 → 15, < 0.5 → 5
     - Growth score (0-20): Δ7d > 2% → 20, 0-2% → 10, < 0% → 0
     - Engagement diversity (0-15): отношение ответов/реакций к просмотрам (если данные доступны)
     - Content originality (0-15): низкий % рекламных постов → 15, высокий → 5
     - Итог: 0-100, буквы: A+ (90+), A (80-89), B (70-79), C (60-69), D (<60)

2. В getChannelDetailStats добавь поле contentScore.

3. В ChannelMetrics тип добавь:
   - contentScore: number (0-100)
   - contentGrade: string (A+ ... D)

4. UI: src/components/channel/ScoreGauge.tsx:
   - Circular gauge (SVG) с цветом: зелёный (A), жёлтый (B-C), красный (D)
   - Разбивка по категориям: "ERR: 25/30, Consistency: 18/20, Growth: 15/20..."
   - Рекомендация: "Ниже всего Consistency (10/20) — увеличьте частоту постинга"

5. В ChannelsTable добавь колонку Score с цветным бейджем.
6. В дашборде: средний Score по всем каналам.
```

---

## 17. Тёмная/светлая тема переключатель

**Проблема:** Только тёмная тема. Нет переключателя, нет системной prefers-color-scheme.

```
Добавь переключатель тёмной/светлой темы в TgMon. Сейчас только тёмная тема.

1. Установи next-themes.

2. Обнови src/app/layout.tsx:
   - <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
   - suppressHydrationWarning на <html>

3. Обнови tailwind.config.ts:
   - darkMode: 'class'
   - Добавь CSS-переменные для светлой темы (в globals.css):
     - --background, --surface, --border, --accent, --text-primary, --text-secondary
     - Тёмная тема: background #0a0a0a, surface #141414, border #262626
     - Светлая тема: background #f8f9fa, surface #ffffff, border #e5e7eb, accent #3b82f6

4. Замени hardcoded Tailwind-классы:
   - bg-slate-900 → bg-surface
   - text-slate-100 → text-text-primary
   - border-slate-800 → border-border
   - text-accent → text-accent (CSS-переменная)
   - Во всех компонентах channel/* и на главной странице

5. UI: в Header.tsx добавь переключатель (иконка Sun/Moon из lucide-react):
   - При клике — toggle theme
   - Запоминать в localStorage (next-themes делает это)

6. Проверь что графики (Recharts) тоже адаптируются:
   - stroke="#64748b" → stroke="var(--chart-axis)"
   - strokeDasharray → можно оставить
   - Background color в tooltip → var(--chart-tooltip-bg)
```

---

## 18. API rate limiting

**Проблема:** Нет rate limiting. AI endpoints могут быть вызваны без ограничений — это дорого (OpenRouter платный).

```
Добавь rate limiting в TgMon. AI endpoints не имеют ограничений — дорого на OpenRouter.

1. Создай src/lib/rateLimit.ts:
   - In-memory rate limiter (Map<identifier, { count, resetAt }>)
   - Класс RateLimiter с методом check(identifier): { allowed, remaining, resetAt }
   - Sliding window или fixed window (fixed — проще)

2. Создай middleware для rate limiting:
   - AI endpoints: 10 запросов в час на IP (env: AI_RATE_LIMIT_PER_HOUR=10)
   - Collect endpoint: 5 запросов в час (env: COLLECT_RATE_LIMIT_PER_HOUR=5)
   - Stats endpoints: 100 запросов в минуту на IP
   - Headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset

3. Интегрируй в src/middleware.ts:
   - После auth-проверки, перед обработкой запроса
   - 429 Too Many Requests с заголовками + JSON { error, retryAfter }

4. Для AI endpoints добавь доп. лимит:
   - Не больше 1 параллельного AI-запроса (in-progress flag)
   - Если уже идёт — 429 "Генерация уже выполняется, подождите"

5. В UI: показывать remaining в кнопках AI:
   - "Сгенерировать саммари (осталось: 8/10 в этом часу)"
   - При 429 — toast: "Лимит исчерпан. Попробуйте через X минут"

6. Для production: Redis-based rate limiter (upstash/ratelimit).
   - В dev: in-memory (текущий вариант).
   - Переключатель через env RATE_LIMIT_DRIVER=memory|redis.
```

---

## 19. Архив и поиск AI-отчётов

**Проблема:** AI-отчёты сохраняются в БД (aiReport), но нет UI для просмотра истории. Пользователь генерирует отчёт, видит, закрывает — и больше не может найти.

```
Добавь архив AI-отчётов в TgMon. Отчёты сохраняются в БД, но нет UI для просмотра истории.

1. API endpoints:
   - GET /api/reports?channelId=X&type=summary&page=1&limit=10 — список с пагинацией
   - GET /api/reports/[id] — полный текст отчёта
   - DELETE /api/reports/[id] — удалить отчёт
   - GET /api/reports/[id]/diff?compareWith=Y — сравнить два отчёта (вызывает AI compare-reports)

2. UI: src/app/reports/page.tsx (новая страница):
   - Фильтры: по каналу (dropdown), по типу (summary/compare/trends/audience/action_plan/evolution)
   - Таблица: дата, канал, тип, превью (первые 100 символов), действия
   - При клике → /reports/[id] — полная страница отчёта
   - Markdown-рендеринг (уже есть ReactMarkdown)
   - Кнопка "Сравнить с другим отчётом" → выбор из dropdown → переход на compare-reports

3. В Header.tsx:
   - Добавь ссылку "Отчёты" в навигацию

4. В AIReportsSection.tsx (на странице канала):
   - После генерации нового отчёта → toast: "Отчёт сохранён. Открыть архив →"
   - Ссылка на /reports?channelId=X&type=summary

5. Экспорт: на странице отчёта кнопка "Экспорт в MD" (уже реализована логика в AIReportsSection).
```

---

## 20. PWA (Progressive Web App)

**Проблема:** Нет PWA. Пользователь не может "установить" приложение, нет оффлайн-режима.

```
Добавь PWA в TgMon. Нет возможности установить приложение, нет оффлайн-режима.

1. Установи next-pwa (или @ducanh2912/next-pwa для Next.js 15).

2. Создай public/manifest.json:
   - name: "TgMon — Аналитика Telegram"
   - short_name: "TgMon"
   - theme_color: "#0a0a0a"
   - background_color: "#0a0a0a"
   - display: "standalone"
   - icons: 192px и 512px (сгенерировать из логотипа)
   - start_url: "/"
   - scope: "/"

3. Обнови src/app/layout.tsx:
   - <link rel="manifest" href="/manifest.json">
   - <meta name="theme-color" content="#0a0a0a">
   - <apple-touch-icon> для iOS

4. Создай Service Worker (через next-pwa):
   - Runtime caching:
     - API /api/stats/*: StaleWhileRevalidate, TTL 5 мин
     - Static assets (JS, CSS, images): CacheFirst
     - Pages: NetworkFirst (с fallback на кэш)
   - Offline fallback: /offline — простая страница "Нет соединения"

5. Создай src/app/offline/page.tsx:
   - "Вы оффлайн. Данные будут обновлены при подключении."
   - Кнопка "Повторить" → reload

6. Тестирование:
   - Lighthouse PWA audit
   - Проверка install prompt в Chrome
   - Оффлайн-режим в DevTools
```

---

## Приоритеты

| Приоритет | Задача | Сложность | Влияние |
|---|---|---|---|
| 🔴 Высокий | 1. Автосбор (cron) | Средняя | Устраняет ручную работу |
| 🔴 Высокий | 2. Уведомления/алерты | Средняя | Удерживает пользователя |
| 🔴 Высокий | 9. CI/CD pipeline | Низкая | Качество кода |
| 🟡 Средний | 3. Экспорт CSV | Низкая | Утилитарно |
| 🟡 Средний | 5. Тренд ERR | Низкая | Аналитика |
| 🟡 Средний | 8. PostgreSQL | Средняя | Production-ready |
| 🟡 Средний | 10. Поиск постов | Средняя | UX |
| 🟡 Средний | 11. Дашборд | Средняя | UX |
| 🟡 Средний | 12. Авторизация | Средняя | Безопасность |
| 🟡 Средний | 19. Архив отчётов | Низкая | UX |
| 🟢 Низкий | 4. Compare page | Высокая | Фичя |
| 🟢 Низкий | 6. Telegram-бот | Высокая | Канал взаимодействия |
| 🟢 Низкий | 7. Контент-календарь | Средняя | Фичя |
| 🟢 Низкий | 13. Вебхуки | Средняя | Интеграции |
| 🟢 Низкий | 14. Прогнозирование | Высокая | Аналитика |
| 🟢 Низкий | 15. Дневник изменений | Низкая | Аналитика |
| 🟢 Низкий | 16. Скоринг контента | Средняя | Аналитика |
| 🟢 Низкий | 17. Тёмная/светлая тема | Низкая | UX |
| 🟢 Низкий | 18. Rate limiting | Низкая | Безопасность |
| 🟢 Низкий | 20. PWA | Низкая | UX |
