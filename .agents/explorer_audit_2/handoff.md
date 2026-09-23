# Handoff Report: Global Factual Audit of docs/ vs Codebase (Requirement R2)

**Author**: `explorer_audit_2`  
**Date**: 2026-09-20  
**Target Project**: `c:\TgMon`  
**Working Directory**: `c:\TgMon\.agents\explorer_audit_2`  
**Audit Scope**: All documentation files in `docs/` (`overview.md`, `architecture.md`, `api-reference.md`, `codebase.md`, `deployment.md`, `analytics-formulas.md`, `git-workflow.md`, `codex-workflow.md`, `adr/0001-anti-fraud-detection-architecture.md`), query on non-existent files (`worker-flow.md`, `api.md`, `telegram-mtproto.md`), as well as `README.md` and `scripts/README.md`, cross-referenced against `src/app/`, `src/worker/`, `src/lib/`, `prisma/schema.prisma`, `package.json`, and Docker configurations.

---

## 1. Observation

### 1.1 Documentation Inventory vs Requested Files
- **Existing files in `docs/`**:
  1. `docs/overview.md` (61 lines, verified 17.09.2026)
  2. `docs/architecture.md` (121 lines, verified 17.09.2026)
  3. `docs/api-reference.md` (158 lines, verified 17.09.2026)
  4. `docs/codebase.md` (91 lines, verified 17.09.2026)
  5. `docs/deployment.md` (149 lines, partially updated 20.09.2026)
  6. `docs/analytics-formulas.md` (218 lines, verified 17.09.2026)
  7. `docs/git-workflow.md` (69 lines)
  8. `docs/codex-workflow.md` (67 lines)
  9. `docs/adr/0001-anti-fraud-detection-architecture.md` (64 lines, verified 17.09.2026)
- **Requested files that do NOT exist**:
  - `docs/worker-flow.md` — Does not exist in filesystem or Git history (`git log --all --full-history -- "**/worker-flow*"` returned 0 commits). Worker collection sequence is documented in `docs/architecture.md` (lines 58–91, "## Основной цикл сбора") and `docs/codebase.md` (lines 53–64, "## Worker").
  - `docs/api.md` — Does not exist as `api.md`; the actual file is `docs/api-reference.md`.
  - `docs/telegram-mtproto.md` — Does not exist in filesystem or Git history (`git log --all --full-history -- "**/telegram-mtproto*"` returned 0 commits). MTProto connection, authentication, and error handling are documented across `docs/architecture.md` (lines 12–17, 88–91), `docs/codebase.md` (lines 53–64), and `docs/deployment.md` (lines 20–27).

---

### 1.2 API Route Audit (`src/app/api/**/route.ts` vs `docs/api-reference.md`)
Across `src/app/api/`, ripgrep and file search identified exactly **29 route handler files** and 33 exported HTTP methods:
1. `channels/route.ts`: `GET`, `POST`
2. `channels/[id]/route.ts`: `GET`, `PATCH`, `DELETE`
3. `channels/[id]/favorite/route.ts`: `PUT`
4. `channels/[id]/ltv/route.ts`: `GET`
5. `channels/[id]/network/route.ts`: `GET`
6. `channels/[id]/ad-price/route.ts`: `GET`
7. `stats/overview/route.ts`: `GET`
8. `stats/dashboard/route.ts`: `GET`
9. `stats/channel/[id]/route.ts`: `GET`
10. `stats/compare/route.ts`: `GET`
11. `stats/best-time/route.ts`: `GET`
12. `stats/trends/route.ts`: `GET`
13. `stats/demographics/[id]/route.ts`: `GET`
14. `posts/search/route.ts`: `GET`
15. `ai/summary/route.ts`: `POST`
16. `ai/super-report/route.ts`: `POST`
17. `ai/compare/route.ts`: `POST`
18. `ai/trends/route.ts`: `POST`
19. `ai/audience/route.ts`: `POST`
20. `ai/persona/route.ts`: `POST`
21. `ai/action-plan/route.ts`: `POST`
22. `ai/compare-reports/route.ts`: `POST`
23. `reports/[id]/export/route.ts`: `GET`
24. `events/route.ts`: `GET`
25. `events/scan/route.ts`: `POST`
26. `settings/route.ts`: `GET`, `POST`
27. `collect/run/route.ts`: `POST`
28. `health/route.ts`: `GET`
29. `internal/invalidate-cache/route.ts`: `POST`

