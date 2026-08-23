# Отчёт по проекту TgMon

## Executive Summary

TG Monitor — fullstack-приложение для конкурентной разведки Telegram-каналов. Состоит из Next.js 15 веб-дашборда, фонового MTProto-воркера (GramJS) и AI-аналитика контента через OpenRouter. Проект в активной разработке: 8.5K строк кода, 53 файла, богатый UI, 6 типов AI-отчётов. Зрелость — продвинутый MVP с признаками production-readiness, но с техническим долгом и security-проблемами, которые нужно решать до продакшена.

---

## 1. Краткое описание

- **Что:** Дашборд для мониторинга Telegram-каналов: динамика подписчиков, частота постов, ERR, тепловые карты публикаций, AI-анализ контента
- **Зачем:** Конкурентная разведка и контент-стратегия — сравнение «своего» канала с пулом конкурентов, поиск лучшего времени для постинга, AI-саммари и action plans
- **Зрелость:** Продвинутый MVP. Core-функции работают, UI полированный, но есть долг, расхождения в конфигах и секреты в `.env`

`Подтверждено:` README описывает production-ready, но `.env` с дефолтным `supersecrettoken` и SQLite вместо PostgreSQL из docker-compose говорят об обратном

---

## 2. Тип проекта

- **Категория:** Fullstack веб-приложение + фоновый воркер-сборщик
- **Части системы:**
  1. **Web (Next.js)** — дашборд, API routes, серверный рендеринг AI-отчётов
  2. **Worker** — cron-воркер на node-cron, собирает метрики через MTProto (GramJS)
  3. **AI layer** — 6 endpoint'ов, проксируют запросы к OpenRouter (DeepSeek), хранят отчёты в БД
  4. **Alerting** — Telegram Bot API для уведомлений об аномалиях роста/оттока
- **Пользователи:** SMM-специалисты, владельцы Telegram-каналов, контент-мейкеры

---

## 3. Обнаруженный стек

### Языки
- TypeScript (100% кода)
- CSS (Tailwind)
- Prisma DSL (schema)

### Frameworks и Libraries
| Назначение | Технология | Версия |
|---|---|---|
| Fullstack framework | Next.js | ^15.2.1 |
| UI library | React | ^19.0.0 |
| Styling | Tailwind CSS | ^3.4.17 |
| Charts | Recharts | ^2.15.1 |
| Icons | lucide-react | ^1.16.0 |
| ORM | Prisma | ^6.4.1 |
| MTProto client | telegram (GramJS) | ^2.26.22 |
| Cron | node-cron | ^3.0.3 |
| TS runner | tsx | ^4.19.3 |
| Markdown | react-markdown + remark-gfm | ^10.1.0 / ^4.0.1 |
| PDF export | html2canvas-pro + jspdf | ^2.3.9 / ^4.2.1 |
| Utils | date-fns, clsx, tailwind-merge | — |

### Build tools
- `next build` (production)
- `npm ci` (Docker)
- `tsx` (worker runtime)
- `prisma generate` (DB client)

### Infrastructure / DevOps
- Docker Compose: 3 сервиса (db, web, worker)
- PostgreSQL 16-alpine (compose)
- SQLite (фактически в .env — `file:./dev.db`)
- Node 22-alpine (Docker)
- Git: solo-dev workflow, feature-branch модель

### AI / External integrations
- **OpenRouter API** — LLM-провайдер, модель `deepseek/deepseek-v4-pro` во всех 6 AI routes
  `Подтверждено:` каждый AI route вызывает `https://openrouter.ai/api/v1/chat/completions` с `response_format: { type: 'json_object' }`
- **Telegram MTProto** — GramJS, user-клиент (не Bot API), сбор подписчиков и постов
- **Telegram Bot API** — отправка алертов об аномалиях (`sendTelegramAlert` в collector.ts)
- **Векторных БД, embeddings, MCP — не найдено**

---

## 4. Структура проекта

