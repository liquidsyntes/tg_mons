# Отчет по проекту: TG Monitor

**Дата аудита:** 2026-08-30
**Аудитор:** Hermes Agent (senior technical audit по заданию `docs/senior.md`)
**Путь:** `/mnt/c/TgMon/`

---

## Executive Summary

TG Monitor — полнофункциональный fullstack-мониторинг Telegram-каналов на Next.js 15 + Prisma + GramJS, в активной разработке и в рабочем состоянии: typecheck ✅, ESLint ✅, 54/54 теста ✅, production build ✅ (все проверено реальными запусками). Главные проблемы: README расходится с реальностью (SQLite vs PostgreSQL), 77 файлов в git помечены изменёнными только из-за CRLF (нет `.gitattributes`), корень замусорен 11 одноразовыми fix-скриптами, тестовый раннер падает из-за битого npm-линка rolldown (лечится, но новых разработчиков собьёт с толку), и Post.prompts/collector.ts содержит mojibake. Проект можно передавать, но перед этим нужен «косметический» коммит порядка.

---

## 1. Краткое описание

- **Что это:** веб-приложение + фоновый воркер для мониторинга Telegram-каналов: сбор подписчиков и постов через MTProto (GramJS), сравнение с «Моим каналом», AI-отчёты через OpenRouter, сканер мероприятий. `Подтверждено:` `README.md`, `src/worker/collector.ts`, `src/lib/openrouter.ts`.
- **Для чего:** отслеживание конкурентов канала — рост подписчиков, активность постов, упоминания/форварды, EP-скоринг (engagement score с z-нормализацией), AI-аналитика. `Подтверждено:` `src/lib/ep.ts` (веса `w_growth: 0.45, w_vr: 0.30, w_err: 0.25`), `src/lib/metrics.ts`.
- **Зрелость:** active development / production-like. Работающий build и тесты, свежие коммиты (Event Scanner — последний), но с признаками спринтерской разработки: scratch-скрипты в корне, архивные доки. `Подтверждено:` `git log`, список файлов корня.

## 2. Тип проекта

- **Категория:** fullstack web-app (Next.js App Router) + отдельный long-running воркер (node-cron) + AI-интеграции. `Подтверждено:` `package.json` (`dev`, `worker`, `auth` скрипты), `docker-compose.yml` (сервисы `postgres`, `web`, `worker`).
- **Части системы:**
  1. **Web (Next.js 15):** дашборд `/`, сравнение `/compare`, события `/events`, отчёты `/reports`, детальная страница канала `/channel/[id]`. `Подтверждено:` вывод `npm run build` (31 маршрут).
  2. **API (26 route handlers):** `channels`, `stats`, `ai` (7 типов отчётов), `events`, `posts/search`, `collect/run`, `health`, `reports/export`. `Подтверждено:` `find src/app/api -name route.ts`.
  3. **Worker:** MTProto-коллектор с cron, rate limiting ~1 rps, FLOOD_WAIT retry, reconnect по таймауту, алерты об аномалиях в Telegram. `Подтверждено:` `src/worker/collector.ts` (`withRateLimitAndRetry`, `TelegramTimeoutError`, `sendTelegramAlert`).
  4. **БД:** PostgreSQL 15 + Prisma 6 (Channel, Post, Snapshot, PostSnapshot, Mention, AiReport, SyncJob, Event, EventMention). `Подтверждено:` `prisma/schema.prisma`.
- **Пользователи:** один оператор (владелец «Моего канала»), следящий за пулом конкурентных Telegram-каналов. `Предположение:` из концепции `isMine`/конкурентов и single-user настройки через `.env`.

## 3. Обнаруженный стек

| Технология | Версия | Где подтверждено |
| :--- | :--- | :--- |
| TypeScript | ^5.8.2 (strict) | `package.json`, `tsconfig.json` |
| Next.js (App Router) | ^15.2.1 | `package.json`, `next.config.js` |
| React | ^19.0.0 | `package.json` |
| Tailwind CSS | ^3.4.17 | `tailwind.config.js`, `postcss.config.js` |
| Recharts | ^2.15.1 | `package.json`, графики в `src/components/channel/` |
| Prisma ORM | ^6.4.1 | `prisma/schema.prisma` |
| PostgreSQL | 15 (docker image) | `docker-compose.yml` |
| GramJS (telegram) | ^2.26.22 | `package.json`, `src/worker/client.ts` |
| node-cron | ^3.0.3 | `package.json`, `src/worker/index.ts` |
| Vitest + coverage-v8 | ^4.1.11 | `vitest.config.ts`, `package.json` |
| ESLint (eslint-config-next) | ^16.3.2 | `eslint.config.mjs`, CI |
| tsx | ^4.19.3 | worker/auth скрипты |
| Docker / docker compose | — | `Dockerfile.web`, `Dockerfile.worker`, 2 compose-файла |
| GitHub Actions CI | — | `.github/workflows/ci.yml` |
| OpenRouter API (LLM) | модель `z-ai/glm-5.3-flash` | `src/lib/openrouter.ts` |
| jsPDF + html2canvas-pro | ^4.2.1 / ^2.3.9 | `ExportPdfButton`, `WrappedCard` (экспорт отчётов) |
| react-markdown + remark-gfm | — | рендер AI-отчётов |

