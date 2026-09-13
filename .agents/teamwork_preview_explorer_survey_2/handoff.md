# Handoff Report: TgMon Anti-Fraud & Unified FraudScore Architecture Survey

## 1. Observation

### 1.1 Documentation Current State
Direct inspection of `docs/` and root documentation revealed significant discrepancies between the codebase and the documentation:

1. **`README.md` (lines 25, 112):**
   - Line 25 states:
     ```markdown
     - **Антифрод (Fraud Detection):** автоматическое выявление накруток через оценку неестественной гладкости роста аудитории (`checkGrowthSmoothness`) и аномального соотношения просмотров к числу подписчиков (`checkViewsToSubsRatio`). Результаты проверок (`src/lib/fraudDetector.ts`) сохраняются в таблицу `fraud_signals`.
     ```
     *Missing:* Uncorrelated spikes (`checkUncorrelatedSpikes`), Uniform ERR (`checkUniformReactionRatio`), Citation Index & low citation check (`calculateCitationIndex`, `checkLowCitationGrowth`), unified `runFraudAudit` / `fraudScore` (0–100), and the "Risk of Artificial Traffic" UI badge (`RiskBadge`).
   - Line 112 states:
     ```markdown
     npm test              # vitest, 54 теста (collector, reconnect, timeout, ep, adDetector, utils, health)
     ```
     *Discrepancy:* Running `npm test` today executes **200 tests across 19 test files**, all passing.

2. **`docs/overview.md` (lines 21–24, 32–38):**
   - Section 4 ("Антифрод (Fraud Detection)") only mentions:
     ```markdown
     4. **Антифрод (Fraud Detection)**
        - Автоматическая проверка на аномальную гладкость роста подписчиков и неестественное соотношение просмотров к размеру аудитории.
        - Выявленные аномалии сохраняются в `FraudSignal` для мониторинга накруток.
     ```
   - Section "Поток данных" (lines 32–38) omits the anti-fraud execution stages: where checks are run during collection, where DB signals are stored, how dynamic auditing runs in metrics queries, and how fraud signals and scores are exposed in the UI.

3. **`docs/architecture.md` (lines 53–120):**
   - **Section 3 (Component Diagram — Web App & API):**
     - Contains: `ui`, `api_stats`, `api_ai`, `api_cache`, `lib_metrics`, `lib_cache`, `lib_ep`, `lib_prisma`.
     - *Missing components:* `src/lib/fraudDetector.ts` and `src/lib/citationIndex.ts`.
     - *Missing relationships:* `api_stats` -> `lib_fraud` (`runFraudAudit`, `fraudScore`), `api_stats` -> `lib_citation` (`getCitationIndicesForChannels`), and the propagation of `fraudScore`, `fraudSignals`, and `citationIndex` to `ui` (`RiskBadge`, CI cell).
   - **Section 4 (Component Diagram — MTProto Worker):**
     - Contains `Component(fraud_detector, "Fraud Detector", "src/lib/fraudDetector.ts", "Анализ аномалий роста и просмотров.")`.
     - *Outdated description:* Collector actually runs 4 distinct heuristic checks (`checkGrowthSmoothness`, `checkUncorrelatedSpikes`, `checkViewsToSubsRatio`, `checkUniformReactionRatio`) after daily metric materialization.
   - *Missing pipeline details:* No structured sequence or data flow diagram illustrating the collection -> heuristic checks -> persistence -> cache invalidation -> API synthesis -> UI badge lifecycle.

4. **`docs/analytics-formulas.md` (lines 69–84):**
   - Only documents `checkGrowthSmoothness` ($CV < 0.1$) and `checkViewsToSubsRatio` ($ratio < 0.05 \lor ratio > 1.5$).
   - Completely lacks:
     - `calculateCitationIndex` (logarithmic formula: $\sum \text{mentions} \times \log_{10}(\text{subscribers})$)
     - `checkLowCitationGrowth` (>5% 30d growth with citation index $\le 1$)
     - `checkUncorrelatedSpikes` (dynamic threshold $\max(3\overline{\Delta}, 50, 0.005 \times N)$ without posts/mentions)
     - `checkUniformReactionRatio` (ERR CV $< 0.1$ across 15–20 posts)
     - `runFraudAudit` / `fraudScore` calculation ($triggeredCount \times 25$).

5. **`docs/codebase.md` (line 42):**
   - Mentions `fraudDetector.ts` with only the original 2 checks, without `citationIndex.ts` or `runFraudAudit`.

### 1.2 Implementation Details in Codebase

