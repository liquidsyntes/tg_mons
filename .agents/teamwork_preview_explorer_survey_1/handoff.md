# Technical Investigation & Codebase Survey: Anti-Fraud & Citation Metrics

**Author**: Explorer Subagent (`teamwork_preview_explorer_survey_1`)  
**Date**: 2026-09-13  
**Target Modules**: `src/lib/fraudDetector.ts`, `src/lib/citationIndex.ts`, `src/lib/__tests__/fraudDetector.test.ts`, `src/lib/__tests__/citationIndex.test.ts`  
**Integration Points**: `src/worker/collector.ts`, `src/lib/metrics/queries.ts`, `src/lib/types.ts`, UI badges & tables

---

## 1. Observation

### 1.1 File Overview and Module Metrics
- `src/lib/fraudDetector.ts`: 894 lines of TypeScript code. Houses all single-metric anomaly detectors, data parsers, and the consolidated audit function `runFraudAudit`.
- `src/lib/citationIndex.ts`: 505 lines of TypeScript code. Houses the logarithmic citation index calculation `calculateCitationIndex` and database query helpers for inbound mentions.
- `src/lib/__tests__/fraudDetector.test.ts`: 999 lines of Vitest tests covering edge cases, synthetic series, boundaries, and audit combinations.
- `src/lib/__tests__/citationIndex.test.ts`: 243 lines of Vitest tests covering logarithmic weighting, date filtering, self-citation exclusions, and input resilience.
- `src/worker/collector.ts`: Lines 251–346 execute four fraud checks (`checkGrowthSmoothness`, `checkUncorrelatedSpikes`, `checkViewsToSubsRatio`, `checkUniformReactionRatio`) and persist flagged signals into the PostgreSQL database table `fraud_signals`.
- `src/lib/metrics/queries.ts`: Lines 28, 143, 159–172, and 477–486 integrate `getCitationIndicesForChannels`, `getCitationIndexForChannel`, and `runFraudAudit` into channel metrics for list and detail views.

### 1.2 Exported Symbols and Signatures

#### `src/lib/fraudDetector.ts` Exports
| Export Name | Kind | Line | Signature / Structure | JSDoc Status |
| :--- | :--- | :--- | :--- | :--- |
| `FraudSignalResult` | `interface` | 3–7 | `{ flag: boolean; ratio: number; reason: string; }` | ❌ **Missing JSDoc** |
| `GrowthSmoothnessResult` | `interface` | 10–14 | `{ flag: boolean; cv: number; reason: string; }` | ❌ **Missing JSDoc** |
| `UncorrelatedSpikesResult` | `interface` | 106–111 | `{ flag: boolean; spikesCount: number; dates: string[]; reason: string; }` | ❌ **Missing JSDoc** |
| `LowCitationGrowthResult` | `interface` | 198–205 | `{ flag: boolean; citationIndex: number; growthRate: number; growthPercent: number; value: number; reason: string; }` | ❌ **Missing JSDoc** |
| `UniformReactionRatioResult` | `interface` | 344–351 | `{ flag: boolean; cv: number; reason: string; avgErr?: number; postsCount?: number; signal?: FraudSignal; }` | ❌ **Missing JSDoc** |
| `FraudSignal` | `interface` | 353–360 | `{ id?: number; channelId?: number; signalType: string; value: number; reason: string; detectedAt?: Date \| string; }` | ❌ **Missing JSDoc** |
| `FraudAuditResult` | `interface` | 362–371 | `{ fraudScore: number; signals: FraudSignal[]; details: { viewsToSubsRatio: FraudSignalResult; growthSmoothness: GrowthSmoothnessResult; uncorrelatedSpikes: UncorrelatedSpikesResult; uniformReactionRatio: UniformReactionRatioResult; }; }` | ❌ **Missing JSDoc** |
| `checkViewsToSubsRatio` | `function` | 23–60 | `(posts: Array<{ views: number \| null }>, currentMembers: number): FraudSignalResult` | ⚠️ Russian JSDoc present; basic tags |
| `checkGrowthSmoothness` | `function` | 68–104 | `(metrics: Array<{ date: Date; followers: number }>): GrowthSmoothnessResult` | ⚠️ Russian JSDoc present; lacks math details |
| `checkUncorrelatedSpikes` | `function` | 121–196 | `(metrics: Array<{ date: Date; followers: number }>, postsDates: Date[], mentionsDates: Date[]): UncorrelatedSpikesResult` | ⚠️ Russian JSDoc present; lacks threshold formula |
| `checkLowCitationGrowth` | `function` | 252–342 | `(growthOrChannel: any, citationIndexOrMentions?: any, options?: { minGrowth?: number; maxCitationIndex?: number }): LowCitationGrowthResult` | ⚠️ Russian JSDoc present; loose `any` types |
| `checkUniformReactionRatio` | `function` | 450–550 | `(channel: any): UniformReactionRatioResult` | ⚠️ Russian JSDoc present; loose `any` type |
| `runFraudAudit` | `function` | 576–893 | `(channel: any): FraudAuditResult` | ⚠️ Russian JSDoc present; loose `any` type |

