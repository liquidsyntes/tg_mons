# TG Monitor (TgMon) — аналитика и мониторинг Telegram-каналов

Fullstack-платформа для непрерывного мониторинга Telegram-каналов: сбор метрик через MTProto, сравнение с «Моим каналом», скоринг вовлечённости (EP, Content Score), AI-отчёты через OpenRouter и сканер мероприятий.

**Стек:** Next.js 15 (App Router) · React 19 · TypeScript · Prisma 6 + **PostgreSQL 15** · GramJS (MTProto) · node-cron · Tailwind CSS · Recharts · Vitest · Docker Compose · GitHub Actions

---

## Возможности

### Сбор данных (Worker)
- **MTProto User-Client (GramJS):** подписчики, просмотры, реакции, комментарии, репосты — без ограничений Bot API.
- Публичные каналы, супергруппы и закрытые каналы (при условии, что аккаунт сборщика состоит в чате).
- Первичный бэкфельд истории на 30 дней при добавлении канала, далее инкрементальный сбор (`min_id = lastMessageId`) с дедупликацией.
- Cron-расписание (`COLLECT_CRON`, по умолчанию раз в час), ручной запуск через `POST /api/collect/run`.
- Отказоустойчивость: rate limit ~1 rps, обработка `FLOOD_WAIT` с экспоненциальной задержкой, reconnect по таймауту, изоляция ошибок по каналам (`consecutiveErrors`), журнал циклов (`SyncJob`).
- Алерты об аномалиях подписчиков в Telegram (Bot API).

### Аналитика
- **Сравнение с «Моим каналом»:** рост подписчиков (24ч / 7д / 30д), активность постов, позиция в пуле конкурентов.
- **EP-скоринг** (`src/lib/ep.ts`): engagement-показатель канала с z-нормализацией по нише. Компоненты: CEI, VR, ERR; веса — рост 0.45 / views-ratio 0.30 / ERR 0.25. Формулы всех метрик — в `docs/analytics-formulas.md`.
- **Content Score** (`src/lib/scoring.ts`) и оценка рекламных постов (`src/lib/adDetector.ts`).
- Детальная страница канала: Wrapped-карточка, heatmap активности, Content LTV, сеть цитирований, динамика подписчиков с оверлеем «Моего канала».
- Подбор лучшего времени публикации (`/api/stats/best-time`), тренды ниши, топ gainers/losers.

### AI-отчёты (OpenRouter)
7 типов отчётов, общий клиент `src/lib/openrouter.ts` (модель по умолчанию `z-ai/glm-5.3-flash`, JSON response format, таймаут 60с):

| Тип | Эндпоинт | Назначение |
| :--- | :--- | :--- |
| Summary | `POST /api/ai/summary` | сводный отчёт по каналу |
| Compare | `POST /api/ai/compare` | сравнение каналов |
| Trends | `POST /api/ai/trends` | тренды ниши |
| Audience | `POST /api/ai/audience` | анализ аудитории |
| Action Plan | `POST /api/ai/action-plan` | план действий |
| Persona | `POST /api/ai/persona` | контент-персона канала |
| Compare-reports | `POST /api/ai/compare-reports` | эволюция отчётов |

История отчётов хранится в БД (`ai_reports`), просмотр — `/reports`, экспорт в PDF (`jsPDF` + `html2canvas-pro`).

### Event Scanner
`POST /api/events/scan` — LLM-парсинг анонсов мероприятий из постов за 14 дней: keyword-фильтр кандидатов + извлечение структурированных событий (дата, время, организатор, цены) в таблицу `events`. Просмотр — страница `/events`.

---

## Быстрый старт

