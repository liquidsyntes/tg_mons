## 2026-09-13T19:02:35Z

You are a Worker subagent for the TgMon documentation update task.
Your working directory is: c:\TgMon\.agents\teamwork_preview_worker_m3_1
Project root: c:\TgMon

MANDATORY FIRST STEP: Read the full original request file at c:\TgMon\.agents\ORIGINAL_REQUEST.md before starting work.
Also read the survey analysis at c:\TgMon\.agents\teamwork_preview_explorer_survey_1\handoff.md and project plan at c:\TgMon\.agents\teamwork_preview_orchestrator_1\PROJECT.md.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

EXCLUSIVE WRITE OWNERSHIP:
You exclusively own and may edit ONLY these files:
- `src/lib/fraudDetector.ts`
- `src/lib/citationIndex.ts`
Do NOT edit any files outside of these two.

YOUR TASKS:
1. Audit and update JSDoc comments in `src/lib/fraudDetector.ts`:
   - Add clear, comprehensive JSDoc comments to all 7 exported interfaces:
     - `FraudSignalResult`
     - `GrowthSmoothnessResult`
     - `UncorrelatedSpikesResult`
     - `LowCitationGrowthResult`
     - `UniformReactionRatioResult`
     - `FraudSignal`
     - `FraudAuditResult`
   - Audit and update/expand JSDoc comments on all 6 exported functions:
     - `checkViewsToSubsRatio`
     - `checkGrowthSmoothness`
     - `checkUncorrelatedSpikes`
     - `checkLowCitationGrowth`
     - `checkUniformReactionRatio`
     - `runFraudAudit`
   - Include complete descriptions, parameter `@param` documentation, return `@returns` documentation, and mathematical formula/threshold explanations in the comments.
   - CRITICAL: DO NOT modify any function signatures, runtime logic, variable names, or TypeScript types. Keep all code functioning exactly as before.

2. Audit and update JSDoc comments in `src/lib/citationIndex.ts`:
   - Add clear, comprehensive JSDoc comments to exported interfaces:
     - `CitationMention`
     - `CitationChannelInput`
   - Ensure `calculateCitationIndex` has complete and accurate JSDoc documentation.
   - Add full JSDoc comments with `@param` and `@returns` descriptions for the database helper functions:
     - `getCitationIndexForChannel`
     - `getCitationIndicesForChannels`
   - CRITICAL: DO NOT modify any function signatures, runtime logic, or TypeScript types.

3. Run verification commands:
   - Run `npx tsc --noEmit` to verify that all TypeScript types remain 100% valid with 0 errors.
   - Run `npm test` to verify that all tests in the repository continue to pass (200 tests).

4. Write your completion report to `c:\TgMon\.agents\teamwork_preview_worker_m3_1\handoff.md`. Include the output of `npx tsc --noEmit` and `npm test`.
5. Send a message to your parent with your completion status and verification results.