**AI/LLM-интеграции (отдельно):**
- ✅ **OpenRouter** — работает, общий клиент `src/lib/openrouter.ts` (все 7 AI-роутов), `response_format: json_object`, таймаут 60с. Модель по умолчанию `z-ai/glm-5.3-flash`.
- ✅ **Telegram Bot API** — только для alert-уведомлений об аномалиях подписчиков (`sendTelegramAlert` в collector).
- ✅ **MTProto User-Client (GramJS)** — сбор метрик; сессия генерируется интерактивно через `npm run auth`.
- ✅ **Event Scanner** — LLM-парсинг анонсов мероприятий из постов за 14 дней (`src/app/api/events/scan/route.ts`), keyword-фильтр в JS + LLM-извлечение структурированных событий.

## 4. Структура проекта

```
TgMon/
├── prisma/                  # schema.prisma (9 моделей), 6 миграций, seed.ts
├── src/
│   ├── app/                 # страницы: /, /compare, /events, /reports, /channel/[id]
│   │   └── api/             # 26 route handlers (channels, stats, ai, events, posts...)
│   ├── components/          # ~35 React-компонентов (дашборд, таблицы, графики, AI-отчёты)
│   │   └── channel/         # детальная страница канала (Wrapped, heatmap, LTV, сеть цитирований)
│   ├── lib/                 # бизнес-логика: metrics.ts (30KB!), ep.ts (EP-скоринг),
│   │                        #   scoring.ts, adDetector.ts, openrouter.ts, ai-reports.ts,
│   │                        #   auth.ts (Bearer), cache.ts, middleware-хелперы
│   ├── middleware.ts        # инжект Bearer-токена в мутации из браузера
│   └── worker/              # collector.ts (20KB), client.ts, auth.ts (интерактивный вход), index.ts (cron)
├── docs/                    # 15 файлов: roadmap, аудит-метрик, fix_prompts, senior.md (задание)
├── *.js / *.py (корень)     # 11 одноразовых fix/экспорт скриптов — мусор ⚠
├── replace_*.ps1            # 4 PowerShell-скрипта массовых замен — мусор ⚠
├── docker-compose.yml       # prod: postgres + web + worker
├── docker-compose.dev.yml   # dev-вариант
├── .github/workflows/ci.yml # lint + typecheck + tests + build
└── skill.md / GEMINI.md     # AI-агентские инструкции (не код)
```

**Точки входа:**
- Web: `next dev` / `next start` → `src/app/layout.tsx`, `src/app/page.tsx`
- Worker: `npm run worker` → `src/worker/index.ts` (node-cron) → `collector.ts#runCollectCycle`
- Auth: `npm run auth` → `src/worker/auth.ts` (интерактивная MTProto-авторизация, пишет TG_SESSION в .env)

## 5. Архитектура

```
┌─────────────┐   HTTP (Bearer via middleware)   ┌──────────────────┐
│  Browser    │ ───────────────────────────────► │ Next.js App      │
│  (React 19) │ ◄─────────── JSON ────────────── │ 26 API routes    │
└─────────────┘                                  └───────┬──────────┘
                                                         │ Prisma
                    ┌────────────────────────┐           ▼
                    │ Worker (node-cron)     │      ┌─────────┐
                    │  collector.ts          │ ───► │ Postgres│
                    │  GramJS MTProto ~1rps  │      └─────────┘
                    │  FLOOD_WAIT / retry    │
                    └──────────┬─────────────┘
                               │ Bot API (алерты)
                               ▼
                    Telegram chat + OpenRouter (AI-отчёты из API-роутов)
```

