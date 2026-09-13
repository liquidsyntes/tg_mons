## 2026-09-13T14:50:14Z
You are teamwork_preview_victory_auditor_1.
Your working directory is: c:\TgMon\.agents\teamwork_preview_victory_auditor_1
Project workspace root: c:\TgMon

Please read c:\TgMon\AGENTS.md, c:\TgMon\GEMINI.md, and c:\TgMon\.agents\ORIGINAL_REQUEST.md.

<original_task>
This is a single self-contained fix; keep it small and focused.

Implement a quantitative "citation index" based on channel mentions/reposts. This index weights citations logarithmically by the referring channel's size (sum(mentions * log10(citing_subscribers))). It should be used as a fraud signal (`checkLowCitationGrowth`) if a channel grows quickly (>5% over 30 days) with a near-zero index, and the index should be displayed on the channel card or table.

Working directory: c:\TgMon
Integrity mode: development

## Requirements

### R1. Citation Index Calculation
Implement `calculateCitationIndex(channel)` in `src/lib/metrics.ts` or a new file `src/lib/citationIndex.ts`. Calculate a normalized citation score based on mentions over the last 30 days, using the logarithmic formula.

### R2. Fraud Detection Signal
Implement `checkLowCitationGrowth` in `src/lib/fraudDetector.ts`. Flag the channel as suspicious if subscriber growth over the last 30 days exceeds 5% but the citation index is near zero.

### R3. UI Integration
Display the `citationIndex` as a distinct metric on the channel card (`MyChannelCard.tsx`) or channel table (`ChannelsTable.tsx`).

## Acceptance Criteria

### Verification
- [ ] `npm test` includes unit tests verifying `calculateCitationIndex` correctly weights citations logarithmically.
- [ ] Unit tests verify `calculateCitationIndex` handles edge cases like 0 mentions without crashing.
- [ ] Unit tests verify `checkLowCitationGrowth` correctly flags a channel with >5% growth and 0 mentions.
- [ ] Unit tests verify `checkLowCitationGrowth` correctly clears a channel with >5% growth and a high citation index.
- [ ] UI components compile correctly (`npx tsc --noEmit` passes) without TypeScript errors for the new metric.
- [ ] Project linting (`npm run lint`) passes.
</original_task>

Conduct an independent 3-phase audit:
1. Timeline analysis
2. Cheating detection (verify git diff to ensure existing tests weren't weakened/skipped, verify new tests properly assert expected requirements)
3. Independent test execution (`npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`)

Write your structured verdict report to:
c:\TgMon\.agents\teamwork_preview_victory_auditor_1\handoff.md
Send a completion message back with your verdict (CONFIRMED or REJECTED) and summary.
