# Project: TgMon Documentation & Anti-Fraud Update

## Architecture
TgMon is a full-stack Telegram channel analytics and anti-fraud monitoring platform:
- Background Worker (`src/worker/`): MTProto data collection (GramJS), metrics calculation, daily materialization, heuristic fraud checks execution (`checkGrowthSmoothness`, `checkUncorrelatedSpikes`, `checkViewsToSubsRatio`, `checkUniformReactionRatio`), and database persistence into PostgreSQL `fraud_signals`.
- Domain Logic & Shared Libraries (`src/lib/`):
  - `src/lib/fraudDetector.ts`: Single-metric anomaly detectors, data parsers, and the consolidated audit function `runFraudAudit`.
  - `src/lib/citationIndex.ts`: Logarithmic citation index calculation `calculateCitationIndex` and database query helpers `getCitationIndexForChannel`, `getCitationIndicesForChannels`.
  - `src/lib/metrics/queries.ts`: Query and aggregation layer combining snapshots, posts, mentions, and calling `runFraudAudit`.
- Next.js Web UI (`src/app/`, `src/components/`): Dashboard, channel cards (`MyChannelCard`), headers (`ChannelHeader`), and channel tables displaying `RiskBadge` (unified `fraudScore`) and Citation Index (`CI`).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Architecture & Overview Docs | Document anti-fraud modules, pipeline integration, data flow, RiskBadge in `docs/architecture.md`, `docs/overview.md`, and `README.md` | M1 | Survey / R1 |
| 2 | Analytics Formulas Specification | Exact mathematical formulas for Smooth Growth, Uncorrelated Spikes, Citation Index, Uniform ERR, and unified fraudScore in `docs/analytics-formulas.md` | M2 | Survey / R2 |
| 3 | Anti-Fraud ADR | Architecture Decision Record `docs/adr/0001-anti-fraud-detection-architecture.md` covering context, decision, trade-offs, and empirical thresholds | M2 | Survey / R3 |
| 4 | Inline JSDoc for `fraudDetector.ts` | Complete JSDoc for all exported functions and interfaces in `src/lib/fraudDetector.ts` | M3 | Survey / R4 |
| 5 | Inline JSDoc for `citationIndex.ts` | Complete JSDoc for all exported functions and interfaces in `src/lib/citationIndex.ts` | M3 | Survey / R4 |
| 6 | TypeScript & Acceptance Verification | Verify `npx tsc --noEmit`, acceptance criteria, dual-review, adversarial challenge, and forensic audit | M4 | Survey / Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Architecture & Overview Docs | `docs/architecture.md`, `docs/overview.md`, `README.md` | none | DONE |
| 2 | Analytics Formulas & Anti-Fraud ADR | `docs/analytics-formulas.md`, `docs/adr/0001-anti-fraud-detection-architecture.md` | none | DONE |
| 3 | Inline JSDoc Documentation | `src/lib/fraudDetector.ts`, `src/lib/citationIndex.ts` | none | DONE |
| 4 | Verification & Quality Gate | Full verification, Reviewers (2), Challenger (2), Forensic Auditor (1) | M1, M2, M3 | DONE |

## Interface Contracts
### Documentation Standards (GEMINI.md & AGENTS.md)
- Product copy & terminology: Russian terminology for Russian UI labels, clear technical English for developer docs and JSDocs.
- Mathematical rigor: LaTeX notation ($$...$$ and $...$) in `docs/analytics-formulas.md` for all formulas.
- ADR standard: Numbered `0001-...md`, standard sections: Title, Status, Context, Decision, Empirical Thresholds, Trade-offs, Consequences.
- JSDoc standard: Standard TSDoc/JSDoc format for all exported interfaces and functions with `@param`, `@returns`, description, and mathematical logic where appropriate.

## Code Layout
- Documentation: `docs/`, `docs/adr/`, `README.md`
- Source Code: `src/lib/fraudDetector.ts`, `src/lib/citationIndex.ts`
- Tests: `src/lib/__tests__/fraudDetector.test.ts`, `src/lib/__tests__/citationIndex.test.ts`
- Agent Metadata: `.agents/`