**Direct Code Observations on API**:
- **Endpoint matching**: 100% of the 29 route files and 33 HTTP methods are documented in `docs/api-reference.md`. There are zero phantom routes documented and zero undocumented route files.
- **Factual Discrepancy in `/api/ai/trends` channel selection**:
  - `docs/api-reference.md` line 93 states:  
    `| /api/ai/trends | Не требуется | До 100 текстовых постов активных конкурентов за 48 часов | JSON-объект LLM | trend |`  
    (echoed in `docs/overview.md` line 11 and `docs/architecture.md` line 93).
  - Verbatim code from `src/app/api/ai/trends/route.ts` (lines 15–29):
    ```typescript
    // Ищем каналы из Watchlist и свой канал
    const channels = await prisma.channel.findMany({
      where: {
        OR: [
          { isFavorite: true },
          { isMine: true }
        ],
        isActive: true
      },
      select: { id: true, title: true, username: true }
    });
    ```
    The endpoint does NOT analyze all active competitors. It strictly filters for channels where `isFavorite: true` (Watchlist) OR `isMine: true` (My Channel). Non-favorited competitors are excluded.
- **Factual Observation on `GET /api/reports/:id/export`**:
  - `src/app/api/reports/[id]/export/route.ts` line 339–347 specifies `titleMap` for: `summary`, `evolution`, `action_plan`, `compare`, `trend`, `audience`, `persona`.
  - It does NOT include a specialized case for `super_report`, falling back to title `'Отчет'` and the `compare` table rendering branch in the `else` condition.

---

### 1.3 Worker Flows, Schedulers, and Queues vs Codebase
- **Queues**:
  - `docs/architecture.md` line 19 states: "Очереди задач и отдельного HTTP-сервера worker нет."
  - Verified: `src/worker/` contains no task broker or queue system (no Redis, BullMQ, etc.). Collection tasks are scheduled via `node-cron` or called directly in-process.
- **Schedulers in `src/worker/index.ts`**:
  - Line 10: `process.env.COLLECT_CRON || '0 * * * *'` (scheduled at line 72).
  - Line 11: `process.env.DEMOGRAPHICS_CRON || '0 3 * * 0'` (scheduled at line 83).
  - Line 91: hardcoded `'15 * * * *'` for `executeAdReachCycle()`.
  - Line 99: `if (process.env.COLLECT_ON_STARTUP === 'true') await executeCycle();` (only triggers main collection, not demographics or ad-reach).
- **Concurrency & In-Process Locks**:
  - `src/worker/index.ts` lines 12–14 declare `isRunning`, `isDemographicsRunning`, `isAdReachRunning` to protect each cron from overlapping within the worker process.
  - As documented in `docs/architecture.md` line 21, there is no cross-process lock between web and worker (`runCollectCycle` in web via `/api/collect/run` and `src/worker/collector.ts` can execute simultaneously).

---

### 1.4 Outdated Documentation, Contradictions, and Verification Dates
- **Direct Contradiction in `README.md` (Docker Local Development)**:
  - `README.md` lines 54–56:
    ```markdown
    ## Docker и развёртывание
    [Инструкция развёртывания](docs/deployment.md) описывает три режима: всё на хосте, PostgreSQL и worker в Docker с локальным Next.js, полный Compose.
    ```
  - In `docs/deployment.md` line 70 (updated for R1):
    ```markdown
    ## Режим 2: Локальная разработка (Всё в Docker)
    Это рекомендуемая локальная схема с hot reload для web и worker...
    docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
    ... Не запускайте npm run dev на хосте.
    ```
    `README.md` line 56 directly contradicts `docs/deployment.md` line 70, `docker-compose.dev.yml`, and `GEMINI.md` by stating that Mode 2 is "PostgreSQL и worker в Docker с локальным Next.js".
- **Documentation Verification Dates**:
  - All doc files currently bear verification headers dated `17 сентября 2026 года` (`README.md`, `docs/overview.md`, `docs/architecture.md`, `docs/api-reference.md`, `docs/codebase.md`, `docs/deployment.md`, `docs/analytics-formulas.md`, `docs/adr/0001-anti-fraud-detection-architecture.md`).
  - The current date is `20 сентября 2026 года`.
- **Incomplete Tool Listing in `scripts/README.md`**:
  - `scripts/README.md` lists 7 scripts, but omits `audit-metrics.ts`, `backfill-subscribers.ts`, `repair-subscribers.ts`, and `fix_grouped_posts.ts`.
  - `docs/analytics-formulas.md` line 42 explicitly links to `[backfill/repair](../scripts/README.md)`, but those two scripts are absent from `scripts/README.md`.
- **Formatting Residue in `docs/deployment.md`**:
  - Lines 99–101 in `docs/deployment.md` contain leftover empty lines from the previous `docker-compose.dev.yml` section before it was moved to Mode 2.

---

## 2. Logic Chain