1. **Anti-Fraud Module (`src/lib/fraudDetector.ts`):**
   - **Check 1: `checkViewsToSubsRatio(posts, currentMembers)`**
     - Requires $\ge 5$ posts with views.
     - Flags if $ratio < 0.05$ (dead bot followers) or $ratio > 1.5$ (view botting).
   - **Check 2: `checkGrowthSmoothness(metrics)`**
     - Requires $\ge 14$ daily metrics with average delta $> 0$.
     - Computes $CV = \sigma / \mu$ of daily deltas.
     - Flags if $CV < 0.1$ (unnatural linear growth).
   - **Check 3: `checkUncorrelatedSpikes(metrics, postsDates, mentionsDates)`**
     - Threshold: $\max(\overline{\Delta} \times 3, 50, \max(\text{followers}) \times 0.005)$.
     - Flags spikes on days without publications or mentions in $[T-1, T]$.
   - **Check 4: `checkUniformReactionRatio(channel)`**
     - Analyzes last 15–20 posts (requires $\ge 10$ posts).
     - Computes post $ERR = \frac{\text{reactions} + \text{comments} + \text{forwards}}{\text{views}} \times 100$.
     - Computes $CV = \sigma_{ERR} / \mu_{ERR}$.
     - Flags if $CV < 0.1$ (template/bot reactions).
   - **Citation Growth Check: `checkLowCitationGrowth(growthOrChannel, citationIndexOrMentions, options)`**
     - Flags if 30-day subscriber growth $> 5\%$ and citation index $\le 1$.
   - **Unified Audit: `runFraudAudit(channel)`**
     - Consolidates the 4 core checks: `viewsToSubsRatio`, `growthSmoothness`, `uncorrelatedSpikes`, `uniformReactionRatio`.
     - Computes `fraudScore`: each triggered check adds 25 points $\to$ discrete values $0, 25, 50, 75, 100$.
     - Returns `fraudScore`, `signals: FraudSignal[]`, and `details`.

2. **Citation Index Module (`src/lib/citationIndex.ts`):**
   - `calculateCitationIndex(channel, now)`:
     $$\text{CitationIndex} = \sum_{m \in \text{mentions}} \left( \text{count}_m \times \log_{10}(\text{citing\_subscribers}_m) \right)$$
     - 30-day window ($t \ge \text{now} - 30\text{d}$).
     - Excludes self-citations (`sourceChannelId !== channelId`).
     - Clamped to 0 for $\text{subscribers} \le 1$.
     - Rounded to 2 decimal places.
   - Batch database calculation: `getCitationIndicesForChannels(channels, dateLimit)`.

3. **Worker Pipeline (`src/worker/collector.ts`, lines 248–348):**
   - After `materializeDailyMetrics(channel.id, 30)`:
     1. Runs `checkGrowthSmoothness(recentMetrics)` $\to$ `saveFraudSignal('growth_smoothness', cv, reason)`
     2. Runs `checkUncorrelatedSpikes(recentMetrics, postsDates, mentionsDates)` $\to$ `saveFraudSignal('uncorrelated_spikes', count, reason)`
     3. Runs `checkViewsToSubsRatio(recentPosts, currentMembers)` $\to$ `saveFraudSignal('views_to_subs_ratio', ratio, reason)`
     4. Runs `checkUniformReactionRatio(recentPosts)` $\to$ `saveFraudSignal('uniform_err', cv, reason)`
   - Error Isolation: wrapped in `try { ... } catch (fraudErr) { logger.error('Fraud detection failed', ...); }`. Main collection cycle is never aborted by fraud checks.

4. **Query & Web Synthesis Layer (`src/lib/metrics/queries.ts`, lines 158–172, 469–486):**
   - In `getChannelsOverview()` and `getChannelDetailStats()`:
     - Calculates 30-day Citation Indices via `getCitationIndicesForChannels`.
     - Queries recent `FraudSignal` records from PostgreSQL for the last 30 days.
     - Calls `runFraudAudit(...)` merging historical DB signals with current post/metric data.
     - Sets `channel.fraudScore = audit.fraudScore` and `channel.fraudSignals = audit.signals`.

