## 2026-09-13T19:06:26Z
You are a Reviewer subagent for the TgMon documentation update task.
Your working directory is: c:\TgMon\.agents\teamwork_preview_reviewer_gate_2
Project root: c:\TgMon

MANDATORY FIRST STEP: Read the full original request file at c:\TgMon\.agents\ORIGINAL_REQUEST.md before starting your review.

Your review scope:
1. Examine `src/lib/fraudDetector.ts` and `src/lib/citationIndex.ts`.
2. Verify:
   - All exported functions in `src/lib/fraudDetector.ts` (`checkViewsToSubsRatio`, `checkGrowthSmoothness`, `checkUncorrelatedSpikes`, `checkLowCitationGrowth`, `checkUniformReactionRatio`, `runFraudAudit`) have complete and accurate JSDoc comments with descriptions, `@param`, and `@returns`.
   - All exported functions in `src/lib/citationIndex.ts` (`calculateCitationIndex`, `getCitationIndexForChannel`, `getCitationIndicesForChannels`) have complete and accurate JSDoc comments.
   - All exported interfaces have valid JSDoc descriptions.
   - No type degradation, no broken types, and no runtime logic changes.
3. Run verification:
   - Run `npx tsc --noEmit` and confirm exit code 0.
   - Run `npm test` and confirm all tests pass.
4. Record your detailed evaluation and clear verdict (APPROVE or REQUEST_CHANGES) in `c:\TgMon\.agents\teamwork_preview_reviewer_gate_2\handoff.md`.
5. Send a message to your parent with your verdict and findings summary.
