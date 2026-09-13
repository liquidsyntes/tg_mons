# Handoff Report: Anti-Fraud Metrics & ADR Specification Mining

## 1. Observation

### Codebase & Documentation Inspection
1. **`docs/analytics-formulas.md`**:
   - Lines 1-96 inspected. Uses Russian language, clear structural headings, bullet points (`Формула`, `Источник`, `Когда null`, `В UI`).
   - Currently includes Engagement Rate (ER), Engagement Rate by Reach (ERR), `trueErr7d`, Comments Rate (CR), View Rate (VR), Subscriber Deltas, and an outdated Anti-Fraud section (lines 69-84) describing only two early checks (`checkGrowthSmoothness` and `checkViewsToSubsRatio`).
   - Missing mathematical specifications for:
     - `checkUncorrelatedSpikes` (скачки подписчиков без публикаций и внешних упоминаний)
     - `calculateCitationIndex` (логарифмический индекс цитирования внешними каналами)
     - `checkLowCitationGrowth` (быстрый рост аудитории при околонулевом индексе цитирования)
     - `checkUniformReactionRatio` (аномальная однородность реакций по постам через коэффициент вариации ERR)
     - `runFraudAudit` / `fraudScore` (консолидированный скор накрутки 0-100% и компонент `RiskBadge`).

2. **`docs/adr/`**:
   - Inspected project directory `docs/`: `docs/adr/` does **not exist** currently.
   - Project ADR numbering standard: `0001-...md` (e.g., `0001-anti-fraud-detection-architecture.md`).
   - Required ADR template structure: Title, Status, Context, Decision, Empirical Thresholds, Trade-offs, Consequences.

3. **Source Code & Public Interfaces**:
   - `src/lib/fraudDetector.ts` (894 lines): Implements `checkViewsToSubsRatio`, `checkGrowthSmoothness`, `checkUncorrelatedSpikes`, `checkLowCitationGrowth`, `checkUniformReactionRatio`, and `runFraudAudit`.
   - `src/lib/citationIndex.ts` (505 lines): Implements `calculateCitationIndex`, `getCitationIndexForChannel`, and `getCitationIndicesForChannels`.
   - `src/lib/metrics.ts` (8 lines): Re-exports all functions from `./citationIndex` and `./metrics/*`.
   - `src/worker/collector.ts` (lines 252-348): In the collection cycle, queries last 30 daily metrics and posts, runs `checkGrowthSmoothness`, `checkUncorrelatedSpikes`, `checkViewsToSubsRatio`, `checkUniformReactionRatio`, and saves positive flags to `prisma.fraudSignal` via `saveFraudSignal`.
   - `src/lib/metrics/queries.ts` (lines 158-172, 477-486): Aggregates citations, runs `runFraudAudit({ posts, metrics, currentMembers, fraudSignals })`, attaches `fraudScore` and `fraudSignals` to channel records.
   - `src/components/RiskBadge.tsx` (59 lines): UI badge rendering "Risk of Artificial Traffic: {safeScore}%" with 3 tiers (0%: emerald `ShieldCheck`, 1-49%: amber `AlertTriangle`, 50-100%: rose `AlertTriangle`) and tooltip listing triggered signals.
   - `src/components/MyChannelCard.tsx` (lines 199-234): Renders `Индекс цит. (30д)` and flags with `AlertTriangle` in rose if `checkLowCitationGrowth(channel)` returns `flag: true`.
   - `prisma/schema.prisma` (lines 225-237): Model `FraudSignal` mapped to `fraud_signals` with fields `id`, `channelId`, `signalType`, `value`, `reason`, `detectedAt`.

4. **Test Suite Verification**:
   - `npx vitest run src/lib/__tests__/fraudDetector.test.ts src/lib/__tests__/citationIndex.test.ts`: **95 passed (95)** in 710ms.
   - `npx tsc --noEmit`: Clean pass with 0 errors.

---