5. **UI Layer & Display Components:**
   - **`RiskBadge` (`src/components/RiskBadge.tsx`):**
     - Renders text: `Risk of Artificial Traffic: {safeScore}%`.
     - Styling based on risk level:
       - Score = 0: Low Risk $\to$ `bg-emerald-500/15 text-emerald-400 border-emerald-500/30`, `<ShieldCheck />` icon.
       - 1 $\le$ Score < 50: Medium Risk $\to$ `bg-amber-500/15 text-amber-400 border-amber-500/30`, `<AlertTriangle />` icon.
       - Score $\ge$ 50: High Risk $\to$ `bg-rose-500/15 text-rose-400 border-rose-500/30`, `<AlertTriangle />` icon.
     - Tooltip (`title`): Lists bulleted reasons from all triggered signals, or `Risk of Artificial Traffic: 0% (Низкий риск накрутки)`.
     - Placed in:
       - `src/components/MyChannelCard.tsx` (top badge row).
       - `src/components/channel/ChannelHeader.tsx` (channel detail page hero).
       - `src/components/channel/ChannelsMobileList.tsx` (mobile channel cards).
   - **Citation Index Column & Cards:**
     - `ChannelsDesktopTable.tsx`: Sortable `CI` column. If `checkLowCitationGrowth` triggers, renders rose font with `<AlertTriangle />` icon and explanation tooltip.
     - `MyChannelCard.tsx`: Metric tile "Индекс цит. (30д)" with `<Share2 />` icon, color-coded and alert-flagged if suspicious.
     - `ChannelsMobileList.tsx`: Inline CI pill with alert if flagged.

6. **Database Schema (`prisma/schema.prisma` lines 225–237):**
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

---

## 2. Logic Chain

### 2.1 Tracing the End-to-End Pipeline
Tracing from data ingestion to UI display reveals a 5-stage architecture:

```
[Telegram MTProto]
       │
       ▼ (1. Worker Ingestion: snapshots, posts, mentions)
[PostgreSQL (snapshots, posts, mentions)]
       │
       ▼ (2. Worker Materialization: channel_metrics_daily)
[Worker Anti-Fraud Engine]
       ├─ checkGrowthSmoothness()
       ├─ checkUncorrelatedSpikes()
       ├─ checkViewsToSubsRatio()
       └─ checkUniformReactionRatio()
       │
       ▼ (3. Worker Persistence: fraud_signals)
[PostgreSQL (fraud_signals)]
       │
       ▼ (4. Web / API Layer: /api/stats/overview, /api/stats/channel/[id])
[Metrics Queries Engine]
       ├─ getCitationIndicesForChannels()
       ├─ Fetch 30-day fraud_signals from DB
       └─ runFraudAudit() ──► Computes unified fraudScore (0-100) & signals
       │
       ▼ (5. UI Layer Presentation)
[Next.js React UI]
       ├─ RiskBadge ("Risk of Artificial Traffic: X%")
       ├─ Citation Index (CI) Column & Cards
       └─ checkLowCitationGrowth alert highlights
```

### 2.2 Identification of Documentation Discrepancies
1. **Architecture Diagram Incompleteness:**
   `docs/architecture.md` contains C4Component diagrams for Web and Worker. Currently, Web App C4 diagram does not depict the fraud audit or citation index components, giving the false impression that fraud detection exists solely as an unelaborated worker subprocess. Worker C4 diagram describes fraud detector only as "Анализ аномалий роста и просмотров".
2. **Overview Gaps:**
   `docs/overview.md` lists features 1 to 4, but item 4 only mentions 2 legacy checks. It fails to mention uniform ERR, uncorrelated spikes, citation index, unified `fraudScore`, or the `RiskBadge`. The Data Flow section in `overview.md` also omits the fraud signal collection and audit synthesis steps.
3. **README Inaccuracies:**
   `README.md` under "Аналитика" retains the legacy 2-heuristic description and omits `fraudScore` and `RiskBadge`. Test counts are outdated (54 vs 200).
4. **Style & Linguistic Conventions:**
   - Documentation is in Russian with standard technical English terminology (Worker, MTProto, Next.js, GramJS, C4 Model, ERR, ER, VR, Fraud Detection, fraudScore, RiskBadge).
   - Product copy in UI is Russian («Мой канал», «Индекс цит. (30д)»), while the badge specifically uses English: `"Risk of Artificial Traffic: {score}%"`.
   - Tailwind styling strictly follows 3px border radius for cards/widgets and `rounded-full` for badges (per `GEMINI.md`).

---

## 3. Recommended Changes by File

### 3.1 `docs/architecture.md`
1. **Section 2 (Container Diagram):**
   - Update Web App description to note that it calculates metrics and runs consolidated fraud audits (`runFraudAudit`).
   - Update Worker description to note that it collects MTProto data, materializes daily metrics, and records fraud signals into DB.
