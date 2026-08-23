# Пошаговый план устранения проблем TgMon

**Проект:** TgMon — Telegram-канал аналитика (Next.js 15 + GramJS + Prisma/SQLite + OpenRouter)
**Отчет:** `docs/report_dev_2026-08-23.md`
**Назначение:** каждый блок ниже — готовый промпт для копирования в AI-ассистента (Cursor, Claude, DeepSeek, etc.). Промпты идут в порядке приоритета: от критичных к рефакторингу.

---

## Шаг 1. Починить кодировку AI route файлов (КРИТИЧНО)

**Проблема:** 6 файлов в `src/app/api/ai/` содержат double-encoded mojibake (UTF-8 → Windows-1251 → UTF-8 + BOM). Промпты на русском — мусор, AI получает «РЅРµ Р·Р°РґР°РЅ» вместо «не задан».

**Промпт:**

---

У меня в проекте 6 TypeScript файлов с двойной кодировкой (double-encoding). Оригинальный UTF-8 был открыт как Windows-1251 и сохранён обратно в UTF-8 с BOM. Из-за этого русский текст превратился в mojibake: «не задан» → «РЅРµ Р·Р°РґР°РЅ».

Файлы (все в `src/app/api/ai/`):
- `src/app/api/ai/summary/route.ts`
- `src/app/api/ai/compare/route.ts`
- `src/app/api/ai/trends/route.ts`
- `src/app/api/ai/audience/route.ts`
- `src/app/api/ai/action-plan/route.ts`
- `src/app/api/ai/compare-reports/route.ts`

Алгоритм восстановления для каждого файла:
1. Прочитать файл как UTF-8 (получится mojibake-строка)
2. Encode этой строки как Windows-1251 → оригинальные UTF-8 байты
3. Decode как UTF-8 → правильный русский текст
4. Записать файл в UTF-8 **без BOM** и с LF line endings (не CRLF)

Проверь все 6 файлов. Для каждого:
- Прочитай сырые байты
- Если начинается с BOM (EF BB BF) — удали BOM
- Если содержит mojibake-паттерн (символы вроде «РЅРµ», «РґР°РЅ», «РўС‹») — примени восстановление
- Если файл уже корректный UTF-8 — пропусти

После исправления проверь, что промпты в каждом файле содержат читаемый русский текст. Например, в `summary/route.ts` должно быть «OPENROUTER_API_KEY не задан в .env файле», а не «OPENROUTER_API_KEY РЅРµ Р·Р°РґР°РЅ».

Покажи diff для каждого файла: первые 3 строки до и после.

---

## Шаг 2. Ротация секретов и токенов (КРИТИЧНО)

**Проблема:** `.env` содержит реальные TG_API_HASH, TG_SESSION, BOT_TOKEN, OPENROUTER_API_KEY. Дефолтный `COLLECT_API_TOKEN="supersecrettoken"`. `NEXT_PUBLIC_COLLECT_API_TOKEN` утекает в клиентский бандл. Нужно проверить git history.

**Промпт:**

---

Проверь безопасность `.env` в проекте TgMon. Сделай следующее:

1. **Git history check:** выполни `git log -p -- .env` и `git log --all --full-history -- .env`. Если `.env` хоть раз был закоммичен — выведи список коммитов и предупреждение «НЕОБХОДИМА РОТАЦИЯ ВСЕХ КЛЮЧЕЙ».

2. **Проверь `docs/archives/keys.md`** — содержит ли он что-то секретное. Если там только публичные ключи Telegram MTProto серверов — это не секрет, но файл стоит удалить из репозитория, так как он не нужен в production.

3. **Сгенерируй новый `COLLECT_API_TOKEN`** — случайная строка 32 символа (hex). Замени дефолтный `supersecrettoken` в `.env`. Убери `NEXT_PUBLIC_COLLECT_API_TOKEN` из `.env` полностью — этот токен не нужен на клиенте, API route `/api/collect/run` проверяет серверный `COLLECT_API_TOKEN`.