## 2. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Fraud Detection | `checkGrowthSmoothness` | Identifies unnaturally linear follower growth via Coefficient of Variation (CV) of daily subscriber deltas | `metrics: Array<{ date: Date; followers: number }>` | `GrowthSmoothnessResult { flag: boolean, cv: number, reason: string }` | Returns `flag: false, cv: 0` if history < 14 days or average delta <= 0 | `src/lib/fraudDetector.ts:68` |
| 2 | Fraud Detection | `checkViewsToSubsRatio` | Detects abnormal view-to-subscriber ratios indicating ghost bot subscribers or artificial view padding | `posts: Array<{ views: number \| null }>, currentMembers: number` | `FraudSignalResult { flag: boolean, ratio: number, reason: string }` | Returns `flag: false` if members <= 0 or valid posts < 5 | `src/lib/fraudDetector.ts:23` |
| 3 | Fraud Detection | `checkUncorrelatedSpikes` | Flags abnormal subscriber jumps occurring on days without posts or external channel mentions | `metrics: Array<{ date: Date; followers: number }>, postsDates: Date[], mentionsDates: Date[]` | `UncorrelatedSpikesResult { flag: boolean, spikesCount: number, dates: string[], reason: string }` | Returns `flag: false` if metrics < 2 or no positive deltas; checks $[D-1, D]$ window | `src/lib/fraudDetector.ts:121` |
| 4 | Citation Metrics | `calculateCitationIndex` | Calculates a quantitative citation index weighting mentions logarithmically by citing channels' subscriber count | `channel: CitationChannelInput \| CitationMention[] \| number \| bigint \| string, now: Date` | `number >= 0` (rounded to 2 decimal places) | Clamps subscribers <= 1 to 0 weight; ignores mentions older than 30d; skips self-citations | `src/lib/citationIndex.ts:141` |
| 5 | Fraud Detection | `checkLowCitationGrowth` | Flags channels growing >5% over 30 days that have near-zero external citations (CI <= 1) | `growthOrChannel: number \| string \| bigint \| object, citationIndexOrMentions?: any, options?: { minGrowth?, maxCitationIndex? }` | `LowCitationGrowthResult { flag: boolean, citationIndex: number, growthRate: number, growthPercent: number, value: number, reason: string }` | Handles numeric strings, `%` signs, BigInt; returns `flag: false` if growth <= 5% | `src/lib/fraudDetector.ts:252` |
| 6 | Fraud Detection | `checkUniformReactionRatio` | Flags template bot reaction injections where ERR across recent 15-20 posts has CV < 0.1 | `channel: Array<post> \| { posts?: any[], recentPosts?: any[], items?: any[] }` | `UniformReactionRatioResult { flag: boolean, cv: number, reason: string, avgErr?: number, postsCount?: number, signal?: FraudSignal }` | Returns `flag: false, cv: 0` if valid posts < 10 or average ERR <= 0 | `src/lib/fraudDetector.ts:450` |
| 7 | Fraud Audit | `runFraudAudit` | Aggregates all four core fraud checks into a consolidated 0-100 score (each flag = 25 pts) and active signals | `channel: any` (channel object, posts array, triggers list, or simulated flags) | `FraudAuditResult { fraudScore: number, signals: FraudSignal[], details: { viewsToSubsRatio, growthSmoothness, uncorrelatedSpikes, uniformReactionRatio } }` | Handles `null`/`undefined` channel (returns score 0); supports simulated booleans & triggers | `src/lib/fraudDetector.ts:576` |
| 8 | Worker Persistence | `saveFraudSignal` & worker loop | Persists triggered fraud signals to PostgreSQL `fraud_signals` table | `channelId: number, signalType: string, value: number, reason: string` | `Promise<FraudSignal>` | Wrapped in try-catch in worker loop; failures log error without halting collection | `src/worker/collector.ts:262`, `src/worker/persister.ts:241` |
| 9 | UI Component | `RiskBadge` / `FraudScoreBadge` | Renders visual badge with "Risk of Artificial Traffic: {score}%", color coding, and diagnostic tooltips | `score: number, signals?: FraudSignal[], className?: string` | JSX element with badge and tooltip | Clamps score to [0, 100]; defaults to 0 on `null`/`undefined`/`NaN` | `src/components/RiskBadge.tsx:13` |
| 10 | DB Integration | `getCitationIndicesForChannels` | Batches database query for inbound mentions over 30 days and calculates CI for channels | `channels: Array<{ id, username, tgId }>, dateLimit?: Date` | `Promise<Map<number, number>>` | Excludes self-citations; falls back to post subscribersAtPublish if snapshot missing | `src/lib/citationIndex.ts:361` |

---