#### `src/lib/citationIndex.ts` Exports
| Export Name | Kind | Line | Signature / Structure | JSDoc Status |
| :--- | :--- | :--- | :--- | :--- |
| `CitationMention` | `interface` | 1–32 | Mentions properties, subscriber variations, source channels, timestamps | ❌ **Missing JSDoc** |
| `CitationChannelInput` | `interface` | 34–43 | Channel container with mentions/citations/inbound arrays | ❌ **Missing JSDoc** |
| `calculateCitationIndex` | `function` | 141–273 | `(channel: CitationChannelInput \| CitationMention[] \| number \| bigint \| string \| null \| undefined, now?: Date): number` | ✅ Complete English JSDoc with formula, params, returns |
| `getCitationIndexForChannel` | `function` | 279–356 | `(channel: { id: number; username: string \| null; tgId: bigint \| string \| number \| null }, dateLimit?: Date): Promise<number>` | ⚠️ Short description; **Missing `@param` and `@returns`** |
| `getCitationIndicesForChannels` | `function` | 361–504 | `(channels: Array<{ id: number; username: string \| null; tgId: bigint \| string \| number \| null }>, dateLimit?: Date): Promise<Map<number, number>>` | ⚠️ Short description; **Missing `@param` and `@returns`** |

### 1.3 State of JSDoc Comments: Gap Summary
1. **Interface Level**: None of the 9 exported interfaces (`FraudSignalResult`, `GrowthSmoothnessResult`, `UncorrelatedSpikesResult`, `LowCitationGrowthResult`, `UniformReactionRatioResult`, `FraudSignal`, `FraudAuditResult`, `CitationMention`, `CitationChannelInput`) possess JSDoc blocks.
2. **Function Level (`fraudDetector.ts`)**: Functions have brief Russian comments, but parameter descriptions are informal, and key mathematical formulas (such as dynamic spike thresholding `Math.max(avgDelta * 3, 50, maxFollowers * 0.005)` or ERR coefficient of variation $CV = \sigma/\mu$) are omitted.
3. **Database Helpers (`citationIndex.ts`)**: `getCitationIndexForChannel` and `getCitationIndicesForChannels` completely lack JSDoc `@param` and `@returns` tags.

---

## 2. Logic Chain & Mathematical Formulas

### 2.1 Smooth Growth Check (`checkGrowthSmoothness`)
- **Code Reference**: `src/lib/fraudDetector.ts:68–104`
- **Objective**: Detect unnatural linear subscriber growth patterns typical of automated bot-inflation scripts adding a rigid quota of subscribers daily.
- **Input Constraints**:
  - Requires at least 14 days of history: `if (metrics.length < 14) return { flag: false, cv: 0, reason: "Недостаточно данных..." }`.