4. **Обнови `.env.example`:** добавь комментарий-предупреждение «НЕ используй supersecrettoken в production! Сгенерируй случайную строку». Удали `NEXT_PUBLIC_COLLECT_API_TOKEN` из примера.

5. **Проверь `scratch2.html`** — если пустой, удали файл.

---

## Шаг 3. Привести README в соответствие с реальностью

**Проблема:** README описывает PostgreSQL 16, но `schema.prisma` использует SQLite, а `.env` — `file:./dev.db`. Docker-compose передаёт PostgreSQL URL, но Prisma ждёт SQLite — при `docker compose up` упадёт. docs/archives/report.md упоминает Gemini, а реально DeepSeek.

**Промпт:**

---

В проекте TgMon есть несоответствия между документацией и реальным кодом. Исправь:

1. **Prisma provider vs docker-compose:**
   - `prisma/schema.prisma` использует `provider = "sqlite"` и `DATABASE_URL="file:./dev.db"` в `.env`
   - `docker-compose.yml` передаёт `DATABASE_URL: postgresql://postgres:password@db:5432/tg_monitor`
   - Это несовместимо. Выбери один из вариантов:
     - **Вариант A (быстро):** изменить `docker-compose.yml` — убрать сервис `db` (PostgreSQL), смонтировать volume для SQLite файла. Worker и web получают `DATABASE_URL="file:./data/dev.db"`.
     - **Вариант B (production):** изменить `schema.prisma` на `provider = "postgresql"` и обновить `.env` на PostgreSQL URL.
   - Реализуй Вариант A (минимальные изменения, текущий стек — SQLite).

2. **Обнови `README.md`:**
   - В таблице «Технологический стек» замени «PostgreSQL 16 + Prisma ORM» на «SQLite + Prisma ORM (PostgreSQL опционально через Docker)»
   - В разделе «Быстрый старт» укажи, что `DATABASE_URL="file:./dev.db"` — дефолт для локальной разработки
   - Добавь примечание: «Для Docker: docker-compose.yml настроен на SQLite с volume mount. Для PostgreSQL — измените provider в schema.prisma и DATABASE_URL в .env»

3. **Обнови `docs/archives/report.md`:** замени упоминание «google/gemini-2.5-flash» на «deepseek/deepseek-v4-pro» (через OpenRouter).