### Ключевые папки
```
TgMon/
├── prisma/              # Schema, seed, dev.db (SQLite)
│   ├── schema.prisma    # 4 модели: Channel, Snapshot, Post, AiReport
│   ├── seed.ts          # Фейковые данные (4 канала, 30 дней)
│   └── dev.db          # 2.5 MB SQLite — не в .gitignore (но gitignore покрывает *.sqlite)
├── src/
│   ├── app/            # Next.js App Router
│   │   ├── page.tsx           # Главный дашборд
│   │   ├── channel/[id]/      # Детальная страница канала (61K — крупнейший файл)
│   │   ├── compare/           # Сравнение двух каналов
│   │   ├── reports/           # Архив AI-отчётов (SSR)
│   │   └── api/               # 16 API routes
│   │       ├── channels/      # CRUD каналов
│   │       ├── stats/         # Метрики, overview, compare, best-time
│   │       ├── ai/            # 6 AI endpoints
│   │       ├── collect/       # Ручной запуск сбора
│   │       └── reports/       # Экспорт отчётов в HTML
│   ├── components/     # 19 React-компонентов
│   ├── lib/            # metrics.ts, prisma.ts, types.ts, utils.ts, adDetector.ts
│   └── worker/         # MTProto коллектор
│       ├── index.ts        # Cron-планировщик
│       ├── collector.ts    # Сбор метрик, постов, алерты
│       ├── client.ts       # GramJS singleton
│       └── auth.ts         # Интерактивная авторизация → .env
├── docs/               # Документация, архивы, промпты
├── docker-compose.yml  # web + worker + db
├── Dockerfile.web      # Next.js production build
├── Dockerfile.worker   # tsx worker
└── .env               # Реальные секреты (в gitignore)
```

### Точки входа
- **Web:** `src/app/page.tsx` → `src/app/layout.tsx`
- **Worker:** `src/worker/index.ts` → `src/worker/collector.ts`
- **Auth:** `src/worker/auth.ts` (CLI, интерактивный)
- **API:** 16 route handlers под `src/app/api/`

### Подпроекты
Монолит. Один package.json, одна кодовая база. Web и worker разделяются только по точке входа, но делят общий код (`lib/`, `worker/collector.ts` импортируется в API routes).

---

## 5. Архитектура

### Основные модули и data flow

```
Telegram MTProto
    │
    ▼
[Worker: collector.ts] ─── cron (1ч) ──→ собирает подписчиков + посты
    │                                      │
    │                                      ▼
    │                              [Prisma / SQLite]
    │                                      │
    │                                      ├──→ [API routes] ──→ [Next.js UI]
    │                                      │                        │
    │                                      │                        ▼
    │                                      │              AI routes → OpenRouter
    │                                      │                        │
    │                                      │                        ▼
    │                                      │              AiReport → DB → /reports
    │                                      │
    │                                      └──→ [Alert: Bot API] (аномалии)
    │
    └──→ [POST /api/collect/run] (ручной запуск)
```

### Поток данных
1. **Сбор:** Worker через GramJS получает `participantsCount` и историю постов → сохраняет в `Snapshot` и `Post`
2. **Метрики:** `metrics.ts` считает дельты (24h/7d/30d), ERR, sparkline, heatmap — всё на стороне API route при запросе
3. **AI:** API route достаёт посты из БД → формирует prompt → OpenRouter → JSON → сохраняет в `AiReport` → рендерит React-компонент
4. **Алертинг:** При изменении подписчиков >1% или >500 за цикл → Bot API → личное сообщение

### Наблюдаемые паттерны
- **Feature-based** структура в `components/` (каждый компонент — отдельный файл)
- **API routes** — thin controllers, бизнес-логика в `lib/metrics.ts`
- **Singleton** для Prisma client (`globalThis` guard)
- **Singleton** для Telegram client (`clientInstance` в `client.ts`)
- **JSON-first AI:** все промпты требуют строгий JSON-ответ, UI мапит JSON в Tailwind-блоки (без markdown)

### Сильные стороны
- Чистое разделение web/worker с общим кодом
- Rate limiting с retry/FLOOD_WAIT-обработкой в `withRateLimitAndRetry`
- Изоляция ошибок: сбой одного канала не рвёт цикл сбора
- Транзакционное назначение «My Channel» (atomic `isMine` swap)
- AI-промпты с «Анти-Сикофансией» — честный анализ, не лесть
- Кастомные Tailwind-тема, тёмный UI, tabular-nums — внимание к деталям

### Слабые стороны
- `channel/[id]/page.tsx` — 61K (мегакомпонент, всё в одном файле: графики, AI, посты, heatmap, экспорт)
- `ChannelsTable.tsx` — 29K (слишком много логики в одном компоненте)
- `metrics.ts` — 17K, N+1 запросы: `getOverviewStats` вызывает `calculateChannelMetrics` для каждого канала в цикле
- AI-промпты захардкожены в route handlers (дублирование, сложно менять)
- Нет кэширования метрик — каждый запрос к `/api/stats/overview` пересчитывает всё

---

## 6. Запуск и разработка

