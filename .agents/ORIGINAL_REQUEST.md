# Original User Request

## 2026-09-13T14:15:13Z

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
- [ ] Project linting (`npm run lint`) passes.

## 2026-09-13T16:07:02Z

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

## 2026-09-13T18:57:48Z

Update all project documentation (including `README.md`, files in `docs/`, and inline JSDoc comments in the codebase) to accurately reflect the current state of the TgMon project. This includes thoroughly documenting the newly implemented anti-fraud metrics (smooth growth, uncorrelated spikes, citation index, uniform ERR) and the unified `fraudScore`.

Working directory: c:\TgMon
Integrity mode: development

## Requirements

### R1. Update Architecture and Overview
Update `docs/architecture.md` and `docs/overview.md` to explain the new anti-fraud modules, the unified `fraudScore`, and how they fit into the data collection pipeline.

### R2. Update Analytics Formulas
Update `docs/analytics-formulas.md` to include the exact mathematical formulas for the new fraud metrics (e.g., CV for ERR, logarithmic citation index).

### R3. Create Anti-Fraud ADR
Create a new Architecture Decision Record (ADR) in `docs/adr/` documenting the design decisions, trade-offs, and thresholds used for the anti-fraud module.

### R4. Inline Code Documentation
Audit and update JSDoc comments in `src/lib/fraudDetector.ts` and `src/lib/citationIndex.ts` to ensure all exported functions have complete and accurate documentation.

## Acceptance Criteria

### Verification
- [ ] Programmatic: `npx tsc --noEmit` runs successfully, ensuring inline JSDoc updates did not break any TypeScript typings.
- [ ] Programmatic: A new file exists in `docs/adr/` explicitly covering the anti-fraud architecture.
- [ ] Agent-as-judge: A reviewer agent verifies that `docs/analytics-formulas.md` contains mathematical formulas for all four new fraud metrics.
- [ ] Agent-as-judge: A reviewer agent verifies that all exported functions in `src/lib/fraudDetector.ts` and `src/lib/citationIndex.ts` have valid JSDoc descriptions.

## 2026-09-20T13:48:35Z

Conduct a comprehensive review of the project's current state and update the entire documentation suite to strictly reflect factual, up-to-date information.

Working directory: c:\TgMon
Integrity mode: development

## Requirements

### R1. Document Local Development Changes
Update `docs/deployment.md` and `README.md` to clearly explain the latest Docker setup, including how Next.js is run inside Docker for local development (via `docker-compose.dev.yml`) with Hot Reload enabled.

### R2. Global Factual Audit
Audit ALL files in the `docs/` folder. Ensure everything matches the actual codebase state. Remove any outdated instructions, deprecated commands, conflicting guidelines, or speculative information. Preserve existing formatting and the Russian language.

## Acceptance Criteria

### Verification
- [ ] Agent-as-judge: A reviewer agent verifies that `docs/deployment.md` explicitly includes the correct multi-file `docker compose -f ...` command for local development.
- [ ] Agent-as-judge: A reviewer agent cross-references the updated `docs/` folder against `docker-compose.yml`, `package.json`, and the codebase to guarantee that no deprecated or contradictory instructions remain.
- [ ] Programmatic: Project formatting or linters (e.g. Markdown lint if applicable) pass successfully on the updated files.