- **Mathematical Steps**:
  1. Chronological sorting: Metrics are ordered such that $t_0 < t_1 < \dots < t_{N-1}$.
  2. Daily deltas series:
     $$\Delta_i = F_i - F_{i-1} \quad \text{for } i \in \{1, \dots, N-1\}$$
  3. Mean daily increment:
     $$\mu_\Delta = \frac{1}{N-1} \sum_{i=1}^{N-1} \Delta_i$$
     If $\mu_\Delta \le 0$, the channel has no positive monotonic growth; check clears with `flag: false`.
  4. Population standard deviation:
     $$\sigma_\Delta = \sqrt{\frac{1}{N-1} \sum_{i=1}^{N-1} (\Delta_i - \mu_\Delta)^2}$$
  5. Coefficient of Variation:
     $$CV = \frac{\sigma_\Delta}{\mu_\Delta}$$
- **Threshold Rule**:
  - Trigger condition: $CV < 0.1$ (relative dispersion is less than 10%).
  - Flag: `flag: true`, `reason: "Аномально гладкий рост (CV < 0.1): подозрение на накрутку"`.
  - Normal condition: $CV \ge 0.1 \implies \text{flag: false}$.

---

### 2.2 Uncorrelated Spikes Check (`checkUncorrelatedSpikes`)
- **Code Reference**: `src/lib/fraudDetector.ts:121–196`
- **Objective**: Identify sharp influxes of subscribers occurring on days with zero channel posts and zero incoming mentions.
- **Input Constraints**:
  - Requires at least 2 days of metrics.
- **Mathematical Steps**:
  1. Delta calculation: $\Delta_i = F_i - F_{i-1}$ for each consecutive pair of days.
  2. Filter positive deltas: $\Delta_i > 0$.
  3. Dynamic spike threshold formula (`src/lib/fraudDetector.ts:150`):
     $$\text{Threshold} = \max\Big(3 \times \mu_\Delta, \, 50, \, 0.005 \times F_{\max}\Big)$$
     - $3 \times \mu_\Delta$: Delta must exceed 300% of average daily delta across all days.
     - $50$: Absolute noise floor preventing small channels from triggering on minor variance.
     - $0.005 \times F_{\max}$ (0.5% of max subscribers): Protects large channels (e.g. 100,000 subscribers) from flagging natural fluctuations below 500.
  4. Identification: Spike flagged as candidate if $\Delta_i > \text{Threshold}$.
  5. Temporal Correlation Window:
     - 2-day inspection window covering the spike day and the previous day ($[t - 1\text{ day}, t]$):
       $$\text{hasEvent}(t) = \exists e \in (\text{postsDates} \cup \text{mentionsDates}) : \text{date}(e) \in \{t, t - 1\}$$
  6. Anomalous classification:
     - Any candidate spike where $\text{hasPost} = \text{false}$ and $\text{hasMention} = \text{false}$ is categorized as an unexplained spike.
- **Threshold Rule**:
  - If $\text{count}(\text{anomalousSpikes}) \ge 1$: `flag: true`, reporting count and specific dates.

---

### 2.3 Citation Index (`calculateCitationIndex`) & Low Citation Growth (`checkLowCitationGrowth`)
- **Code Reference**: `src/lib/citationIndex.ts:141–273`, `src/lib/fraudDetector.ts:252–342`

#### Citation Index Calculation (`calculateCitationIndex`)
- **Objective**: Measure inbound citation authority by weighting mentions logarithmically based on referring channel subscriber base.
- **Mathematical Formula**:
  $$\text{CI} = \sum_{i=1}^{M} \text{count}_i \times \log_{10}(\text{subscribers}_i)$$
- **Normalization & Edge Case Rules**:
  1. **Sub-linear logarithmic weighting**:
     - $\text{subscribers} = 1,000 \implies \log_{10}(1000) = 3.0$
     - $\text{subscribers} = 10,000 \implies \log_{10}(10000) = 4.0$
     - $\text{subscribers} = 100,000 \implies \log_{10}(100000) = 5.0$
     - $\text{subscribers} = 1,000,000 \implies \log_{10}(1000000) = 6.0$
  2. **Boundary clamping**: If $\text{subscribers}_i \le 1$, weight is strictly $0$ (prevents $\log_{10}(1) = 0$, $\log_{10}(0) = -\infty$, and negative numbers).
  3. **Temporal Window**: Mentions are strictly filtered to the last 30 days:
     $$0 \le t_{\text{now}} - t_{\text{mention}} \le 30 \text{ days} \quad (\text{tolerance: } -24\text{h for clock skew})$$
  4. **Self-Citation Prevention**: If citing channel ID matches the target channel ID (`sourceChannelId === targetId`), mention is excluded.
  5. **Rounding & Bounds**: Clamped to $\ge 0$, rounded to 2 decimal places (`Number(totalScore.toFixed(2))`). Zero mentions or invalid inputs safely return `0`.