2. **Section 3 (Component Diagram — Web App & API):**
   - Add components:
     ```mermaid
     Component(lib_fraud, "Fraud Detector", "src/lib/fraudDetector.ts", "Консолидированный аудит (runFraudAudit), расчет fraudScore (0-100), проверка low citation growth.")
     Component(lib_citation, "Citation Index", "src/lib/citationIndex.ts", "Логарифмический расчет индекса цитирования по входящим упоминаниям за 30 дней.")
     ```
   - Connect `api_stats` to `lib_fraud` and `lib_citation`.
   - Update `ui` relationship to show it receives `fraudScore`, `fraudSignals`, and `citationIndex` for rendering `RiskBadge` and table cells.
3. **Section 4 (Component Diagram — MTProto Worker):**
   - Update `fraud_detector` component description:
     ```mermaid
     Component(fraud_detector, "Fraud Detector", "src/lib/fraudDetector.ts", "4 эвристики: гладкость роста (CV), скачки без постов/упоминаний, ratio просмотров/подписчиков, шаблонность ERR (CV).")
     ```
   - Clarify relation: `Rel(collector, fraud_detector, "Проверяет 4 эвристики после материализации")` and `Rel(collector, db, "Запись снапшотов, постов, агрегатов и fraud_signals (create)")`.
4. **New Section: Пайплайн сбора данных и антифрод-аудита (Data Pipeline & Anti-Fraud Flow):**
   - Add a detailed sequence / flow diagram illustrating the 5 phases: MTProto ingestion -> materialization -> 4 worker heuristic checks -> DB storage -> cache invalidation -> Web API on-the-fly consolidation via `runFraudAudit` -> `RiskBadge` UI presentation.

### 3.2 `docs/overview.md`
1. **Update Section 4: "Антифрод (Fraud Detection) и скоринг накруток":**
   - Describe all 4 core checks:
     1. Аномальное соотношение просмотров к подписчикам (`checkViewsToSubsRatio`) — выявление накрутки просмотров (>150%) или мертвых ботов (<5%).
     2. Аномальная гладкость роста (`checkGrowthSmoothness`) — выявление неестественно ровного прироста ($CV < 0.1$).
     3. Нескоррелированные скачки (`checkUncorrelatedSpikes`) — всплески подписчиков без публикаций и упоминаний.
     4. Шаблонная вовлеченность / равномерность ERR (`checkUniformReactionRatio`) — выявление роботизированных реакций ($CV_{ERR} < 0.1$ по 15–20 постам).
   - Describe Citation Index & Signal:
     - Количественный логарифмический индекс цитирования (`calculateCitationIndex`).
     - Сигнал `checkLowCitationGrowth`: быстрый рост аудитории (>5% за 30 дней) при околонулевом цитировании ($CI \le 1$).
   - Describe Unified `fraudScore` (0–100):
     - `runFraudAudit`: суммирование 4 флагов (по 25 баллов каждый).
   - Describe UI Integration:
     - Бейдж `"Risk of Artificial Traffic: {score}%"` (`RiskBadge`) с тремя уровнями риска (зеленый 0%, янтарный 25%, красный $\ge 50\%$) и всплывающей подсказкой причин.
     - Отображение индекса цитирования в колонке CI и карточках с алертом при накрутке.
2. **Update "Поток данных" (Data Flow):**
   - Expand the 4 steps to clearly include fraud detection execution in worker and fraudScore synthesis in web metrics.

### 3.3 `README.md`
1. **Update Section "Возможности" -> "Аналитика":**
   - Replace the 2-heuristic text on line 25 with a complete summary of:
     - 4 проверки накрутки (`checkGrowthSmoothness`, `checkViewsToSubsRatio`, `checkUncorrelatedSpikes`, `checkUniformReactionRatio`).
     - Индекс цитирования (`calculateCitationIndex`) и детекция подозрительного роста без упоминаний (`checkLowCitationGrowth`).
     - Единый скоринг накрутки `runFraudAudit` $\to$ `fraudScore` (0–100).
     - Индикатор "Risk of Artificial Traffic" (`RiskBadge`) на карточке канала, в шапке и в таблице.
2. **Update Section "Разработка":**
   - Update line 112 from `54 теста` to `200 тестов, 19 тестовых файлов`.
3. **Update Section "Документация":**
   - Add reference to `docs/adr/anti-fraud-architecture.md` (ADR по антифрод-модулю).