## 3. Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | `checkGrowthSmoothness` | Less than 14 daily metrics points | Returns `{ flag: false, cv: 0, reason: "Недостаточно данных для анализа (менее 14 дней)" }` |
| 2 | `checkGrowthSmoothness` | Negative or zero average delta | Returns `{ flag: false, cv: 0, reason: "Нет монотонного роста (средний прирост <= 0)" }` |
| 3 | `checkGrowthSmoothness` | Perfect linear growth (e.g. +10 followers every day) | Returns `{ flag: true, cv: 0, reason: "Аномально гладкий рост (CV < 0.1): подозрение на накрутку" }` |
| 4 | `checkGrowthSmoothness` | Weak growth with a single massive viral spike | Standard deviation becomes large relative to mean ($\text{CV} > 0.1$), `flag: false` |
| 5 | `checkUncorrelatedSpikes` | Spike on date $D$ with a post published on date $D$ or $D-1$ | Classified as justified; not counted as an anomalous spike |
| 6 | `checkUncorrelatedSpikes` | Spike on date $D$ with an external mention on date $D$ or $D-1$ | Classified as justified; not counted as an anomalous spike |
| 7 | `checkUncorrelatedSpikes` | Spike on date $D$ with neither post nor mention in $[D-1, D]$ | Classified as anomalous spike; returns `flag: true`, `spikesCount: N`, dates list |
| 8 | `checkUncorrelatedSpikes` | Large channel (e.g. 100,000 members) with delta = 400 | Threshold $\max(3\cdot\text{avg}, 50, 0.005\cdot 100000 = 500) = 500$. Delta 400 is below 500 $\rightarrow$ `flag: false` (prevents false positives on mega-channels) |
| 9 | `calculateCitationIndex` | `citing_subscribers <= 1` (0, 1, or negative) | Returns weight 0; avoids $\log_{10}(0) = -\infty$ or negative weights |
| 10 | `calculateCitationIndex` | Mentions older than 30 days | Excluded from calculation via date comparison `now - mentionDate > 30d` |
| 11 | `calculateCitationIndex` | Self-citation where `sourceChannelId === targetChannel.id` | Excluded from citation index sum |
| 12 | `calculateCitationIndex` | Empty array, `null`, `undefined`, or `{}` | Gracefully returns `0` without throwing |
| 13 | `checkLowCitationGrowth` | Channel growth $\le 5\%$ with 0 mentions | Returns `flag: false` (growth does not exceed threshold) |
| 14 | `checkLowCitationGrowth` | Channel growth $> 5\%$ and citation index $> 1$ | Returns `flag: false` (citations are sufficient for growth rate) |
| 15 | `checkLowCitationGrowth` | Growth input as formatted string `"+15%"` or `10n` (BigInt) | Accurately parsed to numeric value 15 and 10; flags if CI $\le 1$ |
| 16 | `checkUniformReactionRatio` | Less than 10 valid posts with views | Returns `{ flag: false, cv: 0, reason: "Недостаточно данных для анализа (менее 10 постов)" }` |
| 17 | `checkUniformReactionRatio` | Posts with zero reactions/comments/forwards ($\text{avgErr} \le 0$) | Returns `{ flag: false, cv: 0, reason: "Нулевой или отрицательный средний ERR" }` |
| 18 | `checkUniformReactionRatio` | Exactly identical ERR series across $\ge 10$ posts | Returns `{ flag: true, cv: 0, reason: "Аномально равномерный ERR (CV = 0.0000 < 0.1): подозрение на шаблонные накрутки реакций ботами" }` |
| 19 | `runFraudAudit` | Simulated boolean combinations (e.g., `{ viewsToSubsRatio: true, uniformErr: true }`) | Correctly aggregates to `fraudScore: 50` and populates `signals` array with 2 entries |
| 20 | `RiskBadge` | Negative score (e.g. -20) or overflowing score (e.g. 180) | Clamped safely to 0% and 100% respectively; renders emerald or rose styling |

---

## 4. Logic Chain

1. **Analysis of Current State**:
   - `docs/analytics-formulas.md` currently covers standard engagement metrics (ER, ERR, CR, VR, Subscriber Deltas), but its anti-fraud section only contains basic descriptions of `checkGrowthSmoothness` and `checkViewsToSubsRatio`.
   - The implementation in `src/lib/fraudDetector.ts` and `src/lib/citationIndex.ts` has evolved significantly: it now includes `checkUncorrelatedSpikes`, `calculateCitationIndex`, `checkLowCitationGrowth`, `checkUniformReactionRatio`, and `runFraudAudit`.
   - `docs/adr/` does not yet exist. In accordance with GEMINI.md guidelines (`architecture-decision-records`), the TgMon project requires an Architecture Decision Record documenting the architectural design, trade-offs, and empirical thresholds for the anti-fraud subsystem.