#### Low Citation Growth Detector (`checkLowCitationGrowth`)
- **Objective**: Flag channels expanding rapidly without external mentions/citations.
- **Mathematical Formula**:
  $$G_{30\text{d}} = \frac{F_{\text{now}} - F_{30\text{d}}}{F_{30\text{d}}} \times 100\%$$
- **Threshold Rule**:
  - Suspicious if:
    $$G_{30\text{d}} > 5\% \quad \text{AND} \quad \text{CI} \le 1.0$$
  - Flag: `flag: true`, `reason: "Подозрение на накрутку: рост подписчиков за 30 дней (> 5%: ...%) при околонулевом индексе цитирования (...)"`.
  - Cleared if $G_{30\text{d}} \le 5\%$ or if $\text{CI} > 1.0$.

---

### 2.4 Uniform Reaction Ratio / ERR Check (`checkUniformReactionRatio`)
- **Code Reference**: `src/lib/fraudDetector.ts:450–550`
- **Objective**: Detect bot-driven template engagement where posts receive identical reaction ratios.
- **Post ERR Extraction (`extractPostERR`)**:
  $$\text{ERR}_k = \frac{\text{reactions}_k + \text{comments}_k + \text{forwards}_k}{\text{views}_k} \times 100\%$$
- **Window & Sample Size Constraints**:
  - Analyzes the most recent posts (up to 20 posts, $N \le 20$), sorted descending by date.
  - Threshold: If valid posts count $N < 10$, check returns `flag: false, cv: 0, reason: "Недостаточно данных для анализа (менее 10 постов)"`.
- **Statistical Dispersion**:
  1. Mean ERR:
     $$\mu_{\text{ERR}} = \frac{1}{N} \sum_{k=1}^{N} \text{ERR}_k$$
     If $\mu_{\text{ERR}} \le 0$, check returns `flag: false`.
  2. Population Variance:
     $$\sigma^2 = \frac{1}{N} \sum_{k=1}^{N} (\text{ERR}_k - \mu_{\text{ERR}})^2$$
  3. Population Standard Deviation:
     $$\sigma_{\text{ERR}} = \sqrt{\sigma^2}$$
  4. Coefficient of Variation:
     $$CV = \frac{\sigma_{\text{ERR}}}{\mu_{\text{ERR}}}$$
- **Threshold Rule**:
  - Trigger condition: $CV < 0.1$ (relative deviation across posts is less than 10%).
  - Flag: `flag: true`, `signalType: "uniform_err"`, `value: CV`.
  - Normal condition: $CV \ge 0.1 \implies \text{flag: false}$.

---

### 2.5 Unified Fraud Score Calculation (`runFraudAudit`)
- **Code Reference**: `src/lib/fraudDetector.ts:576–893`
- **Objective**: Consolidate individual heuristic checks into an aggregated, interpretable 0–100 risk score with constituent signals.
- **Constituent Signals & Weights**:
  1. `views_to_subs_ratio`: Triggered when $\text{ratio} < 0.05$ or $\text{ratio} > 1.5$ (weight: 25 pts)
  2. `growth_smoothness`: Triggered when $CV < 0.1$ over $\ge 14$ days (weight: 25 pts)
  3. `uncorrelated_spikes`: Triggered when $\ge 1$ unexplained spike occurs (weight: 25 pts)
  4. `uniform_err`: Triggered when post ERR $CV < 0.1$ over 10–20 posts (weight: 25 pts)