4. **Обнови `.env.example`:** приведи в соответствие с реальным `.env` (добавь `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `OPENROUTER_API_KEY`, убери `NEXT_PUBLIC_COLLECT_API_TOKEN`).

---

## Шаг 4. Добавить auth на API endpoints

**Проблема:** Любой может добавлять/удалять/изменять каналы через `/api/channels` без авторизации. AI endpoints без rate limiting — можно прокачать баланс OpenRouter.

**Промпт:**

---

Добавь простую Bearer-token авторизацию на mutating API endpoints в проекте TgMon.

1. **Создай `src/lib/auth.ts`** с функцией `verifyBearerToken(req: NextRequest): boolean`:
   - Читает `authorization` header
   - Сравнивает Bearer token с `process.env.COLLECT_API_TOKEN`
   - Возвращает true если токен валиден, false если нет

2. **Защити эти endpoints (требуют Bearer токен):**
   - `POST /api/channels` (добавление канала)
   - `PATCH /api/channels/[id]` (обновление)
   - `DELETE /api/channels/[id]` (удаление)
   - `PUT /api/channels/[id]/favorite` (избранное)
   - `POST /api/ai/*` (все 6 AI endpoints)
   - `POST /api/collect/run` (уже защищён — проверь, что не сломал)

3. **GET endpoints оставить открытыми** (чтение метрик, статистики, отчётов).

4. **Ответ при отсутствии/неверном токене:** 401 JSON `{ "error": "Unauthorized: требуется Bearer токен" }`.

5. **Клиентский код:** если на клиенте используется `COLLECT_API_TOKEN` для запросов — вынеси его в серверный cookie или middleware. Не оставляй токен в `NEXT_PUBLIC_*` переменных.

6. Добавь `COLLECT_API_TOKEN` в `.env.example` с комментарием «Сгенерируйте случайную строку, НЕ используйте supersecrettoken».

---

## Шаг 5. Оптимизация N+1 запросов в getOverviewStats

**Проблема:** `getOverviewStats` в `src/lib/metrics.ts` вызывает `calculateChannelMetrics` в цикле для каждого канала. Каждый вызов — 8-10 запросов к БД. Для 20 каналов = ~200 запросов на один `GET /api/stats/overview`.

**Промпт:**

---

Оптимизируй `getOverviewStats()` в `src/lib/metrics.ts`. Сейчас она делает N+1 запросов: для каждого канала вызывает `calculateChannelMetrics()`, который делает 8-10 запросов к БД (latestSnapshot, snapshot24h, snapshot7d, snapshot30d, posts24h, posts7d, posts30d, sparkline, postsWithViews).

Рефакторинг:

1. **Batch-запросы:** вместо цикла по каналам, сделай:
   - Один `prisma.channel.findMany()` (уже есть)
   - Один `prisma.snapshot.findMany()` для всех каналов сразу, с `orderBy: { collectedAt: 'desc' }` и группировкой по `channelId` в памяти
   - Один `prisma.post.findMany()` для всех каналов сразу, с фильтром по `publishedAt >= date30dAgo`
   - Один `prisma.post.count()` с `groupBy` для 24h/7d/30d интервалов (или загрузи все посты за 30д и считай в памяти)

2. **Перепиши `calculateChannelMetrics`** так, чтобы она принимала pre-loaded данные (массив снапшотов и постов для канала), а не делала запросы сама. Создай `calculateChannelMetricsFromData(channel, snapshots, posts, now)`.

3. **В `getOverviewStats`** загрузи все данные одним батчем, потом вызывай `calculateChannelMetricsFromData` в цикле — без обращений к БД.

4. **Цель:** сократить количество запросов с ~200 до 3-5 на 20 каналов.

5. **Не меняй возвращаемый тип** — `OverviewStats` должен остаться таким же. Измени только внутреннюю реализацию.

6. **Проверь корректность дельт:** убедись, что логика `calculateDelta` (fallback на earliest snapshot после dateLimit) сохранена.

---

## Шаг 6. Разбить мегакомпонент channel/[id]/page.tsx

**Проблема:** `src/app/channel/[id]/page.tsx` — 61K, 1818 строк. Графики, AI, посты, heatmap, экспорт — всё в одном файле. `ChannelsTable.tsx` — 29K.

**Промпт:**

---

Разбей мегакомпонент `src/app/channel/[id]/page.tsx` (61K, ~1818 строк) на подкомпоненты. Сейчас там смешаны: fetch-логика, 3 AI-вызова (summary, compare, audience), markdown-конвертация, Recharts графики, heatmap, список постов с фильтром рекламы, PDF-экспорт.

План разбиения:

1. **`src/components/channel/ChannelHeader.tsx`** — заголовок канала, badges (Crown, DeltaBadge, StatusBadge), кнопки экспорта, переключатель периода (24h/7d/30d).

2. **`src/components/channel/SubscriberChart.tsx`** — LineChart подписчиков с оверлеем «Моего канала», переключатель absolute/growth, forecast.

3. **`src/components/channel/PostsActivity.tsx`** — BarChart публикационной активности.

4. **`src/components/channel/ChannelHeatmap.tsx`** — тепловая карта 7×24 + heatmap «Моего канала» (использует существующий `HeatmapChart.tsx`).

5. **`src/components/channel/RecentPosts.tsx`** — список последних постов с фильтром (all/ads/partners), детальный просмотр поста в модалке, детектор рекламы (`adDetector.ts`).

6. **`src/components/channel/AIReportsSection.tsx`** — блок с 3 кнопками (Summary, Compare, Audience) + состояния loading/error/ready. Рендерит `AISummaryReport`, `AICompareReport`, `AIAudienceReport`.

7. **`src/components/channel/ChannelDetailClient.tsx`** — оркестратор: fetch данных, управление состоянием, layout. Импортирует все подкомпоненты. Должен быть <200 строк.

8. **`src/app/channel/[id]/page.tsx`** — server component, только `<ChannelDetailClient channelId={id} />` (или сохраняет `use(params)` и передаёт id).

Правила:
- Каждый подкомпонент получает данные через props, не делает fetch сам (кроме AIReportsSection, который вызывает AI endpoints)
- Types импортируются из `@/lib/types`
- Тёмная тема Tailwind сохраняется
- Функциональность НЕ меняется — только структура

---

## Шаг 7. Вынести AI-логику в общий модуль

**Проблема:** 6 AI route файлов дублируют fetch-логику OpenRouter (headers, AbortController, JSON parse, save to DB). ~80 строк boilerplate в каждом.

**Промпт:**

---

В проекте TgMon 6 API route файлов в `src/app/api/ai/` дублируют логику вызова OpenRouter API. Создай общий модуль:

1. **`src/lib/openrouter.ts`** с функцией:
```typescript
export async function callOpenRouter(
  prompt: string,
  options?: {
    systemPrompt?: string;
    model?: string;        // дефолт: 'deepseek/deepseek-v4-pro'
    temperature?: number; // дефолт: 0.7
    timeoutMs?: number;   // дефолт: 60000
  }
): Promise<string>
```
- Читает `OPENROUTER_API_KEY` из env
- Если ключ отсутствует — throw Error с понятным сообщением на русском
- Выполняет fetch к `https://openrouter.ai/api/v1/chat/completions`
- Использует AbortController с timeout
- Возвращает `choices[0].message.content` (string)
- При не-OK ответе — throw Error с статусом и телом

2. **`src/lib/ai-reports.ts`** с функцией:
```typescript
export async function saveAiReport(
  channelId: number | null,
  type: 'summary' | 'compare' | 'trend' | 'audience' | 'evolution' | 'action_plan',
  content: string
): Promise<number>
```
- Сохраняет отчёт в `prisma.aiReport.create`
- Возвращает ID созданного отчёта

3. **Перепиши все 6 AI route файлов** так, чтобы они:
   - Формировали prompt (уникальный для каждого)
   - Вызывали `callOpenRouter(prompt, { responseFormat: 'json' })`
   - Парсили JSON
   - Вызывали `saveAiReport()`
   - Возвращали NextResponse
   - Каждая route должна быть <50 строк бизнес-логики

4. **Убедись, что `response_format: { type: 'json_object' }`** передаётся во всех вызовах.

---

## Шаг 8. Добавить кэширование метрик

**Проблема:** Каждый запрос к `/api/stats/overview` пересчитывает все метрики. Нет кэширования.

**Промпт:**

---

Добавь in-memory кэширование для метрик в проекте TgMon. Сейчас `GET /api/stats/overview` каждый раз пересчитывает все метрики для всех каналов.

1. **Создай `src/lib/cache.ts`** с простым TTL-кэшем:
```typescript
export class TTLCache<T> {
  private cache: Map<string, { value: T; expiresAt: number }> = new Map();
  private ttlMs: number;

  constructor(ttlMs: number = 300000) { // 5 минут по дефолту
    this.ttlMs = ttlMs;
  }

  get(key: string): T | null
  set(key: string, value: T): void
  invalidate(key?: string): void  // без key — очистить всё
  has(key: string): boolean
}
```

2. **Инвалидируй кэш при:**
   - `POST /api/collect/run` (после сбора данных)
   - `POST /api/channels` (добавление канала)
   - `PATCH /api/channels/[id]` (обновление)
   - `DELETE /api/channels/[id]` (удаление)

3. **Кэшируй:**
   - `GET /api/stats/overview` → ключ `overview`, TTL 5 мин
   - `GET /api/stats/channel/[id]?period=X` → ключ `channel:{id}:{period}`, TTL 5 мин
   - `GET /api/stats/best-time` → ключ `best-time`, TTL 30 мин (тяжёлый расчёт)

4. **Export singleton** из `cache.ts`:
```typescript
export const metricsCache = new TTLCache(300000);
```

5. **Не кэшируй** AI endpoints и `/api/collect/run`.

---

## Шаг 9. Привести в порядок git working tree

**Проблема:** 13 modified + 5 untracked. Включая изменения во всех 6 AI routes (вероятно, фиксы кодировки из Шага 1) не закоммичены.

**Промпт:**

---

Подготовь git working tree к чистому коммиту. Выполни:

1. `git status --short` — выведи текущий статус
2. Проверь `git diff --stat` — что именно изменено
3. Сгруппируй изменения по логическим коммитам:
   - **Коммит 1:** `fix: починить кодировку AI route файлов` — все 6 файлов `src/app/api/ai/*/route.ts` (если Шаг 1 уже выполнен)
   - **Коммит 2:** `chore: удалить мусорные файлы` — `scratch2.html`, `docs/archives/keys.md` (если не нужен)
   - **Коммит 3:** `docs: обновить отчёты и документацию` — `docs/` изменения, `docs/git-workflow.md`, `docs/session_summary.md`, `docs/senior.md`, `docs/report_dev_*.md`
   - **Коммит 4:** `refactor: компоненты и метрики` — если Шаги 5-6 выполнены
4. Не коммичи `.env` — он в `.gitignore`
5. Проверь `git log -p -- .env` — если хоть раз закоммичен, предупреди
6. Выполни коммиты в указанном порядке с понятными сообщениями

---

## Шаг 10. Добавить smoke-тесты

**Проблема:** 8.5K строк кода, ни одного теста. Нет тестового фреймворка.

**Промпт:**

---

Добавь базовые тесты в проект TgMon. Сейчас тестов нет вообще.

1. **Установи зависимости:**
```bash
npm install -D vitest @vitest/coverage-v8
```

2. **Создай `vitest.config.ts`:**
```typescript
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, './src') }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'html'] }
  }
});
```

3. **Добавь в `package.json`:**
```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