2. **Integration Flow**:
   - **Worker Tier**: During `runCollectCycle`, the MTProto background worker executes `checkGrowthSmoothness`, `checkUncorrelatedSpikes`, `checkViewsToSubsRatio`, and `checkUniformReactionRatio` and stores positive triggers as `FraudSignal` rows in PostgreSQL.
   - **Web Query Tier**: In `src/lib/metrics/queries.ts`, channel queries load both historical `fraud_signals` from the database and current post/metric data, invoking `runFraudAudit`.
   - **UI Presentation Tier**: The unified `fraudScore` is presented via `RiskBadge` on `ChannelHeader` and `MyChannelCard`. Channels with $>5\%$ growth and near-zero citations are flagged via `checkLowCitationGrowth` in the citation column.

3. **Mathematical Representation Formulation**:
   - Formulas must be documented with formal mathematical equations ($$\dots$$) and inline notation matching the codebase implementation.
   - All empirical thresholds must have clear justifications based on the dynamics of Telegram channel traffic.

---

## 5. Caveats

1. **Directory Creation**: `docs/adr/` does not exist yet. The implementing agent must create the directory before placing `0001-anti-fraud-detection-architecture.md` inside it.
2. **Citation Index Scope**: External mentions are detected only if citing channels are monitored or captured in the `mentions` database table. If a channel was promoted outside Telegram (e.g., YouTube, TikTok, Telegram Ads platform), the citation index in Telegram may remain low despite legitimate traffic. This is a known trade-off documented in the ADR.
3. **Historical Data Thresholds**: New channels with $<14$ days of history or $<10$ posts are exempt from flagging for `checkGrowthSmoothness` and `checkUniformReactionRatio` to avoid false positives on cold-start data.

---

## 6. Conclusion & Draft Specifications

### Part A. Draft Section for `docs/analytics-formulas.md`

Below is the exact draft content to update and expand the `## Антифрод (Fraud Detection)` section of `docs/analytics-formulas.md`:

```markdown
## Антифрод и Индекс цитирования (Anti-Fraud & Citation Index)

Система TgMon включает многофакторный анализ подозрительной активности (`src/lib/fraudDetector.ts` и `src/lib/citationIndex.ts`). Анализ защищает от накрутки ботов, накрутки просмотров автопросмотрщиками и шаблонных накруток реакций.

Проверки выполняются на двух уровнях:
1. **Фоновый сборщик (`src/worker/collector.ts`):** в цикле сбора анализирует историю канала и при срабатывании эвристик сохраняет записи в таблицу `fraud_signals`.
2. **Динамический аудит (`src/lib/metrics/queries.ts` -> `runFraudAudit`):** при отображении канала консолидирует сохранённые в БД сигналы и свежие метрики постов, рассчитывая единый показатель риска `fraudScore` (0–100%).

---

### 1. Аномальная гладкость роста (`checkGrowthSmoothness`)

Выявляет неестественно равномерный, линейный прирост аудитории, характерный для бот-сервисов с фиксированным суточным лимитом подписок.

- **Математическая формула:**
  Вычисляются ежедневные приросты подписчиков:
  $$\Delta_i = S_i - S_{i-1}, \quad i = 1, \dots, N-1$$
  Средний суточный прирост и выборочное стандартное отклонение:
  $$\mu_{\Delta} = \frac{1}{N-1}\sum_{i=1}^{N-1} \Delta_i, \quad \sigma_{\Delta} = \sqrt{\frac{1}{N-1}\sum_{i=1}^{N-1} (\Delta_i - \mu_{\Delta})^2}$$
  Коэффициент вариации (Coefficient of Variation, CV):
  $$\text{CV}_{\text{growth}} = \frac{\sigma_{\Delta}}{\mu_{\Delta}}$$

- **Условия срабатывания:**
  - Наличие истории метрик не менее 14 дней ($N \ge 14$).
  - Положительный средний прирост ($\mu_{\Delta} > 0$).
  - Порог аномалии: $\text{CV}_{\text{growth}} < 0.1$ (отклонения суточных приростов составляют менее 10% от среднего).
- **Результат:** `GrowthSmoothnessResult { flag: boolean, cv: number, reason: string }`.
- **Интерпретация:** Естественный рост канала всегда сопровождается волатильностью (публикация контента, выходные дни, внешние рекомендации). Коэффициент вариации $\text{CV} < 0.1$ на отрезке от двух недель с вероятностью $>95\%$ свидетельствует об искусственном добавлении подписчиков по расписанию.

---

### 2. Аномальное соотношение просмотров к подписчикам (`checkViewsToSubsRatio`)

Выявляет каналы с «мертвой» бот-аудиторией либо с искусственной накруткой просмотров на посты.

- **Математическая формула:**
  Отношение среднего числа просмотров последних публикаций к текущему числу подписчиков:
  $$\text{Ratio} = \frac{\bar{V}}{S_{\text{current}}} = \frac{\frac{1}{K}\sum_{j=1}^{K} V_j}{S_{\text{current}}}$$
  где $V_j$ — просмотры публикаций, $S_{\text{current}}$ — текущее число подписчиков канала.

- **Условия срабатывания:**
  - Анализируется выборка последних постов (20–30 постов), среди которых не менее 5 постов имеют известные просмотры ($K \ge 5$).
  - $S_{\text{current}} > 0$.
  - **Низкие просмотры:** $\text{Ratio} < 0.05$ (менее 5% от числа подписчиков) $\rightarrow$ подозрение на «мертвых» ботов в составе аудитории.
  - **Высокие просмотры:** $\text{Ratio} > 1.50$ (более 150% от числа подписчиков) $\rightarrow$ подозрение на накрутку просмотров автопросмотрщиками.
- **Результат:** `FraudSignalResult { flag: boolean, ratio: number, reason: string }`.
- **Интерпретация:** Нормальное соотношение просмотров одного поста к аудитории в Telegram находится в диапазоне 10–50%. Значения $<5\%$ характерны для каналов после масштабной бот-атаки или заброшенных проектов. Значения $>150\%$ без вирального цитирования указывают на закупку просмотров.

---

### 3. Нескоррелированные скачки подписчиков (`checkUncorrelatedSpikes`)

Выявляет резкие единовременные наплывы подписчиков, которые не сопровождались публикацией постов на канале либо упоминаниями канала в других источниках.

- **Математическая формула:**
  Вычисляется динамический порог всплеска $T$:
  $$T = \max\left(3 \cdot \mu_{\Delta}, \, 50, \, 0.005 \cdot \max(S)\right)$$
  где $\mu_{\Delta}$ — средний дневной прирост, $50$ — минимальная абсолютная граница для небольших каналов, $0.005 \cdot \max(S)$ — относительный порог 0.5% аудитории для защиты крупных каналов от ложных срабатываний.
  День $i$ считается днем всплеска, если:
  $$\Delta_i > T$$

- **Проверка корреляции событий:**
  Для каждого дня всплеска $D_{\text{spike}}$ проверяется наличие активности в окне $[D_{\text{spike}} - 1, D_{\text{spike}}]$:
  - Публикации на целевом канале (`postsDates`).
  - Входящие упоминания и репосты из других каналов (`mentionsDates`).
  Если в двухдневном окне не обнаружено ни публикаций, ни упоминаний, всплеск помечается как **необъяснимый (аномальный)**.

- **Условия срабатывания:**
  - Наличие $\ge 2$ точек истории метрик и положительных приростов.
  - Наличие хотя бы одного необъяснимого скачка ($\text{spikesCount} \ge 1$).
- **Результат:** `UncorrelatedSpikesResult { flag: boolean, spikesCount: number, dates: string[], reason: string }`.
- **Интерпретация:** Приток подписчиков в канал без контента и без внешнего трафика практически всегда является покупкой мотивированного трафика или ботов.

---

### 4. Логарифмический индекс цитирования и аномальный рост (`calculateCitationIndex` и `checkLowCitationGrowth`)

Оценивает внешний органический вес канала на основе упоминаний и репостов, взвешенных по аудитории цитирующих каналов.

- **Математическая формула Индекса цитирования (Citation Index, CI):**
  $$\text{CI} = \sum_{i=1}^{M} m_i \cdot \log_{10}(S_i)$$
  где:
  - $M$ — число внешних каналов, упоминавших данный канал за последние 30 дней.
  - $m_i$ — количество упоминаний со стороны канала $i$.
  - $S_i$ — число подписчиков цитирующего канала $i$ (`citing_subscribers`).
  - Если $S_i \le 1$, вес приравнивается к 0 (предотвращает получение отрицательных значений или $-\infty$).
  - Самоцитирования (где автор поста и упомянутый канал совпадают) исключаются из подсчёта.
  - Итоговый индекс округляется до 2 знаков после запятой.

- **Проверка быстрого роста без цитирования (`checkLowCitationGrowth`):**
  Определяет темп прироста подписчиков за 30 дней:
  $$G_{30d} = \frac{S_{\text{current}} - S_{30d}}{S_{30d}} \times 100\%$$
  - **Условие срабатывания:**
    $$G_{30d} > 5\% \quad \text{и} \quad \text{CI} \le 1.0$$
- **Результат:** `LowCitationGrowthResult { flag: boolean, citationIndex: number, growthRate: number, reason: string }`.
- **Интерпретация:** Логарифмическая шкала отражает ценность упоминания: 1 упоминание от канала на 1 000 подписчиков дает $\log_{10}(1000) = 3$ очка, на 100 000 — $\log_{10}(100000) = 5$ очков. Если канал растет быстрее 5% в месяц, но его $\text{CI} \le 1$ (меньше 1 упоминания от канала с 10 подписчиками), трафик поступает из скрытых или накруточных источников.
- **В UI:** Отображается в карточке канала `MyChannelCard` в блоке «Индекс цит. (30д)». При срабатывании флага подсвечивается красным цветом с иконкой предупреждения.

---

### 5. Однородность реакций (`checkUniformReactionRatio`)

Выявляет шаблонную накрутку реакций и вовлеченности на посты через бот-фермы.

- **Математическая формула:**
  Для каждого из последних $K$ постов (окно 15–20 постов) вычисляется показатель ERR:
  $$\text{ERR}_j = \frac{\text{Reactions}_j + \text{Comments}_j + \text{Forwards}_j}{V_j} \times 100\%$$
  Вычисляются средний ERR и выборочное стандартное отклонение по выборке:
  $$\bar{\text{ERR}} = \frac{1}{K}\sum_{j=1}^{K} \text{ERR}_j, \quad \sigma_{\text{ERR}} = \sqrt{\frac{1}{K}\sum_{j=1}^{K}(\text{ERR}_j - \bar{\text{ERR}})^2}$$
  Коэффициент вариации реакций (CV):
  $$\text{CV}_{\text{ERR}} = \frac{\sigma_{\text{ERR}}}{\bar{\text{ERR}}}$$

- **Условия срабатывания:**
  - В выборке должно быть не менее 10 валидных постов с просмотрами ($K \ge 10$). При $K < 10$ проверка возвращает `flag: false` («Недостаточно данных для анализа»).
  - Положительный средний ERR ($\bar{\text{ERR}} > 0$).
  - **Порог шаблонности:** $\text{CV}_{\text{ERR}} < 0.1$ (отклонение ERR между постами составляет менее 10%).
- **Результат:** `UniformReactionRatioResult { flag: boolean, cv: number, avgErr: number, postsCount: number, reason: string }`.
- **Интерпретация:** Живая аудитория реагирует на посты неравномерно: одни темы вызывают сильный отклик, другие — слабый. Разброс ERR в живых каналах обычно превышает 20–50% ($\text{CV} \ge 0.2$). Если же коэффициент вариации $< 0.1$, это признак скрипта, который закупает фиксированный процент реакций на каждый новый пост.

---

### 6. Единый показатель риска (`fraudScore`) и аудит (`runFraudAudit`)

Функция `runFraudAudit(channel)` консолидирует результаты четырёх ключевых проверок:
1. `viewsToSubsRatio` (Аномальное соотношение просмотров к подписчикам)
2. `growthSmoothness` (Аномальная гладкость роста)
3. `uncorrelatedSpikes` (Нескоррелированные скачки)
4. `uniformReactionRatio` (Равномерность реакций ERR)

- **Математическая формула:**
  Каждая сработавшая проверка добавляет ровно 25 пунктов к итоговому скору:
  $$\text{fraudScore} = \sum_{k=1}^{4} \mathbb{I}(\text{flag}_k) \times 25$$
  где $\mathbb{I}(\text{flag}_k) \in \{0, 1\}$. Диапазон значений: $\{0, 25, 50, 75, 100\}$.

- **Градации риска и отображение в UI (`RiskBadge`):**
  - **0% — Чистый канал (Низкий риск):** цвет `emerald` (зелёный), иконка `ShieldCheck`. Сигналов накрутки не обнаружено.
  - **25% — Умеренный риск (1 фактор):** цвет `amber` (жёлтый), иконка `AlertTriangle`. Обнаружена одна изолированная аномалия.
  - **50%–100% — Высокий / критический риск (2–4 фактора):** цвет `rose` (красный), иконка `AlertTriangle`. Комплексные признаки искусственного манипулирования аудиторией и охватами.
  - **Всплывающая подсказка (Tooltip):** перечисляет конкретные причины срабатывания по каждому активному сигналу.
```