**Data flow (основной цикл):**
1. Cron (`COLLECT_CRON`, раз в час) → `runCollectCycle()` (`src/worker/collector.ts`).
2. Для каждого активного канала: resolve entity → snapshot подписчиков → инкрементальный сбор постов (`min_id = lastMessageId`) → записи в `Snapshot`, `Post`, `PostSnapshot`, `Mention` + `SyncJob` со статусом цикла.
3. UI читает метрики через `GET /api/channels` → `getOverviewStats()` (`src/lib/metrics.ts`, кэш в `src/lib/cache.ts`).
4. AI-отчёты: клиент → `POST /api/ai/<type>` → `callOpenRouter()` → `saveAiReport()` → `ai_reports` таблица → рендер react-markdown.

**Паттерны:**
- Layered внутри монолита: UI / API routes / lib (логика) / worker (сбор). Feature-подход в `components/channel/`.
- Разделение web и worker как отдельных процессов с общей БД и общей lib — правильная двухпроцессная схема.
- Кэш в памяти процесса (`metricsCache`) — работает только для single-instance web.
- Bearer-защита мутаций: `src/middleware.ts` инжектит токен серверно, клиент его не видит; внешние вызовы передают токен сами (`src/lib/auth.ts#verifyBearerToken`).

**Сильные стороны:**
- Отказоустойчивый коллектор: rate limit, FLOOD_WAIT с экспоненциальной задержкой, reconnect по таймауту, изоляция ошибок по каналам, `consecutiveErrors` в схеме. `Подтверждено:` `collector.ts`, миграция `add_consecutive_errors`.
- Наблюдаемость: модель `SyncJob` со счётчиками и `errorSummary`, `GET /api/health`, логи цикла.
- CI полный: typecheck + eslint + vitest + build, гоняется на каждый push. `Подтверждено:` `ci.yml`.
- Реальные тесты на критичную логику: collector (5), reconnect, timeout, ep, adDetector, utils, health-route — 54 теста.
- Нормализованная схема с индексами (включая GIN trgm для поиска по тексту постов).

**Слабые стороны:**
- `src/lib/metrics.ts` — 30,7 KB монолит; `ChannelsTable.tsx` — 35,3 KB, `compare/page.tsx` — 24,7 KB. Рефакторить тяжело.
- Кэш метрик в памяти невалидируется при изменениях воркером (worker и web — разные процессы) — данные на дашборде устаревают до cron-тика. `Предположение:` по коду `cache.ts` + отсутствии IPC между процессами.
- README обещает API-эндпоинты, которых нет: `/api/stats/channel/:id` существует, но `GET /api/channels/:id` описан как «метрики канала» — реальный файл по этому пути отдаёт иное; полный список эндпоинтов шире README (26 роутов vs 8 в README). `Подтверждено:` `find src/app/api`.
- Один Bearer-токен на все мутации без пользователей/ролей — приемлемо для single-user, но не для команды.

## 6. Запуск и разработка

| Действие | Команда | Статус |
| :--- | :--- | :--- |
| Install | `npm install` | ✅ |
| Prisma client | `npm run prisma:generate` | ✅ |
| Схема в БД | `npm run prisma:push` (dev) / `npm run prisma:migrate` (deploy) | ✅ |
| Dev (web + worker) | `npm run dev:all` (concurrently) или `npm run dev` + `npm run worker` | ✅ |
| Auth Telegram | `npm run auth` (интерактивно, пишет TG_SESSION в .env) | — |
| Build | `npm run build` (= `prisma generate && next build`) | ✅ exit 0, ~200с, 31 маршрут |
| Test | `npm test` (vitest) | ✅ 8 файлов, 54/54 (после фикса rolldown, см. §7) |
| Coverage | `npm run test:coverage` | ✅ настроен (v8, text+html) |
| Lint | `npx eslint src` (не `npm run lint` — тот зовёт deprecated `next lint`) | ✅ 0 ошибок |
| Typecheck | `npx tsc --noEmit` | ✅ |
| Seed | `npm run seed` | ✅ (`prisma/seed.ts`) |
| Docker | `docker compose up --build -d` (postgres+web+worker) | есть, не запускался в аудите |
| CI | GitHub Actions: lint+typecheck+test → build | `ci.yml` |

**Env variables** (`.env.example`): `DATABASE_URL` (Postgres), `TG_API_ID`, `TG_API_HASH`, `TG_PHONE`, `TG_SESSION` (обязательны для воркера), `COLLECT_CRON`, `COLLECT_ON_STARTUP`, `COLLECT_API_TOKEN` (Bearer для мутаций), `MY_CHANNEL_USERNAME`, `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` (алерты), `OPENROUTER_API_KEY` (AI), `TELEGRAM_REQUEST_TIMEOUT_MS`.