4. **Напиши тесты для:**
   - `src/lib/__tests__/utils.test.ts` — `formatNumber`, `formatPercent`, `formatDelta`, `serializeBigInt`, `formatRelativeTime`
   - `src/lib/__tests__/adDetector.test.ts` — `detectAd`: проверить на рекламном посте, партнёрском, обычном, пустом
   - `src/lib/__tests__/collector.test.ts` — `parseChannelIdentifier`: @username, ссылка t.me/username, инвайт t.me/+hash, инвайт t.me/joinchat/hash, numeric ID
   - `src/worker/__tests__/collector.test.ts` — `withRateLimitAndRetry`: mock FLOOD_WAIT, проверить retry, проверить max retries exceeded

5. **Покрытие:** 3-5 тестов на каждый файл. Не aim для 100% coverage — aim для critical paths.

6. **Запусти:** `npm test` — все тесты должны проходить.

---

## Шаг 11. Очистка и финальная проверка

**Промпт:**

---

Финальная проверка проекта TgMon после всех исправлений. Выполни:

1. **Кодировка:** открой каждый из 6 AI route файлов и проверь, что русский текст читается нормально (нет mojibake, нет BOM).

2. **Security:**
   - `grep -r "supersecrettoken" .env .env.example` — не должно быть совпадений
   - `grep -r "NEXT_PUBLIC_COLLECT_API_TOKEN" .env` — не должно быть
   - `git log --all --full-history -- .env` — не должно быть коммитов с .env

3. **Чистота:**
   - `scratch2.html` удалён
   - `docs/archives/keys.md` удалён или перемещён
   - `git status --short` — clean (или только осмысленные untracked файлы)

4. **Тесты:** `npm test` — все проходят

5. **Lint:** `npm run lint` — без ошибок

6. **Build:** `npm run build` — проходит без ошибок

7. **Docker:** `docker compose up --build -d` — все 3 сервиса (web, worker, db) запускаются без падения. Проверь логи каждого.

8. **API smoke test:**
   - `curl localhost:3000/api/stats/overview` — возвращает JSON
   - `curl -X POST localhost:3000/api/collect/run` — 401 без токена
   - `curl -X POST -H "Authorization: Bearer <token>" localhost:3000/api/collect/run` — 200

Выведи чек-лист с результатами каждой проверки (PASS/FAIL).