1. **Premise 1 (File Alignment)**: The prompt requests an audit of `docs/overview.md`, `docs/architecture.md`, `docs/worker-flow.md`, `docs/api.md`, `docs/telegram-mtproto.md`.
   - Inspection of the repository shows that `docs/worker-flow.md`, `docs/api.md`, and `docs/telegram-mtproto.md` do not exist.
   - Tracing git history proves they never existed under those names.
   - `docs/api-reference.md` fulfills the role of `api.md`.
   - `docs/architecture.md` (sequence diagram, lines 60–87) and `docs/codebase.md` (lines 53–64) fulfill the role of `worker-flow.md` and `telegram-mtproto.md`.
   - *Inference*: Documentation is consolidated rather than fragmented; no new phantom files should be created, but any cross-references to these names must point to the canonical consolidated documents.

2. **Premise 2 (API Accuracy)**: `docs/api-reference.md` line 93 describes `/api/ai/trends` as reading posts of "активных конкурентов".
   - `src/app/api/ai/trends/route.ts` line 18 filters `OR: [{ isFavorite: true }, { isMine: true }], isActive: true`.
   - Active competitor channels that are not starred (`isFavorite: false`) are ignored by the trend query.
   - *Inference*: Documenting this as "активных конкурентов" is factually incorrect and misleading for users wondering why newly added competitors do not appear in trend reports. The description must specify "каналы из избранного (Watchlist) и «Мой канал»".

3. **Premise 3 (Docker Local Development Contradiction)**: R1 updated `docs/deployment.md` to establish Mode 2 as "Локальная разработка (Всё в Docker)" using `docker-compose.dev.yml` with hot reload.
   - `README.md` lines 54–56 was not updated simultaneously and still states: "PostgreSQL и worker в Docker с локальным Next.js".
   - In addition, running `npm run dev` on the host is strictly prohibited by `GEMINI.md` and `docs/deployment.md` line 78.
   - *Inference*: `README.md` contains an obsolete and contradictory deployment statement that must be synchronized with `docs/deployment.md`.

4. **Premise 4 (Script Reference Broken Links)**: `docs/analytics-formulas.md` line 42 states: "Утилиты [backfill/repair](../scripts/README.md) восстанавливают приближение по Snapshot...".
   - Opening `scripts/README.md` reveals no mention of `backfill-subscribers.ts` or `repair-subscribers.ts`.
   - Both files exist in `scripts/`.
   - *Inference*: `scripts/README.md` must be updated to document `backfill-subscribers.ts` and `repair-subscribers.ts` (as well as `audit-metrics.ts` and `fix_grouped_posts.ts`) to maintain factual consistency with `docs/analytics-formulas.md`.

5. **Premise 5 (Audit Timestamps)**: All documents carry `Сверено 17 сентября 2026 года`.
   - The authoritative user request `## 2026-09-20T13:48:35Z` requires updating the entire documentation suite to reflect the current state as of 20 сентября 2026 года.
   - *Inference*: Verification headers should be uniformly updated to `20 сентября 2026 года`.

---

## 3. Caveats

1. **No Source Code Changes**: Per the Explorer role and system instructions, this investigation was strictly read-only. No files in `src/`, `docs/`, or `README.md` were modified. All proposed changes are provided below as actionable specifications with exact lines.
2. **Missing Files Clarification**: `docs/worker-flow.md` and `docs/telegram-mtproto.md` were evaluated as non-existent files. If the user or parent orchestrator intended to split `docs/architecture.md` into separate modular files, that would represent a structural documentation expansion, not a factual correction. The existing consolidated structure in `docs/architecture.md` and `docs/codebase.md` is complete, detailed, and factually accurate.
3. **OpenRouter AI Model Runtime Availability**: `docs/overview.md` line 50 and `docs/deployment.md` line 148 state that the AI client uses model `z-ai/glm-5.3-flash`. The code in `src/lib/openrouter.ts` line 10 confirms `model?: string; // default: 'z-ai/glm-5.3-flash'`. The actual availability of this model endpoint depends on OpenRouter upstream service status.

---

## 4. Conclusion & Actionable Modification Plan

The documentation suite in `docs/` is remarkably accurate and rigorously maintained, reflecting the real codebase with high fidelity across data models, background worker flows, metric calculations, and API routes.

However, to achieve 100% factual accuracy and resolve inconsistencies, the following targeted modifications must be applied:

### File 1: `README.md`
- **Issue**: Line 56 has outdated description of Mode 2 ("PostgreSQL и worker в Docker с локальным Next.js"), contradicting `docs/deployment.md` and `GEMINI.md`. Verification date is 17.09.2026.
- **Action**:
  - Update line 5: change date to `20 сентября 2026 года`.
  - Update lines 54–56:
    ```markdown
    [Инструкция развёртывания](docs/deployment.md) описывает три режима: всё на хосте, локальная разработка (всё в Docker с hot reload через `docker-compose.dev.yml`), полный Compose. Миграции не запускаются автоматически при старте контейнеров.
    ```