### 3.4 Auxiliary Documentation Recommendations
- **`docs/analytics-formulas.md`:** Must include the exact mathematical formulas for:
  1. Citation Index: $\sum \text{mentions} \times \log_{10}(\text{citing\_subscribers})$
  2. Coefficient of Variation of ERR: $CV = \sigma_{ERR} / \mu_{ERR}$
  3. Dynamic spike threshold: $\max(3\overline{\Delta}, 50, 0.005 \times N)$
  4. Unified score formula: $\text{fraudScore} = \text{triggeredCount} \times 25$
- **`docs/adr/anti-fraud-architecture.md`:** Document decision context, rationale for 25-point weighted scoring, why CV < 0.1 was chosen for ERR and growth smoothness, and why fraud detection is split between worker (signal recording) and web queries (real-time consolidation).

---

## 4. Caveats

1. **Worker vs Dynamic Audit Hybrid Model:**
   Notice that `saveFraudSignal` records individual signals in the database during worker collection, but `runFraudAudit` in `src/lib/metrics/queries.ts` is capable of evaluating checks *both* from database signals and *dynamically* from post/snapshot arrays. This ensures channels newly added or audited before a full worker cycle still receive an accurate `fraudScore`. Documentation must clearly explain this hybrid design.
2. **`checkLowCitationGrowth` vs the 4 Core Signals:**
   `runFraudAudit` specifically aggregates 4 signals (`viewsToSubsRatio`, `growthSmoothness`, `uncorrelatedSpikes`, `uniformReactionRatio`) for the 0–100 score (4 $\times$ 25 = 100). `checkLowCitationGrowth` is a standalone heuristic displayed directly on the Citation Index UI elements (`CI` column in table, `MyChannelCard` CI badge). Documentation should clearly differentiate between the 4 core audit signals and the citation growth heuristic.
3. **Zero / Insufficient Data Handling:**
   All fraud checks strictly handle edge cases:
   - `< 5` posts $\to$ `checkViewsToSubsRatio` returns `flag: false` ("Недостаточно постов").
   - `< 14` days $\to$ `checkGrowthSmoothness` returns `flag: false` ("Недостаточно данных").
   - `< 10` posts $\to$ `checkUniformReactionRatio` returns `flag: false` ("Недостаточно данных").
   - `subscribers <= 1` $\to$ `calculateCitationIndex` clamps weight to 0.

---

## 5. Conclusion

The TgMon codebase has already fully implemented:
1. **Four backend anti-fraud heuristics** in `src/lib/fraudDetector.ts` and `src/worker/collector.ts`.
2. **Logarithmic Citation Index calculation and growth check** in `src/lib/citationIndex.ts`.
3. **Consolidated fraud scoring engine (`runFraudAudit`)** returning `fraudScore` (0–100) and structured signals.
4. **UI badge and metric integration** via `RiskBadge` ("Risk of Artificial Traffic: {score}%"), `MyChannelCard`, `ChannelHeader`, `ChannelsDesktopTable`, and `ChannelsMobileList`.
5. **Comprehensive test coverage** with 200 passing tests across 19 suites.

The documentation in `README.md`, `docs/overview.md`, and `docs/architecture.md` currently lags behind these implementations, documenting only 2 legacy heuristics and missing the unified score, citation index, and UI exposure. Updating these files according to the recommendations above will make the project documentation fully truthful, precise, and up to date.

---

## 6. Verification Method

To independently verify these findings:
1. **Run test suite:**
   ```bash
   npm test
   ```
   *Expected:* 19 test files pass, 200 total tests pass.
2. **Run TypeScript typecheck:**
   ```bash
   npx tsc --noEmit
   ```
   *Expected:* Exits with code 0 without any errors.
3. **Run Linter:**
   ```bash
   npm run lint
   ```
   *Expected:* Exits with code 0 without any errors.
4. **Inspect Source Files:**
   - `src/lib/fraudDetector.ts` (lines 23–60, 68–104, 121–196, 252–342, 450–550, 576–894)
   - `src/lib/citationIndex.ts` (lines 141–273, 279–356, 361–504)
   - `src/worker/collector.ts` (lines 252–348)
   - `src/lib/metrics/queries.ts` (lines 158–172, 477–486)
   - `src/components/RiskBadge.tsx` (lines 13–56)
   - `src/components/MyChannelCard.tsx` (lines 22–24, 81, 205–233)
   - `src/components/channel/ChannelHeader.tsx` (lines 21–23, 72)
   - `src/components/channel/ChannelsDesktopTable.tsx` (lines 278–305)
   - `src/components/channel/ChannelsMobileList.tsx` (lines 150–174)
   - `prisma/schema.prisma` (lines 225–237)