**README vs реальность — ключевые расхождения:**
- README: «SQLite + Prisma (PostgreSQL опционально)». Факт: `schema.prisma` — `provider = "postgresql"`, `docker-compose.yml` — postgres, в `prisma/dev.db` лежит 5,9 МБ SQLite-файл (унаследованный артефакт), а `.env.example` уже указывает Postgres. README устарел.
- README описывает 8 API-эндпоинтов; фактически их 26 (ai/, events/, ltv/, network/, best-time, compare, trends, posts/search, reports/export).
- README молчит про Event Scanner, EP-скоринг, AI-отчёты — а это половина продукта.

## 7. Наблюдения и проблемы

**Несоответствия:**
1. **README ≠ код по БД.** README и `.env.example`-комментарии говорят SQLite; `schema.prisma`, миграции (`init_postgres`), compose — PostgreSQL. Новый разработчик по README поднимет нерабочую конфигурацию. `Подтверждено:` `prisma/schema.prisma:2`, `prisma/migrations/20260824083414_init_postgres/`.
2. **`prisma/dev.db` (5,9 МБ) в репо-папке при Postgres-схеме.** `.gitignore` покрывает `dev.db`, в git-истории его нет — файл локальный, но сбивает с толку.

**Подозрительные места / техдолг:**
3. **77 файлов «изменены» только переносами строк (CRLF↔LF).** `git diff --ignore-cr-at-eol --stat` пустой — контент идентичен. Нет `.gitattributes`; кто-то пересохранил файлы под Windows. Это отравляет `git status`, diff и code review. `Подтверждено:` реальный diff.
4. **11 одноразовых скриптов в корне** (`fix.js`, `fix2.js`, `fix3.js`, `fix_encoding.js`, `fix_mojibake.js`, `fix_export.js`, `fix_prompt.js`, `export_block.js`, `check.js`, `clean.js`, `fix_py.py`) + 4 PowerShell-скрипта + `new/`, `img/` (дублируют `public/`). Мусор, затрудняющий вход в репо. CI даже комментирует: «Widen to `npx eslint .` once those files are removed».
5. **Тесты не запускаются «из коробки»:** vitest 4 падает со `Startup Error: Cannot find native binding @rolldown/binding-wasm32-wasi` (баг npm #4828 с optional deps). Лечится `npm i @rolldown/binding-wasm32-wasi --no-save` — после этого 54/54 зелёные. Но CI проходит (там `npm ci` ставит optional deps корректно), значит проблема локальной установки в WSL. `Подтверждено:` реальные запуски.
6. **Mojibake в `src/worker/collector.ts`:** строки алертов («РђРЅРѕРјР°Р»РёСЏ…», «рџљЂ») дважды перекодированы — алерты в Telegram приходят с битым текстом. `Подтверждено:` grep по файлу. Аналогичный риск для остальных файлов с кириллицей минимален (проверено — только collector).
7. **README-спека `PATCH /api/channels/:id`** не покрывает `favorite` и `ltv`/`network`-роуты — документация отстаёт на ~2 фичи-волны.

**Security:**
8. `.env` не в git (`git log --all -- .env` пуст) — ротация секретов не требуется. `.gitignore` корректен. ✅
9. `COLLECT_API_TOKEN` защищает все мутации; middleware инжектит его серверно, в бандл токен не попадает. Но токен единый, без expiry, и дефолт `supersecrettoken` в `.env.example`/compose — при выносе в интернет обязателен сменить. `Подтверждено:` `docker-compose.yml`.
10. Пароль Postgres `password` захардкожен в `docker-compose.yml` — ок для локальной разработки, небезопасно для VPS.
11. `NEXT_PUBLIC_*`-утечек не найдено. `Подтверждено:` env-список.

**Maintainability:**
12. Гигантские файлы: `ChannelsTable.tsx` (35 KB), `metrics.ts` (31 KB), `compare/page.tsx` (25 KB), `collector.ts` (20 KB), `WrappedCard.tsx` (22 KB), `RecentPosts.tsx` (15 KB), `AIReportsSection.tsx` (18 KB) — кандидаты на декомпозицию.
13. `tsconfig.tsbuildinfo` (268 KB) в корне — в `.gitignore` есть `*.tsbuildinfo`, локальный артефакт, не проблема.
14. TODO/FIXME/HACK в `src/`: 0 — либо код чист, либо комментарии вычищались скриптами (судя по `fix_prompt.js` — второе). `Предположение:` вычищались.
15. Дубли `img/` и `public/` (одинаковые `ef.png`, `tg_mon_logo.png`).

## 8. Рекомендации

**Исправить немедленно:**
1. Добавить `.gitattributes` (`* text=auto eol=lf`) и один раз нормализовать переводы строк — уберёт 77 фантомных изменений и спасёт будущие review.
2. Починить mojibake в `src/worker/collector.ts` (функция `sendTelegramAlert`) — сейчас алерты приходят с битым текстом.
3. Переписать README: PostgreSQL как дефолт, актуальный список эндпоинтов, разделы про AI-отчёты и Event Scanner.

**В первую очередь:**
4. Удалить из корня одноразовые скрипты (fix*.js, replace_*.ps1, fix_py.py, check.js, clean.js) — перенести нужное в `scripts/`, остальное в git-истории и так останется. После этого расширить ESLint на весь репо (как предлагает комментарий в ci.yml).
5. Разбить `metrics.ts` и `ChannelsTable.tsx` (по доменам: growth / engagement / EP / alerts).
6. Закоммитить текущие незакоммиченные правки: рабочее дерево грязное на 77 файлов (пусть и только CRLF) — нормализация строк + коммит приведут `git status` в чистое состояние.

**Задокументировать:** ER-схему (9 моделей), EP-формулу с весами (частично есть в `docs/analytics-formulas.md`), формат AI-отчётов (JSON-контракты в `src/lib/types.ts`), процедуру ротации `COLLECT_API_TOKEN`.

**Проверить вручную:** docker compose запуск целиком (в аудите не поднимался); поведение кэша метрик при работе воркера (устаревание данных между cron-тиками); Event Scanner на реальном потоке постов.

**Упростить/переработать:** единый Bearer-токен → при многопользовательском режиме заменить на сессии; кэш в памяти → revalidate по таблице `SyncJob` (web уже может читать БД).

## 9. С чего начать новому разработчику

**Порядок чтения (2–3 часа):**
1. `README.md` — намерение продукта (с поправкой из §7: БД — PostgreSQL).
2. `docs/overview.md` + `docs/analytics-formulas.md` — модель метрик и формулы.
3. `prisma/schema.prisma` — 9 моделей, сердце данных.
4. `src/worker/index.ts` → `src/worker/collector.ts` — как собираются данные.
5. `src/lib/metrics.ts` + `src/lib/ep.ts` — как считаются метрики и EP-score.
6. `src/app/api/channels/route.ts` + `src/app/api/stats/overview/route.ts` — типовой API-роут.
7. `src/middleware.ts` + `src/lib/auth.ts` — модель авторизации.
8. `docs/roadmap_2026-08-23.md` — что планируется дальше.

**Подъём проекта:**
```bash
npm install
cp .env.example .env         # заполнить TG_API_ID/HASH, Postgres URL, COLLECT_API_TOKEN
npm run prisma:generate && npm run prisma:push && npm run seed
npm run auth                 # одноразовая MTProto-авторизация
npm run dev:all              # web :3000 + worker
```
Если `npm test` падает с `Cannot find native binding` — `npm i @rolldown/binding-wasm32-wasi --no-save` (см. §7 п.5).

**Риски держать в голове:** mojibake-ловушка при правке кириллицы (кодировка файлов); CRLF-хаос при Windows-редакторах (не пересохраняй файлы без `.gitattributes`); единый токен мутаций; кэш метрик устаревает между cron-тиками.

## 10. Краткий итог

- Fullstack Next.js 15 + Prisma + PostgreSQL + GramJS: мониторинг Telegram-каналов, EP-скоринг, 7 типов AI-отчётов через OpenRouter, сканер мероприятий. `Подтверждено:`
- Состояние живое: последний коммит — Event Scanner; typecheck/lint/build/54 теста зелёные (проверено реальными запусками). `Подтверждено:`
- README врёт про SQLite и описывает 8 из 26 API-эндпоинтов — обновить до запуска новичка. `Подтверждено:`
- 77 «изменённых» файлов — только CRLF, нет `.gitattributes`; нужен гигиенический коммит. `Подтверждено:`
- Корень замусорен 11 fix-скриптами и 4 PowerShell-заменами — продукт активной «латки» скриптами. `Подтверждено:`
- `npm test` локально падает из-за бага npm с optional deps (rolldown wasm binding), обходится одной командой; CI зелёный. `Подтверждено:`
- Mojibake в Telegram-алертах collector'а — реальный пользовательский баг. `Подтверждено:`
- Безопасность базово ок: .env не в истории, Bearer через middleware, токен не утекает в клиент; дефолтные пароли/токены менять перед продом.
- Главный техдолг: монолитные `metrics.ts` (31 KB) и `ChannelsTable.tsx` (35 KB), кэш в памяти без синхронизации с воркером.
- Передавать проект можно после трёх шагов: `.gitattributes` + чистка корня + переписанный README.