### File 2: `docs/api-reference.md`
- **Issue**:
  1. Line 3 verification date is 17.09.2026.
  2. Line 93 inaccurately describes `/api/ai/trends` as sampling "активных конкурентов", when code actually queries `isFavorite: true OR isMine: true`.
- **Action**:
  - Update line 3: change date to `20 сентября 2026 года`.
  - Update line 93 in AI routes table:
    ```markdown
    | `/api/ai/trends` | Не требуется | До 100 текстовых постов каналов из избранного (Watchlist) и «Моего канала» за 48 часов | JSON-объект LLM | `trend` |
    ```

### File 3: `docs/architecture.md`
- **Issue**:
  1. Line 3 verification date is 17.09.2026.
  2. Line 93 / Line 116 refers to trends sampling competitors.
- **Action**:
  - Update line 3: change date to `20 сентября 2026 года`.
  - In section "AI, события и граница доступа" (or anywhere trends post selection is described), clarify that trends analyzes channels from Watchlist (`isFavorite: true`) and My Channel (`isMine: true`).

### File 4: `docs/overview.md`
- **Issue**:
  1. Line 5 verification date is 17.09.2026.
  2. Line 11 / Line 20 describes trend radar. Clarify that it aggregates posts from starred channels (`isFavorite: true`) and My Channel.
- **Action**:
  - Update line 5: change date to `20 сентября 2026 года`.
  - Clarify in line 20 that the radar analyzes Watchlist and My Channel posts for the last 48 hours.

### File 5: `docs/codebase.md`
- **Issue**: Line 3 verification date is 17.09.2026.
- **Action**: Update line 3: change date to `20 сентября 2026 года`.

### File 6: `docs/deployment.md`
- **Issue**:
  1. Line 3 verification date is 17.09.2026.
  2. Lines 100–101 have extraneous blank lines left after removing the old dev override note.
- **Action**:
  - Update line 3: change date to `20 сентября 2026 года`.
  - Remove empty lines 100–101.

### File 7: `docs/analytics-formulas.md`
- **Issue**: Line 3 verification date is 17.09.2026.
- **Action**: Update line 3: change date to `20 сентября 2026 года`.

### File 8: `docs/adr/0001-anti-fraud-detection-architecture.md`
- **Issue**: Line 3 verification date is 17.09.2026.
- **Action**: Update line 3: change date to `20 сентября 2026 года`.

### File 9: `scripts/README.md`
- **Issue**: Missing entries for scripts referenced in `docs/analytics-formulas.md` line 42 (`backfill-subscribers.ts`, `repair-subscribers.ts`) and maintenance utilities (`audit-metrics.ts`, `fix_grouped_posts.ts`).
- **Action**: Add entries for:
  - `backfill-subscribers.ts`: "Восстанавливает исторические `subscribersAtPublish` для постов по ближайшим снимкам Snapshot."
  - `repair-subscribers.ts`: "Пакетная корректировка нулевых или пропущенных `subscribersAtPublish`."
  - `audit-metrics.ts`: "Аудит целостности сохранённых снимков и метрик каналов."
  - `fix_grouped_posts.ts`: "Сведение разрозненных сообщений одного медиаальбома к единому посту по `groupedId`."

---

## 5. Verification Method

To independently verify the facts established in this report:

1. **Verify API Route Completeness**:
   Run in PowerShell:
   ```powershell
   Get-ChildItem -Recurse -Path "c:\TgMon\src\app\api" -Filter "route.ts" | Select-Object FullName
   ```
   Cross-reference the 29 resulting files against the table in `docs/api-reference.md`.

2. **Verify `/api/ai/trends` Channel Filter**:
   Run in PowerShell:
   ```powershell
   Select-String -Path "c:\TgMon\src\app\api\ai\trends\route.ts" -Pattern "isFavorite|isMine" -Context 2,2
   ```
   Confirm that only `isFavorite: true` and `isMine: true` channels are included.

3. **Verify Absence of Phantom Docs**:
   Run in PowerShell:
   ```powershell
   git log --all --full-history -- "**/worker-flow*" "**/telegram-mtproto*" "**/api.md"
   ```
   Confirm 0 commits returned.

4. **Verify Worker Schedulers**:
   Run in PowerShell:
   ```powershell
   Select-String -Path "c:\TgMon\src\worker\index.ts" -Pattern "cron.schedule|COLLECT_CRON|DEMOGRAPHICS_CRON"
   ```
   Confirm the three cron schedules (`COLLECT_CRON`, `DEMOGRAPHICS_CRON`, and `'15 * * * *'`).

5. **Verify Project Compilation & Markdown Formatting**:
   ```powershell
   npx tsc --noEmit
   npm run lint
   npm test
   ```
   Verify 0 TypeScript errors and 0 test regressions.
