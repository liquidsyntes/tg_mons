# Архитектура проекта TgMon (C4 Model)

Этот документ описывает высокоуровневую архитектуру проекта TgMon, включая основные компоненты, их взаимодействие и внешние зависимости. Архитектура описана с использованием диаграмм C4 (Context, Container, Component).

## 1. System Context Diagram

Диаграмма контекста показывает систему TgMon в целом и ее взаимодействие с внешними системами и пользователями.

```mermaid
C4Context
  title System Context diagram for TgMon

  Person(user, "Пользователь", "Владелец Telegram-канала или маркетолог, анализирующий каналы.")
  
  System(tgmon, "TgMon", "Система мониторинга и аналитики Telegram-каналов.")
  
  System_Ext(telegram, "Telegram (MTProto)", "Платформа Telegram, откуда собираются сырые данные (подписчики, посты, просмотры, реакции).")
  System_Ext(openrouter, "OpenRouter (LLM)", "Внешний API (Gemini/OpenAI/Claude) для генерации AI-сводок и аналитики.")

  Rel(user, tgmon, "Просматривает дашборды, аналитику и AI-отчеты", "HTTPS")
  Rel(tgmon, telegram, "Собирает данные через клиентский протокол MTProto", "TCP")
  Rel(tgmon, openrouter, "Запрашивает генерацию аналитики по промптам", "HTTPS/REST")
```

## 2. Container Diagram

Диаграмма контейнеров раскрывает внутреннюю структуру системы TgMon на уровне развертываемых единиц (контейнеров).

```mermaid
C4Container
  title Container diagram for TgMon

  Person(user, "Пользователь", "Анализирует дашборд")

  System_Boundary(tgmon_boundary, "TgMon System") {
    Container(web, "Web App & API", "Next.js (App Router)", "Отображает UI, предоставляет API для фронтенда, рассчитывает метрики 'на лету', вызывает AI.")
    Container(worker, "MTProto Worker", "Node.js (tsx) + GramJS", "Фоновый процесс (cron), который постоянно собирает новые данные из Telegram.")
    ContainerDb(db, "Database", "PostgreSQL", "Хранит историю каналов, снапшоты аудитории, посты и рассчитанные метрики.")
  }

  System_Ext(telegram, "Telegram (MTProto)", "Telegram API")
  System_Ext(openrouter, "OpenRouter (LLM)", "AI API")

  Rel(user, web, "Использует", "HTTPS")
  Rel(web, db, "Читает/Пишет (Prisma ORM)", "TCP/5432")
  Rel(web, openrouter, "Генерация отчетов", "HTTPS")
  
  Rel(worker, telegram, "Сбор данных", "MTProto (TCP)")
  Rel(worker, db, "Сохраняет сырые данные", "TCP/5432")
  Rel(worker, web, "Сбрасывает кэш после цикла", "HTTP POST /api/internal/invalidate-cache, Bearer")
```

## 3. Component Diagram (Web App & API)

Эта диаграмма детализирует внутреннюю структуру Next.js приложения.

```mermaid
C4Component
  title Component diagram for Web App & API

  Container_Boundary(web_boundary, "Web App & API (Next.js)") {
    Component(ui, "React Components", "React (Client & Server Components)", "Рендер страниц, таблиц, графиков (Recharts), дашбордов.")
    
    Component(api_stats, "Stats Route Handlers", "Next.js Route Handlers", "Отдают JSON с метриками (/api/stats/overview, /api/channels).")
    Component(api_ai, "AI Route Handlers", "Next.js Route Handlers", "Пайплайны сбора данных для промпта и обращения к LLM.")
    Component(api_cache, "Internal Cache Invalidation", "/api/internal/invalidate-cache", "Проверяет Bearer-токен и очищает кэши метрик и Best Time.")
    
    Component(lib_metrics, "Metrics Engine", "src/lib/metrics/*", "Бизнес-логика: ER, ERR, CR, VR, дельты и агрегация исходных или дневных данных.")
    Component(lib_cache, "In-memory Cache", "src/lib/cache.ts", "Хранит metricsCache и bestTimeCache.")
    Component(lib_ep, "EP Calculator", "src/lib/ep.ts", "Вычисление Effective Point (EP), CEI, Z-score нормализация.")
    Component(lib_prisma, "Prisma Client", "src/lib/prisma.ts", "Доступ к базе данных.")
  }

  ContainerDb(db, "PostgreSQL", "Database")
  System_Ext(openrouter, "OpenRouter API")

  Rel(ui, api_stats, "Запрашивает данные", "JSON/REST")
  Rel(ui, api_ai, "Запрашивает генерацию", "JSON/REST")
  
  Rel(api_stats, lib_metrics, "Делегирует расчет")
  Rel(api_stats, lib_ep, "Запрашивает рейтинги")
  Rel(api_ai, lib_metrics, "Собирает данные для промпта")
  Rel(api_ai, openrouter, "Отправляет промпт")
  Rel(api_cache, lib_cache, "Очищает metricsCache и bestTimeCache")

  Rel(lib_metrics, lib_prisma, "SQL запросы")
  Rel(lib_ep, lib_prisma, "SQL запросы")
  Rel(lib_prisma, db, "Чтение/Запись")
```

## 4. Component Diagram (Worker)

Детализация фонового сборщика.

```mermaid
C4Component
  title Component diagram for MTProto Worker

  Container_Boundary(worker_boundary, "MTProto Worker (Node.js)") {
    Component(cron, "Cron Scheduler", "node-cron (src/worker/index.ts)", "Запуск цикла сбора по расписанию.")
    Component(collector, "Collector Loop", "src/worker/collector.ts", "Итерация по каналам, сбор постов и снапшотов подписчиков.")
    Component(demographics, "Demographics Job", "src/worker/demographics.ts", "Еженедельный сбор статистики (stats.getBroadcastStats).")
    Component(client, "Telegram Client", "GramJS", "Низкоуровневая обертка для MTProto сессии.")
  }

  ContainerDb(db, "PostgreSQL", "Database")
  Container(web, "Web App & API", "Next.js", "Принимает внутренний запрос на инвалидацию кэша.")
  System_Ext(telegram, "Telegram API")

  Rel(cron, collector, "Триггер сбора (часто)")
  Rel(cron, demographics, "Триггер демографии (раз в неделю)")
  Rel(collector, client, "Вызов API (getMessages, getFullChannel)")
  Rel(demographics, client, "Вызов API (stats.getBroadcastStats)")
  Rel(client, telegram, "Сетевые запросы")
  Rel(collector, db, "Запись снапшотов и постов (Upsert)")
  Rel(collector, web, "POST /api/internal/invalidate-cache", "Bearer COLLECT_API_TOKEN")
  Rel(demographics, db, "Запись языковой разбивки")
```

## Поток инвалидации кэша

После завершения `runCollectCycle` worker берёт `WEB_INTERNAL_URL` и `COLLECT_API_TOKEN` из окружения и отправляет `POST /api/internal/invalidate-cache` с Bearer-токеном. Маршрут веб-процесса очищает `metricsCache` и `bestTimeCache`. Ошибка этого HTTP-вызова логируется в worker и не отменяет завершённый цикл сбора.