### Install
```bash
npm install
```
`Подтверждено:` `package-lock.json` присутствует (212K), node_modules установлен

### Dev run
```bash
npm run dev:all    # concurrently: next dev + worker
# или раздельно:
npm run dev        # Next.js на :3000
npm run worker     # воркер-сборщик
```

### Build
```bash
npm run build      # prisma generate && next build
npm start          # next start (production)
```

### Auth (первичная)
```bash
npm run auth       # интерактивная авторизация в Telegram → TG_SESSION в .env
```

### Prisma
```bash
npm run prisma:generate   # генерация клиента
npm run prisma:push       # применение schema без миграций
npm run prisma:migrate    # deploy миграций (для продакшена)
npm run seed              # заполнение фейковыми данными
```

### Docker
```bash
docker compose up --build -d    # web + worker + db
```

### Env variables (обязательные)
| Переменная | Назначение | Обязательность |
|---|---|---|
| `DATABASE_URL` | Строка подключения к БД | Да |
| `TG_API_ID` | MTProto API ID (my.telegram.org) | Да |
| `TG_API_HASH` | MTProto API hash | Да |
| `TG_SESSION` | String session (от `npm run auth`) | Да |
| `TG_PHONE` | Номер телефона сборщика | Для auth |
| `COLLECT_CRON` | Расписание сбора | Нет (дефолт `0 * * * *`) |
| `COLLECT_ON_STARTUP` | Сбор при старте воркера | Нет |
| `COLLECT_API_TOKEN` | Bearer для ручного запуска | Нет (дефолт `supersecrettoken`) |
| `OPENROUTER_API_KEY` | Ключ OpenRouter | Для AI |
| `TELEGRAM_BOT_TOKEN` | Токен бота для алертов | Для алертов |
| `TELEGRAM_CHAT_ID` | Chat ID для алертов | Для алертов |
| `MY_CHANNEL_USERNAME` | Начальный «свой» канал | Нет |
| `NEXT_PUBLIC_COLLECT_API_TOKEN` | Токен для клиентских запросов | В .env есть, но не в .env.example |

### Lint / Test
```bash
npm run lint    # next lint (ESLint)
```
`Не найдено:` тестов нет. Ни одного `.test.ts`, `.spec.ts`, тестового фреймворка в зависимостях. `coverage/` нет.

---

## 7. Наблюдения и проблемы

### Несоответствия

1. **README vs реальность — БД:**
   README и docker-compose описывают PostgreSQL 16, но `schema.prisma` использует `provider = "sqlite"`, а `.env` — `DATABASE_URL="file:./dev.db"`.
   `Подтверждено:` prisma/schema.prisma:2 — `provider = "sqlite"`

2. **README vs реальность — модель AI:**
   docs/archives/report.md упоминает `google/gemini-2.5-flash`, session_summary.md — переход на `deepseek/deepseek-v4-pro`. Реальные route files подтверждают `deepseek/deepseek-v4-pro`.
   `Подтверждено:` все 6 AI routes используют `deepseek/deepseek-v4-pro`

3. **docker-compose vs .env:**
   Compose передаёт `DATABASE_URL: postgresql://...@db:5432/...`, но Prisma schema ждёт SQLite. При запуске через Docker Prisma упадёт.
   `Предположение:` Docker-конфиг не тестировался после перехода на SQLite

4. **NEXT_PUBLIC_COLLECT_API_TOKEN:**
   В `.env` есть `NEXT_PUBLIC_COLLECT_API_TOKEN` (публичный токен на клиенте), но `.env.example` его не описывает, а API route `/api/collect/run` проверяет `COLLECT_API_TOKEN` (серверный).
   `Подтверждено:` collect/run/route.ts читает `process.env.COLLECT_API_TOKEN`, а не `NEXT_PUBLIC_*`

5. **scratch2.html** — пустой файл (0 байт) в корне проекта. Мусор.

### Security risks

1. **КРИТИЧНО — Секреты в `.env` в открытом виде:**
   - `TG_API_ID=35013203` (реальный)
   - `TG_API_HASH=8c4cdecd94f0f53868be065e14c4d4ad` (реальный)
   - `TG_SESSION=1AgAOMTQ5...` (полная StringSession — даёт доступ к аккаунту Telegram)
   - `TELEGRAM_BOT_TOKEN=8695235613:***` (частично замаскирован, но в файле полный)
   - `OPENROUTER_API_KEY=sk-or-...f225`
   - `COLLECT_API_TOKEN="supersecrettoken"` (дефолтное значение)

   `.env` в `.gitignore` — хорошо. Но `docs/archives/keys.md` содержит **публичные ключи Telegram MTProto серверов** и лежит в репозитории.

