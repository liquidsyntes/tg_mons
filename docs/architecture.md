# Архитектура проекта TgMon (C4 Model)

Этот документ описывает высокоуровневую архитектуру проекта TgMon, включая основные компоненты, их взаимодействие, пайплайн антифрод-мониторинга и внешние зависимости. Архитектура описана с использованием диаграмм C4 (Context, Container, Component) и Mermaid-схем.

## 1. System Context Diagram

Диаграмма контекста показывает систему TgMon в целом и ее взаимодействие с внешними системами и пользователями.

```mermaid
C4Context
  title System Context diagram for TgMon

  Person(user, "Пользователь", "Владелец Telegram-канала или маркетолог, анализирующий каналы и проверяющий их на накрутку.")
  
  System(tgmon, "TgMon", "Fullstack-система мониторинга, аналитики и антифрод-аудита Telegram-каналов.")
  
  System_Ext(telegram, "Telegram (MTProto)", "Платформа Telegram, откуда собираются сырые данные (подписчики, посты, просмотры, реакции, входящие упоминания).")
  System_Ext(openrouter, "OpenRouter (LLM)", "Внешний API (Gemini/OpenAI/Claude) для генерации AI-сводок и аналитики.")

  Rel(user, tgmon, "Просматривает дашборды, аналитику, бейджи риска накрутки (RiskBadge) и AI-отчеты", "HTTPS")
  Rel(tgmon, telegram, "Собирает данные через клиентский протокол MTProto (GramJS)", "TCP")
  Rel(tgmon, openrouter, "Запрашивает генерацию аналитики по промптам", "HTTPS/REST")
```

## 2. Container Diagram

Диаграмма контейнеров раскрывает внутреннюю структуру системы TgMon на уровне развертываемых единиц (контейнеров).

```mermaid
C4Container
  title Container diagram for TgMon

  Person(user, "Пользователь", "Анализирует дашборд и риски накрутки")

  System_Boundary(tgmon_boundary, "TgMon System") {
    Container(web, "Web App & API", "Next.js 15 (App Router)", "Отображает UI (включая RiskBadge и Citation Index), предоставляет REST API, рассчитывает метрики 'на лету', вычисляет Citation Index и консолидированный fraudScore (0–100), вызывает AI.")
    Container(worker, "MTProto Worker", "Node.js (tsx) + GramJS", "Фоновый процесс (cron), который собирает данные из Telegram, материализует дневные метрики и запускает 4 эвристики антифрода с записью в fraud_signals.")
    ContainerDb(db, "Database", "PostgreSQL 15", "Хранит историю каналов, снапшоты аудитории, посты, агрегаты метрик и сигналы аномалий (fraud_signals).")
  }

  System_Ext(telegram, "Telegram (MTProto)", "Telegram API")
  System_Ext(openrouter, "OpenRouter (LLM)", "AI API")

  Rel(user, web, "Использует интерфейс", "HTTPS")
  Rel(web, db, "Читает/Пишет (Prisma ORM)", "TCP/5432")
  Rel(web, openrouter, "Генерация отчетов", "HTTPS")
  
  Rel(worker, telegram, "Сбор данных (MTProto)", "TCP")
  Rel(worker, db, "Сохраняет сырые данные, агрегаты и fraud_signals", "TCP/5432")
  Rel(worker, web, "Сбрасывает кэш после цикла сбора", "HTTP POST /api/internal/invalidate-cache, Bearer")
```

## 3. Component Diagram (Web App & API)

Эта диаграмма детализирует внутреннюю структуру Next.js приложения, включая модули аналитики и антифрод-скоринга.

