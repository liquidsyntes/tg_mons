# BRIEFING — 2026-09-13T19:01:30Z

## Mission
Investigate TgMon pipeline, anti-fraud modules, and unified fraudScore exposition, and provide detailed recommendations for updating architecture.md, overview.md, and README.md.

## 🔒 My Identity
- Archetype: explorer
- Roles: explorer, investigator
- Working directory: c:\TgMon\.agents\teamwork_preview_explorer_survey_2
- Original parent: a06c8c87-a15a-4cb4-8185-e793f738a58f
- Milestone: documentation-update-survey

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Inspect data collection pipeline, anti-fraud modules, unified fraudScore, and UI exposition
- Identify updates for docs/architecture.md, docs/overview.md, README.md
- Write findings to handoff.md and send message to parent

## Current Parent
- Conversation ID: a06c8c87-a15a-4cb4-8185-e793f738a58f
- Updated: 2026-09-13T19:01:30Z

## Investigation State
- **Explored paths**:
  - `README.md`, `docs/overview.md`, `docs/architecture.md`, `docs/codebase.md`, `docs/analytics-formulas.md`, `docs/api-reference.md`
  - `src/lib/fraudDetector.ts`, `src/lib/citationIndex.ts`, `src/worker/collector.ts`, `src/lib/metrics/queries.ts`
  - `src/components/RiskBadge.tsx`, `src/components/MyChannelCard.tsx`, `src/components/channel/ChannelHeader.tsx`, `src/components/channel/ChannelsDesktopTable.tsx`, `src/components/channel/ChannelsMobileList.tsx`
  - `prisma/schema.prisma`
- **Key findings**:
  - Codebase contains 4 core anti-fraud checks (`checkGrowthSmoothness`, `checkViewsToSubsRatio`, `checkUncorrelatedSpikes`, `checkUniformReactionRatio`), a citation index module with `checkLowCitationGrowth`, a unified `runFraudAudit` scoring engine (0-100), and UI badges (`RiskBadge`).
  - Worker runs 4 heuristic checks during collection and writes `fraud_signals` to PostgreSQL.
  - Web query layer executes batch citation index calculation and consolidates DB signals and dynamic checks into unified `fraudScore`.
  - UI renders `RiskBadge` ("Risk of Artificial Traffic: {score}%") with 3 color levels (green 0%, amber 1-49%, rose >=50%) and tooltip with specific flagged reasons.
  - Existing docs in `README.md`, `docs/overview.md`, and `docs/architecture.md` only document 2 legacy checks and omit `fraudScore`, `RiskBadge`, and citation index.
  - Test suite has expanded from 54 tests to 200 tests across 19 test files (all passing).
- **Unexplored areas**: None within the survey scope.

## Key Decisions Made
- Fully documented the end-to-end data pipeline from MTProto worker to DB, metrics engine, and UI presentation.
- Prepared comprehensive recommendations and Mermaid C4 component updates for `architecture.md`, `overview.md`, and `README.md`.
- Completed analysis report in `handoff.md`.

## Artifact Index
- DISPATCH.md — Incoming instructions log
- BRIEFING.md — Working memory index
- progress.md — Heartbeat and task progress
- handoff.md — Comprehensive analysis and recommendations report
