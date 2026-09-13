## 2026-09-13T18:03:11Z

Your Working Directory: c:\TgMon\.agents\teamwork_preview_victory_auditor_3
Workspace Root: c:\TgMon

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

Instructions:
Conduct your independent post-victory audit (timeline verification, cheating/stub detection, independent test and build execution). Report your structured verdict (CONFIRMED or REJECTED) with full evidence to your handoff file in `c:\TgMon\.agents\teamwork_preview_victory_auditor_3\handoff.md` and message the orchestrator.