```mermaid
C4Component
  title Component diagram for Web App & API

  Container_Boundary(web_boundary, "Web App & API (Next.js)") {
    Component(ui, "React UI Components", "React 19 (Server & Client)", "Рендер дашбордов, таблиц, графиков (Recharts), индикаторов RiskBadge и ячеек Citation Index.")
    
    Component(api_stats, "Stats Route Handlers", "Next.js Route Handlers", "Отдают JSON со сводными метриками (/api/stats/overview, /api/stats/channel/:id, /api/channels).")
    Component(api_ai, "AI Route Handlers", "Next.js Route Handlers", "Пайплайны сбора данных для промпта и обращения к LLM через OpenRouter.")
    Component(api_cache, "Internal Cache Invalidation", "/api/internal/invalidate-cache", "Проверяет Bearer-токен и очищает кэши metricsCache и bestTimeCache.")
    
    Component(lib_metrics, "Metrics Engine & Queries", "src/lib/metrics/*", "Бизнес-логика: ER, ERR, CR, VR, дельты, агрегация снапшотов и связывание каналов.")
    Component(lib_fraud, "Fraud Detector", "src/lib/fraudDetector.ts", "Консолидированный аудит (runFraudAudit), расчет единого fraudScore (0–100) и проверка checkLowCitationGrowth.")
    Component(lib_citation, "Citation Index", "src/lib/citationIndex.ts", "Логарифмический расчет индекса цитирования по входящим упоминаниям за 30 дней (calculateCitationIndex, getCitationIndicesForChannels).")
    Component(lib_cache, "In-memory Cache", "src/lib/cache.ts", "Хранит metricsCache и bestTimeCache в оперативной памяти.")
    Component(lib_ep, "EP Calculator", "src/lib/ep.ts", "Вычисление Effective Point (EP), CEI, Z-score нормализация по нишам.")
    Component(lib_prisma, "Prisma Client", "src/lib/prisma.ts", "Типизированный ORM-доступ к PostgreSQL.")
  }

  ContainerDb(db, "PostgreSQL", "Database")
  System_Ext(openrouter, "OpenRouter API")

  Rel(ui, api_stats, "Запрашивает метрики (включая fraudScore, fraudSignals, citationIndex)", "JSON/REST")
  Rel(ui, api_ai, "Запрашивает AI-генерацию", "JSON/REST")
  
  Rel(api_stats, lib_metrics, "Делегирует расчет сводных метрик")
  Rel(api_stats, lib_ep, "Запрашивает EP-рейтинги")
  Rel(api_stats, lib_fraud, "Запрашивает runFraudAudit(channel) для расчета fraudScore")
  Rel(api_stats, lib_citation, "Запрашивает getCitationIndicesForChannels(channels)")
  Rel(api_ai, lib_metrics, "Собирает контекст для промпта")
  Rel(api_ai, openrouter, "Отправляет промпт")
  Rel(api_cache, lib_cache, "Очищает metricsCache и bestTimeCache")

  Rel(lib_metrics, lib_prisma, "SQL запросы каналов, постов, метрик")
  Rel(lib_fraud, lib_prisma, "Чтение fraud_signals за последние 30 дней")
  Rel(lib_citation, lib_prisma, "Чтение входящих упоминаний (mentions)")
  Rel(lib_ep, lib_prisma, "SQL запросы исторических метрик")
  Rel(lib_prisma, db, "Чтение/Запись данных", "TCP/5432")
```

## 4. Component Diagram (Worker)

Детализация фонового процесса сбора данных и детекции аномалий.