- **Aggregation Formula**:
  $$\text{fraudScore} = \sum_{j=1}^{4} (\text{flag}_j \times 25) = 25 \times K \quad (K \in \{0, 1, 2, 3, 4\})$$
- **Discretized Severity Mapping**:
  - `0`: Clean (0 flags)
  - `25`: Low Risk (1 flag)
  - `50`: Moderate Risk (2 flags)
  - `75`: High Risk (3 flags)
  - `100`: Critical Risk (all 4 flags)
- **Signal Aggregation & Resilience**:
  - Accepts raw channel models, existing database `FraudSignal` records, boolean overrides (snake_case/camelCase), and `triggers` sets.
  - Generates detailed `details` payload with individual sub-results and reasons.

---

## 3. Caveats & Architectural Nuances

1. **Constituent Checks in `runFraudAudit` vs `checkLowCitationGrowth`**:
   - `runFraudAudit` consolidates 4 signals: `views_to_subs_ratio`, `growth_smoothness`, `uncorrelated_spikes`, and `uniform_err`.
   - `checkLowCitationGrowth` is a standalone cross-referencing validator used in Channel Cards and Tables alongside the Citation Index metric, but is **not** currently weighted in the 0–100 `fraudScore`.
2. **Worker vs Live Web Audit**:
   - The worker (`src/worker/collector.ts`) executes `checkGrowthSmoothness`, `checkUncorrelatedSpikes`, `checkViewsToSubsRatio`, and `checkUniformReactionRatio` independently during collection, persisting flags into the `fraud_signals` table.
   - The web process (`src/lib/metrics/queries.ts`) calls `runFraudAudit` dynamically during overview and detail page queries, merging live calculated data with historical database signals from the last 30 days.
3. **Population vs Sample Variance**:
   - Both `checkGrowthSmoothness` and `checkUniformReactionRatio` use population variance ($\frac{1}{N}$) rather than sample variance ($\frac{1}{N-1}$). This is deterministic and standard across all test assertions.

---

## 4. Conclusion & Actionable Recommendations for Documentation Update

1. **JSDoc Updates Needed (`src/lib/fraudDetector.ts` & `src/lib/citationIndex.ts`)**:
   - Add JSDoc comments to all 9 exported interfaces detailing every field, units, and ranges.
   - Expand function JSDoc comments to document mathematical formulas, exact thresholds, parameter definitions, and return types.
2. **Documentation Updates Needed**:
   - `docs/analytics-formulas.md`: Expand the "Антифрод (Fraud Detection)" section (currently only documenting 2 metrics) to include full mathematical formulas for `checkUncorrelatedSpikes`, `calculateCitationIndex`, `checkLowCitationGrowth`, `checkUniformReactionRatio`, and `runFraudAudit`.
   - `docs/architecture.md`: Update Section 3 (Web Component Diagram) and Section 4 (Worker Component Diagram) to reflect the unified `fraudScore`, `Citation Index`, `uniform_err`, and `uncorrelated_spikes` pipeline.
   - `docs/overview.md`: Update Section 4 (Fraud Detection) to describe all 5 checks, the Citation Index, and the unified `fraudScore` badge.
   - `docs/adr/0001-anti-fraud-architecture.md`: Create a dedicated ADR documenting the rationale for the four-pillar fraud detection architecture, logarithmic citation weighting, CV thresholds ($< 0.1$), and 25-point equal weighting scheme.

---

## 5. Verification Method

To independently verify these findings, run the repository's test and typecheck suites:

1. **TypeScript Typecheck**:
   ```bash
   npx tsc --noEmit
   ```
   *Expected result*: Exit code 0, 0 typing errors.
2. **Vitest Unit Test Suite**:
   ```bash
   npm test
   ```
   *Expected result*: 19 test files passed, 200 unit tests passed (including 15 tests in `citationIndex.test.ts` and 40+ tests in `fraudDetector.test.ts`).
3. **Inspect Key Implementation Lines**:
   - `src/lib/fraudDetector.ts`: lines 17–60, 68–104, 121–196, 252–342, 450–550, 576–893.
   - `src/lib/citationIndex.ts`: lines 141–273, 279–356, 361–504.
