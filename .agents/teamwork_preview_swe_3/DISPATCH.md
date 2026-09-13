## 2026-09-13T17:48:16Z
You are the SWE Orchestrator for a single self-contained task.

Your Working Directory: c:\TgMon\.agents\teamwork_preview_swe_3
Workspace Root: c:\TgMon
Verbatim User Request: c:\TgMon\.agents\ORIGINAL_REQUEST.md (see section ## 2026-09-13T16:07:02Z)

Task Summary:
Implement a fraud detection check (`checkUniformReactionRatio`) that identifies suspiciously identical Engagement Rate by Reach (ERR) across recent posts. Then, consolidate all four fraud checks into a single `runFraudAudit` function that generates a `fraudScore` (0-100), and display this score as a "Risk of Artificial Traffic" badge on the channel card.

Context on Existing Progress:
- Initial implementation pass was completed (see handoff: `c:\TgMon\.agents\teamwork_preview_implementer_1\handoff.md`).
- Reviewer Round 1 was completed (see handoff: `c:\TgMon\.agents\teamwork_preview_reviewer_r1\handoff.md`).
- Previous orchestrator stopped due to a temporary 429 quota pause which has now fully reset.
- You are picking up execution. Carry forward the open-issues ledger from `c:\TgMon\.agents\teamwork_preview_swe_2\progress.md` and `teamwork_preview_reviewer_r1\handoff.md`, run tests to establish baseline correctness, proceed with Reviewer Round 2, Reviewer Round 3, and complete the SWE Light lifecycle.

Requirements:
- R1. Uniform ERR Detection: Implement `checkUniformReactionRatio(channel)` in `src/lib/fraudDetector.ts`. Calculate the ERR for the last 15-20 posts. Compute the Coefficient of Variation (CV). If CV < 0.1 (less than 10% deviation), flag the channel for suspicious, template-like bot reactions. Save results to `FraudSignal`. Handle cases with insufficient data (<10 posts).
- R2. Unified Fraud Score: Implement `runFraudAudit(channel)` which aggregates the results of all four existing fraud checks (views/subs ratio, smooth growth, uncorrelated spikes, uniform ERR). It should return a combined `fraudScore` from 0-100 (each of the 4 flags contributes 25 points) and a list of triggered signals.
- R3. UI Integration: Display the `fraudScore` as a "Risk of Artificial Traffic" badge on the channel card.
- R4. Unit Tests: Add unit tests with synthetic ERR series: one heterogeneous (normal) and one nearly identical (flagged).

Acceptance Criteria / Verification:
- `npm test` includes unit tests verifying `checkUniformReactionRatio` correctly calculates CV and flags series where CV < 0.1.
- Unit tests verify `checkUniformReactionRatio` handles channels with <10 posts correctly (returns insufficient data / no flag).
- Unit tests verify `runFraudAudit` returns correct combined scores (0, 25, 50, 75, 100) based on simulated trigger combinations.
- UI components compile correctly (`npx tsc --noEmit` passes) without TypeScript errors for the new badge.
- Project linting (`npm run lint`) passes with 0 errors.

Keep progress recorded in `c:\TgMon\.agents\teamwork_preview_swe_3\progress.md`. When complete, notify me with your handoff report.