```mermaid
C4Component
  title Component diagram for MTProto Worker

  Container_Boundary(worker_boundary, "MTProto Worker (Node.js)") {
    Component(cron, "Cron Scheduler", "node-cron (src/worker/index.ts)", "Запуск цикла сбора по расписанию (COLLECT_CRON).")
    Component(collector, "Collector Loop", "src/worker/collector.ts", "Итерация по каналам, сбор постов, снапшотов, упоминаний и запуск проверок.")
    Component(demographics, "Demographics Job", "src/worker/demographics.ts", "Еженедельный сбор аудиторной статистики (stats.getBroadcastStats).")
    Component(fraud_detector, "Fraud Detector", "src/lib/fraudDetector.ts", "4 эвристики: гладкость роста (CV), нескоррелированные скачки, ratio просмотров/подписчиков, равномерность ERR (CV).")
    Component(persister, "Persister", "src/worker/persister.ts", "Сохранение постов, реакций, снапшотов и вызов saveFraudSignal().")
    Component(client, "Telegram Client", "GramJS (src/worker/client.ts)", "Низкоуровневая обертка сессии MTProto с реконнектом и защитой от FLOOD_WAIT.")
  }

  ContainerDb(db, "PostgreSQL", "Database")
  Container(web, "Web App & API", "Next.js", "Принимает внутренний запрос на инвалидацию кэша.")
  System_Ext(telegram, "Telegram API")

  Rel(cron, collector, "Триггер сбора (по расписанию)")
  Rel(cron, demographics, "Триггер сбора демографии (раз в неделю)")
  Rel(collector, client, "Вызовы API (getMessages, getFullChannel)")
  Rel(demographics, client, "Вызовы API (stats.getBroadcastStats)")
  Rel(client, telegram, "Сетевые MTProto-запросы", "TCP")
  Rel(collector, fraud_detector, "Запуск 4 эвристик после материализации метрик")
  Rel(collector, persister, "Передача собранных данных и обнаруженных аномалий")
  Rel(persister, db, "Запись постов, снапшотов, агрегатов и fraud_signals", "Prisma/TCP")
  Rel(collector, web, "POST /api/internal/invalidate-cache", "Bearer COLLECT_API_TOKEN")
  Rel(demographics, persister, "Передача языковой разбивки для сохранения")
```

## 5. Пайплайн сбора данных и антифрод-аудита (Data Pipeline & Anti-Fraud Flow)

Сквозной процесс обработки данных объединяет сбор в MTProto Worker, материализацию, фоновую фиксацию сигналов накруток, инвалидацию кэша и динамический аудит при запросах через Web API.

```mermaid
sequenceDiagram
  autonumber
  actor User as Пользователь (Браузер)
  participant UI as Next.js React UI
  participant API as Web API (/api/stats/*)
  participant Engine as Metrics & Fraud Engine
  participant W as Worker (collector.ts)
  participant DB as PostgreSQL (Prisma)
  participant TG as Telegram (MTProto)

  Note over W,TG: Фаза 1: Фоновый сбор данных (Worker)
  W->>TG: Запрос сообщений, реакций и метаданных канала
  TG-->>W: Сырые посты, просмотры, реакции, участники
  W->>DB: Сохранение постов, снапшотов и упоминаний
  W->>DB: materializeDailyMetrics(channelId, 30)

  Note over W,DB: Фаза 2: Проверка 4 эвристик антифрода (Worker)
  W->>Engine: checkGrowthSmoothness(recentMetrics)
  W->>Engine: checkUncorrelatedSpikes(recentMetrics, postsDates, mentionsDates)
  W->>Engine: checkViewsToSubsRatio(recentPosts, currentMembers)
  W->>Engine: checkUniformReactionRatio(recentPosts)
  alt Обнаружена аномалия
    W->>DB: saveFraudSignal(channelId, type, value, reason) -> таблица fraud_signals
  end
  Note over W: Изоляция ошибок (try/catch): сбой антифрода не останавливает сбор

  Note over W,API: Фаза 3: Инвалидация кэша
  W->>API: POST /api/internal/invalidate-cache (Bearer auth)
  API->>API: Очистка metricsCache и bestTimeCache

  Note over User,UI: Фаза 4: Запрос дашборда и динамический аудит (On-Demand)
  User->>UI: Открытие главной страницы или карточки канала
  UI->>API: GET /api/stats/overview или /api/stats/channel/:id
  API->>DB: getCitationIndicesForChannels() (входящие упоминания за 30 дней)
  API->>DB: Запрос свежих fraud_signals (за последние 30 дней)
  API->>Engine: runFraudAudit({ channel, posts, metrics, fraudSignals })
  Engine-->>API: { fraudScore: 0..100, signals: FraudSignal[], details }
  API-->>UI: JSON { ..., citationIndex, fraudScore, fraudSignals }

  Note over UI: Фаза 5: Отрисовка UI-компонентов
  UI->>UI: RiskBadge: расчет тира (0% Low, 1-49% Medium, >=50% High)
  UI->>UI: Отрисовка подсказки с причинами (tooltip)
  UI->>UI: Отображение колонки CI и алерта checkLowCitationGrowth
```