### 1. Ключи Telegram MTProto
Получите `api_id` и `api_hash` на [my.telegram.org](https://my.telegram.org) → «API development tools».

### 2. Настройка окружения
```bash
cp .env.example .env
# Заполните: DATABASE_URL (PostgreSQL), TG_API_ID, TG_API_HASH, TG_PHONE
```

База данных — **PostgreSQL**. Локально: любая БД 14+, в Docker — `docker compose up -d postgres`.

### 3. Авторизация Telegram (одноразово)
```bash
npm run auth
```
Интерактивный вход (телефон → код → 2FA), строка сессии сохраняется в `.env` как `TG_SESSION`.

### 4. Установка и запуск
```bash
npm install
npm run prisma:generate
npm run prisma:push        # или npm run prisma:migrate для миграций
npm run seed               # тестовые данные (опционально)

npm run dev:all            # web (:3000) + worker одновременно
# или по отдельности:
npm run dev                # только web
npm run worker             # только воркер-коллектор
```

### Docker Compose (web + worker + PostgreSQL)
```bash
docker compose up --build -d
```
Поднимает `postgres:15`, `web` (порт 3000) и `worker`. Пароль БД по умолчанию `password` — для VPS смените в `docker-compose.yml`.

VPS-развёртывание (Nginx + PM2 + скрипт обновления) — отдельная инструкция: `docs/deployment.md`.

---

## API

24 route handler'а (все мутирующие — за Bearer-токеном `COLLECT_API_TOKEN`):

| Группа | Эндпоинты |
| :--- | :--- |
| Channels | `GET/POST /api/channels`, `GET/PATCH/DELETE /api/channels/:id` (`?permanent=true` — физическое удаление), `POST /api/channels/:id/favorite`, `GET /api/channels/:id/ltv`, `GET /api/channels/:id/network` |
| Stats | `GET /api/stats/overview`, `/api/stats/dashboard`, `/api/stats/channel/:id?period=24h\|7d\|30d`, `/api/stats/compare`, `/api/stats/trends`, `/api/stats/best-time` |
| AI | 7 эндпоинтов из таблицы выше |
| Events | `GET/POST /api/events`, `POST /api/events/scan` |
| Прочее | `POST /api/collect/run` (ручной цикл сбора), `GET /api/health`, `POST /api/posts/search` (полнотекстовый, trgm), `GET /api/reports/:id/export` |

**Авторизация:** браузерные мутации авторизуются автоматически — `src/middleware.ts` инжектит Bearer-токен серверно, токен не попадает в клиентский бандл. Внешние вызовы передают заголовок `Authorization: Bearer <COLLECT_API_TOKEN>` сами.

---

## Разработка

```bash
npm test              # vitest, 54 теста (collector, reconnect, timeout, ep, adDetector, utils, health)
npm run test:coverage # покрытие v8
npx tsc --noEmit      # typecheck
npx eslint src        # линт
npm run build         # prisma generate && next build
```

CI (`.github/workflows/ci.yml`): на каждый push/PR — typecheck, eslint, тесты, build.

---

## Переменные окружения

| Переменная | Обязательна | Назначение |
| :--- | :--- | :--- |
| `DATABASE_URL` | да | PostgreSQL connection string |
| `TG_API_ID` / `TG_API_HASH` | да | MTProto-ключи приложения |
| `TG_PHONE` | да | телефон аккаунта сборщика |
| `TG_SESSION` | да (после `npm run auth`) | строка MTProto-сессии |
| `COLLECT_CRON` | нет | расписание сбора (`0 * * * *`) |
| `COLLECT_ON_STARTUP` | нет | сбор при старте воркера (`true`) |
| `COLLECT_API_TOKEN` | да | Bearer-токен мутаций API. **Не используйте дефолт в production** |
| `OPENROUTER_API_KEY` | для AI-отчётов | ключ OpenRouter |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | нет | алерты об аномалиях |
| `TELEGRAM_REQUEST_TIMEOUT_MS` | нет | таймаут MTProto (30000) |
| `MY_CHANNEL_USERNAME` | нет | начальный «Мой канал» |

Полный список с описаниями — `.env.example`.

---

## Документация

- `docs/analytics-formulas.md` — все метрики и формулы (VR, ERR, CEI, EP, Content Score)
- `docs/overview.md` — обзор продукта
- `docs/metrics-logic-audit.md` — аудит расчётной логики
- `docs/tg-monitoring-observability-audit.md` — аудит наблюдаемости бэкенда
- `docs/telegram-timeout-review.md` — ревью реализации таймаутов GramJS
- `docs/deployment.md` — развёртывание на VPS
- `docs/git-workflow.md` — git-процесс
- `docs/report_dev_2026-08-30.md` — технический аудит проекта (2026-08-30)
- `docs/fix_prompts_2026-08-30.md` — план устранения найденных проблем
- `docs/archives/` — архивные документы (ТЗ, старые статусы)

---

## Допущения (Assumptions)

1. **Мягкое удаление:** `DELETE /api/channels/:id` переводит канал в `isActive = false`, данные сохраняются. Физическое удаление — `?permanent=true`.
2. **Дельты при нехватке снапшотов:** если снапшота на границе окна нет, возвращается `null` (в UI — «н/д»), а не искусственный ноль.
3. **«Мой канал» ровно один:** назначение нового атомарно снимает флаг с предыдущего.
4. **Закрытые каналы:** сбор возможен, если аккаунт сборщика уже состоит в чате.
5. **Дискретность метрик:** точность динамики подписчиков определяется частотой `COLLECT_CRON`.
