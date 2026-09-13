<original_task>
This is a single self-contained fix; keep it small and focused.

Implement a fraud detection check (`checkUniformReactionRatio`) that identifies suspiciously identical Engagement Rate by Reach (ERR) across recent posts. Then, consolidate all four fraud checks into a single `runFraudAudit` function that generates a `fraudScore` (0-100), and display this score as a "Risk of Artificial Traffic" badge on the channel card.

Working directory: c:\TgMon
Integrity mode: development

## Requirements

### R1. Uniform ERR Detection
Implement `checkUniformReactionRatio(channel)` in `src/lib/fraudDetector.ts`. Calculate the ERR for the last 15-20 posts. Compute the Coefficient of Variation (CV). If CV < 0.1 (less than 10% deviation), flag the channel for suspicious, template-like bot reactions. Save results to `FraudSignal`. Handle cases with insufficient data (<10 posts).

### R2. Unified Fraud Score
Implement `runFraudAudit(channel)` which aggregates the results of all four existing fraud checks (views/subs ratio, smooth growth, uncorrelated spikes, uniform ERR). It should return a combined `fraudScore` from 0-100 (each of the 4 flags contributes 25 points) and a list of triggered signals.

### R3. UI Integration
Display the `fraudScore` as a "Risk of Artificial Traffic" badge on the channel card.

### R4. Unit Tests
Add unit tests with synthetic ERR series: one heterogeneous (normal) and one nearly identical (flagged).

## Acceptance Criteria

### Verification
- [ ] `npm test` includes unit tests verifying `checkUniformReactionRatio` correctly calculates CV and flags series where CV < 0.1.
- [ ] Unit tests verify `checkUniformReactionRatio` handles channels with <10 posts correctly (returns insufficient data / no flag).
- [ ] Unit tests verify `runFraudAudit` returns correct combined scores (0, 25, 50, 75, 100) based on simulated trigger combinations.
- [ ] UI components compile correctly (`npx tsc --noEmit` passes) without TypeScript errors for the new badge.
- [ ] Project linting (`npm run lint`) passes with 0 errors.
</original_task>

<prior_attempt>
> [!WARNING] **Skepticism Disclaimer**
> I am confident in the algorithmic math and type system correctness because 172 tests and a production build pass cleanly, but visual layout in an active browser with live Telegram stream data was not visually observed.

## 1. What I changed
- `src/lib/fraudDetector.ts`:
  - Implemented `checkUniformReactionRatio(channel)` to calculate ERR across recent 15-20 posts, compute CV ($CV = \frac{\sigma}{\mu}$), flag bot reactions where $CV < 0.1$, and return `flag: false` for channels with $<10$ posts.
  - Implemented `runFraudAudit(channel)` aggregating the 4 fraud checks (`views_to_subs_ratio`, `growth_smoothness`, `uncorrelated_spikes`, `uniform_err`), producing a 0-100 `fraudScore` (25 points per flag) and a list of `FraudSignal` objects.
  - Exported interfaces `UniformReactionRatioResult`, `FraudSignal`, and `FraudAuditResult`.
- `src/lib/types.ts`:
  - Added optional fields `fraudScore?: number | null` and `fraudSignals?: any[]` to `ChannelMetrics`.
- `src/components/RiskBadge.tsx`:
  - Created a pill badge component rendering `"Risk of Artificial Traffic: {score}%"` with risk-based color-coding (emerald 0%, amber 25%, rose 50%+) and detailed tooltip.
- `src/components/MyChannelCard.tsx`:
  - Integrated `RiskBadge` and `runFraudAudit` next to `StatusBadge` on the dashboard channel card.
- `src/components/channel/ChannelHeader.tsx`:
  - Integrated `RiskBadge` and `runFraudAudit` on the channel detail hero card.
- `src/lib/metrics/queries.ts`:
  - Updated `getOverviewStats` and `getChannelDetailStats` to run `runFraudAudit` and attach `fraudScore` and `fraudSignals` to `ChannelMetrics`.
- `src/worker/collector.ts`:
  - Added queries for reactions, comments, forwards in recent posts, ran `checkUniformReactionRatio`, and persisted flagged signals via `saveFraudSignal(channel.id, 'uniform_err', cv, reason)`.
- `src/lib/__tests__/fraudDetector.test.ts`:
  - Added 20 new unit tests covering heterogeneous vs. nearly identical ERR series, insufficient data (<10 posts), boundary conditions, zero engagement, synthetic array forms, and `runFraudAudit` scoring combinations (0, 25, 50, 75, 100).
- `c:\TgMon\.agents\teamwork_preview_implementer_1\handoff.md`:
  - Documented full implementation and verification record.

## 2. Why
- Meets requirements R1, R2, R3, R4 to detect bot reactions through uniform ERR coefficient of variation, consolidate fraud signals into a 0-100 score, and present the "Risk of Artificial Traffic" badge on the channel card.

## 3. Verification Record
- **Deep Verification (ran actual tests):**
  - Ran `npx vitest run src/lib/__tests__/fraudDetector.test.ts` (all 55 tests passed in 18ms).
  - Ran full test suite `npm test` (all 18 test files, 172 tests passed in 16.11s).
  - Ran `npx tsc --noEmit` (0 TypeScript errors).
  - Ran `npm run lint` (0 ESLint warnings or errors).
  - Ran `npm run build` (Next.js production build succeeded with static & dynamic routes compiled).
- **Shallow Verification (manual run only):**
  - Inspected generated HTML/CSS styling classes for `RiskBadge` pill radius and color rules to confirm compliance with GEMINI.md.
- **Unverified aspects:**
  - Live browser rendering with live WebSocket/Telegram updates was not visually inspected with a browser automation driver.

## 4. Known Issues
- `None` (all acceptance criteria verified through automated unit tests, compiler checks, linter, and production build).

## 5. Untested Edge Cases & Next Step
- **Untested Edge Case:** Channels where post views are extremely small integers (e.g. 1-2 views with 1 reaction leading to high ERR percentages) alongside posts with thousands of views.
- **Next Step for Reviewer:** Verify in the browser that the badge appears cleanly positioned on both the dashboard overview (`MyChannelCard`) and the channel detail view (`/channel/[id]`), and verify that hover tooltip renders the Russian diagnostic reasons correctly.
- **Handoff file:** `c:\TgMon\.agents\teamwork_preview_implementer_1\handoff.md`
</prior_attempt>

<additional_context>
Open issues ledger items:
- Live browser rendering with live WebSocket/Telegram updates was not visually inspected with a browser automation driver. (Raised by implementer_1 under Unverified aspects)
- Channels where post views are extremely small integers (e.g. 1-2 views with 1 reaction leading to high ERR percentages) alongside posts with thousands of views. (Raised by implementer_1 under Untested Edge Cases)
- Verify in the browser that the badge appears cleanly positioned on both the dashboard overview (`MyChannelCard`) and the channel detail view (`/channel/[id]`), and verify that hover tooltip renders the Russian diagnostic reasons correctly. (Raised by implementer_1 under Next Step)
</additional_context>