## 6. Поток инвалидации кэша

После завершения `runCollectCycle` worker берёт `WEB_INTERNAL_URL` и `COLLECT_API_TOKEN` из окружения и отправляет `POST /api/internal/invalidate-cache` с Bearer-токеном. Маршрут веб-процесса очищает `metricsCache` и `bestTimeCache`. Ошибка этого HTTP-вызова логируется в worker и не отменяет завершённый цикл сбора.

## 7. Архитектура антифрода и оценка риска накрутки (Risk of Artificial Traffic)

Антифрод-система TgMon спроектирована по двухуровневой гибридной схеме:

### 7.1 Фоновый уровень детекции (Worker Heuristics & Persistence)
В фоновом цикле `src/worker/collector.ts` после материализации дневных метрик (`materializeDailyMetrics`) автоматически запускаются 4 независимые эвристические проверки:

1. **Гладкость роста аудитории (`checkGrowthSmoothness`)**:
   - Анализирует ежедневные дельты подписчиков за последние $\ge 14$ дней.
   - Вычисляет коэффициент вариации $CV = \sigma / \mu$.
   - Если $CV < 0.1$ (колебания прироста менее 10%), фиксируется неестественно прямолинейный рост (характерно для бот-ферм с фиксированной суточной нормой).
2. **Нескоррелированные скачки подписчиков (`checkUncorrelatedSpikes`)**:
   - Динамический порог всплеска: $\text{threshold} = \max(3\overline{\Delta}, 50, 0.005 \times N_{followers})$.
   - Проверяет окно $[T-1, T]$ вокруг даты скачка: если в этот период не было ни публикаций новых постов, ни входящих упоминаний/репостов из других каналов, скачок помечается как аномальный.
3. **Соотношение просмотров к подписчикам (`checkViewsToSubsRatio`)**:
   - Анализирует последние посты (требуется $\ge 5$ постов с просмотрами).
   - Вычисляет отношение $\text{ratio} = \overline{\text{views}} / \text{members}$.
   - Флаг срабатывает при $\text{ratio} < 0.05$ (менее 5% просмотров — подозрение на "мертвых" ботов) или при $\text{ratio} > 1.5$ (более 150% просмотров — подозрение на накрутку просмотров).
4. **Шаблонность вовлеченности / Равномерность ERR (`checkUniformReactionRatio`)**:
   - Анализирует последние 15–20 постов (требуется $\ge 10$ постов).
   - Для каждого поста вычисляет $ERR = \frac{\text{reactions} + \text{comments} + \text{forwards}}{\text{views}} \times 100$.
   - Рассчитывает коэффициент вариации $CV_{ERR} = \sigma_{ERR} / \mu_{ERR}$.
   - Флаг срабатывает при $CV_{ERR} < 0.1$, выявляя роботизированные накрутки реакций со стабильным соотношением.

**Изоляция ошибок:** Весь блок проверок в worker обернут в `try { ... } catch (fraudErr)` с логированием через `logger.error('Fraud detection failed', ...)`. Сбой антифрода ни при каких обстоятельствах не нарушает основной цикл сбора данных Telegram.

**Персистентность (`fraud_signals`):** При срабатывании любой эвристики вызывается функция `saveFraudSignal(channelId, signalType, value, reason)` (`src/worker/persister.ts`), создающая запись в PostgreSQL таблице `fraud_signals` через модель `FraudSignal`:
```prisma
model FraudSignal {
  id         Int      @id @default(autoincrement())
  channelId  Int      @map("channel_id")
  signalType String   @map("signal_type")
  value      Float
  reason     String
  detectedAt DateTime @default(now()) @map("detected_at")
  channel    Channel  @relation(fields: [channelId], references: [id], onDelete: Cascade)

  @@index([channelId, detectedAt])
  @@map("fraud_signals")
}
```

