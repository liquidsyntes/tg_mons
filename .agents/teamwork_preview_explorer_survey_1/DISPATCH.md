## 2026-09-13T19:00:00Z

<USER_REQUEST>
You are an Explorer subagent for the TgMon documentation update.
Your working directory is: c:\TgMon\.agents\teamwork_preview_explorer_survey_1
Project root: c:\TgMon

MANDATORY FIRST STEP: Read the full original request file at c:\TgMon\.agents\ORIGINAL_REQUEST.md before starting your investigation.

Your task:
1. Thoroughly investigate `src/lib/fraudDetector.ts` and `src/lib/citationIndex.ts` (and any related test files under `src/` or `__tests__/`).
2. Identify all exported functions, classes, interfaces, types, constants, and thresholds in both files.
3. Note the current state of JSDoc comments on every exported function and interface.
4. Extract the exact mathematical formulas and algorithm logic used for:
   - Smooth growth check
   - Uncorrelated spikes check
   - Citation index calculation (`calculateCitationIndex`: log10 weighting, normalization, edge cases) and `checkLowCitationGrowth`
   - Uniform reaction ratio / ERR check (`checkUniformReactionRatio`: ERR formula, mean, standard deviation, Coefficient of Variation CV, post count thresholds)
   - Unified fraudScore calculation (`runFraudAudit`: scoring aggregation, weights, signals)
5. Write your comprehensive technical analysis and findings to `c:\TgMon\.agents\teamwork_preview_explorer_survey_1\handoff.md`.
6. Send a message to your parent with your completion status and key findings.
</USER_REQUEST>