2. **COLLECT_API_TOKEN = `supersecrettoken`:**
   Дефолтное значение, которое будет работать, если не задать своё. Кто угодно может дёрнуть `POST /api/collect/run` с этим токеном.

3. **NEXT_PUBLIC_COLLECT_API_TOKEN** инжектируется в клиентский бандл — виден в браузере.

4. **Нет rate limiting на AI endpoints:**
   Каждый AI route делает запрос к OpenRouter без ограничений. Злоумышленник может прокачать баланс API.

5. **Нет auth на CRUD каналов:**
   Любой может добавить/удалить/изменить каналы через `/api/channels` без авторизации.

### Technical debt

1. **N+1 запросы в `getOverviewStats`:**
   `calculateChannelMetrics` вызывается в цикле для каждого канала. Каждый вызов — 8-10 запросов к БД. Для 20 каналов = ~200 запросов на один `GET /api/stats/overview`.

2. **AI-промпты захардкожены:**
   ~3000-5000 символов промпта в каждом route handler. Дублирование логики (fetch OpenRouter, parse JSON, save to DB) — 6 копий.

3. **Мегакомпоненты:**
   - `channel/[id]/page.tsx` — 61K (1818 строк)
   - `ChannelsTable.tsx` — 29K
   - `metrics.ts` — 17K

4. **Кодировка файлов AI routes — mojibake:**
   Файлы AI routes начинаются с BOM и содержат mojibake (UTF-8 интерпретированный как Windows-1251): `РЅРµ Р·Р°РґР°РЅ` вместо `не задан`. Промпты на русском сломаны — AI получает мусор вместо кириллицы.
   `Подтверждено:` проверены сырые байты в `src/app/api/ai/summary/route.ts` — символы `Р` `С` повторяются вместо нормальных русских букв

5. **Нет миграций Prisma:**
   Только `prisma db push` (schema-first, без версионирования). Для production нужен `prisma migrate`.

6. **Нет тестов:**
   Ни unit, ни integration, ни e2e. 8.5K строк без единого теста.

7. **`dev.db` (2.5MB) в репозитории:**
   `.gitignore` покрывает `dev.db`, но файл физически присутствует. Проверить, не закоммичен ли он.

8. **Git working tree грязный:**
   13 файлов modified, 4 deleted, 5 untracked. Включая изменения во всех 6 AI routes — вероятно, фиксы кодировки, не закоммичены.

### Maintainability risks

1. **Бизнес-логика смешана с UI:**
   В `channel/[id]/page.tsx` — и fetch-логика, и AI-вызовы, и markdown-конвертация, и рендеринг.

2. **Типы `any` в AI-ответах:**
   `setAiSummary(any)`, `parsedData: any` — нет типизации AI-ответов на клиенте.

3. **`isFavorite` cast:**
   `(channel as any).isFavorite || false` — поле есть в schema, но TypeScript его не видит без regenerate.

---

## 8. Рекомендации

### В первую очередь (критично)

1. **Удалить секреты из `.env` в репозитории.** Проверить `git log -p -- .env` — если хоть раз был закоммичен, ротировать ВСЕ ключи (TG_API_HASH, TG_SESSION, BOT_TOKEN, OPENROUTER_API_KEY).
2. **Починить кодировку AI route файлов.** Сейчас промпты на русском — mojibake. Пересохранить в UTF-8 без BOM. Это блокирует корректную работу AI.
3. **Сменить `COLLECT_API_TOKEN`** с `supersecrettoken` на случайную строку. Убрать `NEXT_PUBLIC_COLLECT_API_TOKEN` из клиентского бандла.

### Задокументировать

4. Привести README в соответствие с реальностью: указать SQLite как текущую БД, отметить PostgreSQL как опцию для Docker.
5. Описать AI-модели: какая модель, какой промпт, какой JSON-формат — в одном месте, не в коде.
6. Добавить `.env.example` для `NEXT_PUBLIC_COLLECT_API_TOKEN` или убрать переменную.

### Проверить вручную

7. Запустить `docker compose up` — убедиться, что Prisma подключается к PostgreSQL (или исправить compose на SQLite/ volume mount).
8. Проверить `git log -p -- prisma/dev.db` — не закоммичен ли бинарник БД.
9. Проверить `docs/archives/keys.md` — нужны ли публичные ключи MTProto в репозитории (вероятно, нет).