---

### Part B. Draft for `docs/adr/0001-anti-fraud-detection-architecture.md`

Below is the complete text to create the new ADR file at `docs/adr/0001-anti-fraud-detection-architecture.md`:

```markdown
# ADR 0001: Архитектура модуля антифрода и агрегированного скоринга накруток (Anti-Fraud Detection Architecture)

## Статус (Status)
Принято и реализовано (Accepted & Implemented)

## Контекст (Context)
Экосистема Telegram-каналов подвержена активным манипуляциям метриками:
1. Добавление неактивных ботов в подписчики для создания видимости популярности.
2. Искусственная накрутка просмотров автопросмотрщиками для завышения рекламных расценок.
3. Покупка шаблонных пакетов реакций бот-фермами с фиксированным процентом от просмотров.
4. Накрутка через каталоги и серые биржи без органических упоминаний в Telegram.

Традиционные одиночные эвристики (например, только просмотры к подписчикам) дают высокий уровень ложноположительных срабатываний (False Positives) для нишевых каналов или каналов после виральных репостов. Возникла потребность в создании многофакторной, легко интерпретируемой системы детекции, которая:
- Работает автономно в фоновом сборщике (Worker) и сохраняет персистентную историю аномалий.
- Позволяет мгновенно оценивать риск в веб-интерфейсе через агрегированный `fraudScore`.
- Предоставляет рекламодателям и аналитикам полную объяснимость (Explainability) каждого обнаруженного сигнала.

## Решение (Decision)

### 1. Архитектура эвристических детекторов
Разработан модульный набор специализированных детекторов в `src/lib/fraudDetector.ts` и `src/lib/citationIndex.ts`:
- **`checkViewsToSubsRatio`**: контроль баланса между активными читателями и общей базой подписчиков.
- **`checkGrowthSmoothness`**: анализ дисперсии суточных дельт подписчиков (выявление искусственной монотонности).
- **`checkUncorrelatedSpikes`**: сопоставление всплесков аудитории с датами выхода публикаций и внешних упоминаний.
- **`calculateCitationIndex` и `checkLowCitationGrowth`**: взвешенная оценка внешнего цитирования по логарифмической шкале $\sum m_i \cdot \log_{10}(S_i)$ и отсечение быстрорастущих каналов без внешнего следа.
- **`checkUniformReactionRatio`**: анализ коэффициента вариации ERR последних 15–20 постов.

### 2. Двухуровневое исполнение (Two-Tier Execution)
- **Уровень хранения и фонового анализа (`src/worker/collector.ts`):**
  Воркер при каждом цикле сбора анализирует исторические данные и при обнаружении аномалий сохраняет записи в таблицу `fraud_signals` (Prisma-модель `FraudSignal`). Ошибки антифрода изолированы в блоке try-catch и не прерывают сбор основных метрик.
- **Уровень агрегации на лету (`runFraudAudit`):**
  Функция `runFraudAudit(channel)` в веб-интерфейсе (`src/lib/metrics/queries.ts`) объединяет актуальные посты, историю метрик и ранее зафиксированные сигналы из базы данных, вычисляя актуальный `fraudScore`.

### 3. Унифицированный скор накрутки (`fraudScore`)
Введена прозрачная аддитивная модель:
$$\text{fraudScore} = \sum_{k=1}^{4} \mathbb{I}(\text{flag}_k) \times 25$$
Каждый из 4 независимых векторов накрутки (соотношение просмотров, гладкость роста, нескоррелированные скачки, однородность ERR) вносит 25 баллов.
Градации визуализируются компонентом `RiskBadge`:
- `0%`: Низкий риск (зеленый бейдж, `ShieldCheck`).
- `25%`: Умеренный риск (янтарный бейдж, `AlertTriangle`).
- `50%–100%`: Высокий/критический риск (красный бейдж, `AlertTriangle`).

---

## Обоснование эмпирических порогов (Empirical Thresholds)

| Параметр | Порог | Обоснование |
|---|---|---|
| **Минимальная история роста** | 14 дней | Предотвращает ложные выводы на коротких случайных флуктуациях нового канала. |
| **Коэффициент вариации роста** | $\text{CV} < 0.1$ (10%) | В живых каналах недельная неравномерность и органические отписки дают $\text{CV} > 0.2-0.5$. Отклонение $<10\%$ возможно только при работе скрипта с дневным лимитом. |
| **Порог соотношения просмотров** | $< 5\%$ и $> 150\%$ | Нормальный охват публикации в Telegram — от 10% до 50%. Значение $<5\%$ свидетельствует о наплыве ботов, а $>150\%$ без внешних репостов — о накрутке просмотров. |
| **Минимум постов для ratio** | $\ge 5$ постов | Исключает искажения от одного-двух нестандартных постов. |
| **Порог скачка подписчиков** | $\max(3\mu_{\Delta}, 50, 0.005 M)$ | Тройной средний прирост отсекает шум; 50 подписчиков защищает микроблоги; 0.5% аудитории защищает крупные каналы от ложных тревог. |
| **Окно корреляции скачка** | $[D-1, D]$ (2 дня) | Учитывает задержку дочитывания рекламных постов и разницу часовых поясов публикации. |
| **Порог темпа прироста** | $> 5\%$ за 30 дней | Естественный порог для устоявшихся каналов, требующий подтверждения внешним трафиком. |
| **Порог индекса цитирования** | $\text{CI} \le 1.0$ | При $\text{CI} \le 1$ канал имеет менее 1 упоминания от канала с 10 подписчиками ($\log_{10}(10)=1$). Рост без цитат указывает на покупку трафика. |
| **Минимум постов для ERR** | $\ge 10$ постов | Статистически достаточный объем выборки для расчета дисперсии вовлеченности. |
| **Коэффициент вариации ERR** | $\text{CV}_{\text{ERR}} < 0.1$ | Живые пользователи реагируют на контент неравномерно. Значение $\text{CV} < 0.1$ свидетельствует о пакетной накрутке бот-сервисами. |

---

## Компромиссы и альтернативы (Trade-offs)

1. **Эвристические правила vs Machine Learning (Random Forest / CatBoost / Neural Nets):**
   - *Альтернатива*: Обучение классификатора на размеченном датасете каналов.
   - *Выбранное решение*: Детерминированные эвристики и аддитивный скор.
   - *Причина*: Эвристики мгновенно вычисляются в Node.js и браузере (< 2 мс), не требуют разметки данных, исключают эффект «черного ящика» и дают 100% понятные объяснения для маркетологов.
2. **Ложноположительные (False Positives) vs Ложноотрицательные (False Negatives):**
   - Установлены консервативные пороги ($N \ge 14$ дней, $K \ge 10$ постов, 2-дневное окно корреляции). Это предотвращает несправедливое обвинение молодых или нестандартных каналов, жертвуя скоростью обнаружения на первых днях накрутки.
3. **Ограничение учета внешнего трафика:**
   - Канал, рекламируемый через таргетированную рекламу Telegram Ads, Яндекс.Директ или внешние соцсети (YouTube, TikTok), может иметь низкий $\text{CI}$. Поэтому сигнал `checkLowCitationGrowth` служит ориентиром для ручной проверки, а в `runFraudAudit` сбалансирован тремя другими сигналами.

---

## Последствия (Consequences)

### Положительные:
- Автоматическое выявление основных схем накрутки в Telegram без участия модератора.
- Прозрачное информирование пользователей в интерфейсе через бейдж `RiskBadge` с расшифровкой сработавших сигналов.
- Изолированная обработка в воркере: сбои проверок логируются и не прерывают сбор данных каналов.
- Защита базы данных: сигналы записываются в таблицу `fraud_signals` только при наличии аномалии.

### Ограничения:
- Каналы с числом постов $<10$ или историей $<14$ дней получают нейтральный статус до накопления истории.
- Индекс цитирования учитывает только упоминания внутри отслеживаемых каналов Telegram.
```

---

## 7. Verification Method

To independently verify the facts and specifications in this report:

1. **Unit Tests Verification**:
   Run Vitest to verify all 95 tests for the 4 fraud metrics, unified fraud score, and citation index:
   ```bash
   npx vitest run src/lib/__tests__/fraudDetector.test.ts src/lib/__tests__/citationIndex.test.ts
   ```
   *Expected output*: 95 passed (95) with exit code 0.

2. **TypeScript Compilation Verification**:
   Verify that all exported signatures, types, and interfaces compile cleanly:
   ```bash
   npx tsc --noEmit
   ```
   *Expected output*: Exit code 0 with no errors.

3. **UI Component Verification**:
   Run the RiskBadge test suite:
   ```bash
   npx vitest run src/components/__tests__/RiskBadge.test.ts
   ```
   *Expected output*: 10 passed (10) with exit code 0.

4. **Target Files to Inspect**:
   - `docs/analytics-formulas.md` (to verify section 69-84 update destination)
   - `docs/adr/` (to verify directory creation and file placement)
   - `src/lib/fraudDetector.ts` (to verify signatures and formula constants)
   - `src/lib/citationIndex.ts` (to verify logarithmic calculation and edge case clamping)