### 7.2 Слой Web API, Индекс цитирования и On-Demand аудит
На уровне веб-сервера (`src/lib/metrics/queries.ts`) при формировании дашборда (`getChannelsOverview`) и детальной карточки (`getChannelDetailStats`) выполняется синтез метрик в реальном времени:

1. **Индекс цитирования (`src/lib/citationIndex.ts`)**:
   - Рассчитывается логарифмический индекс по формуле:
     $$\text{CitationIndex} = \sum_{m \in \text{mentions}} \left( \text{count}_m \times \log_{10}(\text{citing\_subscribers}_m) \right)$$
   - Учитываются только входящие упоминания за последние 30 дней.
   - Исключаются самоцитирования (`sourceChannelId !== targetChannelId`).
   - Для каналов с числом подписчиков $\le 1$ вес приравнивается к 0.
   - Пакетная выборка для таблиц выполняется функцией `getCitationIndicesForChannels(channels, dateLimit)`.
2. **Проверка низкого цитирования (`checkLowCitationGrowth`)**:
   - Если канал вырос более чем на 5% за 30 дней, но его индекс цитирования $\le 1$, канал помечается подозрением на накрутку мотивированным трафиком без органического присутствия в инфополе Telegram.
3. **Консолидированный скоринг (`runFraudAudit`)**:
   - Объединяет 4 базовых эвристических сигнала (`views_to_subs_ratio`, `growth_smoothness`, `uncorrelated_spikes`, `uniform_err`).
   - Функция поддерживает гибридный режим: проверяет как сохраненные в БД записи `fraud_signals` за 30 дней, так и динамически вычисляет флаги по переданным массивам постов и метрик (критично для только что добавленных каналов).
   - Вычисляет единый показатель `fraudScore` от 0 до 100:
     $$\text{fraudScore} = \text{triggeredCount} \times 25$$
     Возможные значения: $0, 25, 50, 75, 100$.

### 7.3 Представление в UI: RiskBadge и индикаторы цитирования
Результаты антифрод-аудита выводятся пользователю через компонент `RiskBadge` (`src/components/RiskBadge.tsx`), а также специальные ячейки таблиц и карточек:

- **Бейдж риска (`RiskBadge` / `FraudScoreBadge`)**:
  - Текст: `Risk of Artificial Traffic: {safeScore}%`.
  - 3 градации серьезности (severity tiers):
    - **Низкий риск (Low Risk, score = 0)**: стиль `bg-emerald-500/15 text-emerald-400 border-emerald-500/30`, иконка `<ShieldCheck className="w-3.5 h-3.5" />`, всплывающая подсказка `Risk of Artificial Traffic: 0% (Низкий риск накрутки)`.
    - **Средний риск (Medium Risk, 1 <= score < 50)**: стиль `bg-amber-500/15 text-amber-400 border-amber-500/30`, иконка `<AlertTriangle className="w-3.5 h-3.5" />`, всплывающая подсказка со списком сработавших факторов накрутки.
    - **Высокий риск (High Risk, score >= 50)**: стиль `bg-rose-500/15 text-rose-400 border-rose-500/30`, иконка `<AlertTriangle className="w-3.5 h-3.5" />`, всплывающая подсказка со списком всех обнаруженных аномалий.
  - Размещение:
    - `MyChannelCard.tsx`: в строке статусов карточки «Мой канал».
    - `ChannelHeader.tsx`: в верхней панели детальной страницы канала.
    - `ChannelsMobileList.tsx`: в заголовке мобильной карточки каждого канала.
- **Отображение индекса цитирования**:
  - `ChannelsDesktopTable.tsx`: сортируемая колонка `CI`. При срабатывании `checkLowCitationGrowth` значение выводится розовым цветом с иконкой `<AlertTriangle />` и тултипом с описанием аномалии.
  - `MyChannelCard.tsx`: отдельная плашка «Индекс цит. (30д)» с иконкой `<Share2 />`, цветовой индикацией и предупреждением при низком цитировании.