### Упростить / переработать

10. **Вынести AI-логику в `lib/ai.ts`:** одна функция `callOpenRouter(prompt, schema)` вместо 6 копий fetch-логики.
11. **Разбить `channel/[id]/page.tsx`** на 5-7 подкомпонентов: SubscriberChart, PostsChart, HeatmapSection, AIReportsSection, RecentPosts.
12. **Оптимизировать `getOverviewStats`:** batch-запросы или materialized view вместо N+1.
13. **Добавить кэширование метрик:** Redis или in-memory cache с TTL 5 мин.
14. **Добавить тесты:** хотя бы smoke-тесты на API routes и unit на `metrics.ts` / `adDetector.ts`.

---

## 9. С чего начать новому разработчику

### Первые файлы для чтения (в порядке)
1. `README.md` — обзор, но с оговоркой про расхождения с кодом
2. `prisma/schema.prisma` — 4 модели, всё понятно за 2 минуты
3. `src/lib/types.ts` — типы данных, которые ходят по системе
4. `src/worker/collector.ts` — ядро сбора, понять data flow
5. `src/lib/metrics.ts` — как считаются дельты, ERR, heatmap
6. `src/app/page.tsx` — главный дашборд, точки интеграции
7. `src/app/api/ai/summary/route.ts` — пример AI-интеграции (но сломана кодировка!)

### Как поднять проект
```bash
npm install
cp .env.example .env    # заполнить TG_API_ID, TG_API_HASH
npm run auth            # получить TG_SESSION
npm run prisma:generate
npm run prisma:push
npm run dev:all         # web + worker
```

### Какие части изучить сначала
- Worker (`src/worker/`) — вся логика сбора
- `metrics.ts` — расчёт метрик (самая важная бизнес-логика)
- AI routes (`src/app/api/ai/`) — паттерн JSON-first AI

### Риски держать в голове
- `.env` содержит живые секреты — не коммитить
- Prisma + SQLite: при изменении схемы `db push` может потребовать рестарта `next dev` (EPERM на Windows)
- AI-промпты сейчас сломаны (mojibake) — перед использованием AI-функций нужно починить кодировку
- Нет auth на API — не выкладывать в публичный доступ
- Нет тестов — любые изменения проверять вручную

---

## 10. Краткий итог

- **Fullstack Telegram-аналитика** на Next.js 15 + GramJS + Prisma/SQLite + OpenRouter (DeepSeek). 8.5K строк, 53 файла, 6 типов AI-отчётов, alerting через Bot API.
- **MVP с богатым UI**, но не production-ready: секреты в `.env`, дефолтный токен, нет auth на API, нет тестов.
- **КРИТИЧНО: кодировка AI route файлов сломана** (mojibake UTF-8 → Windows-1251) — промпты на русском не работают.
- **README расходится с кодом:** PostgreSQL в докер-компосе, но реально SQLite. Gemini в старом отчёте, но реально DeepSeek.
- **N+1 запросы** в `getOverviewStats` — каждый запрос дашборда = ~200 запросов к БД для 20 каналов.
- **Мегакомпоненты:** `channel/[id]/page.tsx` (61K) и `ChannelsTable.tsx` (29K) — нужно разбивать.
- **Нет миграций Prisma**, нет кэширования, нет rate limiting на AI endpoints.
- **Git working tree грязный:** 13 modified + 5 untracked, включая все AI routes (вероятно, фиксы кодировки не закоммичены).
- **Архитектура здравая:** разделение web/worker, изоляция ошибок, JSON-first AI, транзакционные операции. Фундамент хороший, нужен рефакторинг и security-прохождение.

---

## Reusable Checklist для аудита подобных проектов

- [ ] Сравнить `provider` в `schema.prisma` с `DATABASE_URL` в `.env` и `docker-compose.yml`
- [ ] Проверить кодировку файлов с кириллицей (BOM + mojibake)
- [ ] Найти дефолтные секреты в `.env.example` и `.env`
- [ ] Проверить auth на всех CRUD endpoints
- [ ] Поискать `NEXT_PUBLIC_*` переменные, утекающие в бандл
- [ ] Проверить N+1 в циклах с Prisma `findMany` + последующими запросами
- [ ] Сравнить модель AI в документации с реальным `model:` в fetch body
- [ ] Проверить `.gitignore` на покрываемость `dev.db`, `.env`, `node_modules`
- [ ] Запустить `git log -p -- .env` на случай закоммиченных секретов
- [ ] Проверить наличие тестов и coverage
