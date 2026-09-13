# Plan: TgMon Documentation & Anti-Fraud Updates

## Objective
Update all TgMon project documentation (docs/architecture.md, docs/overview.md, docs/analytics-formulas.md, docs/adr/, README.md) and inline JSDoc comments in src/lib/fraudDetector.ts and src/lib/citationIndex.ts to accurately reflect the newly implemented anti-fraud metrics and unified fraudScore.

## Milestone Plan
- **M0: Survey & Exploration**
  - Explorer 1: Inspect `src/lib/fraudDetector.ts` and `src/lib/citationIndex.ts` (functions, signatures, logic, thresholds, tests).
  - Explorer 2: Inspect `docs/architecture.md`, `docs/overview.md`, `README.md`, and worker pipeline integration.
  - Spec Miner 3: Inspect `docs/adr/` (existing ADRs, numbering, template) and `docs/analytics-formulas.md` (existing formulas, formatting).
- **M1: Architecture, Overview & README Documentation (R1)**
  - Worker updates `docs/architecture.md`, `docs/overview.md`, and `README.md`.
- **M2: Analytics Formulas & Anti-Fraud ADR (R2, R3)**
  - Worker updates `docs/analytics-formulas.md` with exact formulas for all 4 fraud metrics.
  - Worker creates ADR in `docs/adr/` documenting design decisions, trade-offs, and thresholds.
- **M3: Inline JSDoc Updates & TypeScript Verification (R4)**
  - Worker audits and updates JSDoc comments on all exported functions in `src/lib/fraudDetector.ts` and `src/lib/citationIndex.ts`.
  - Worker verifies `npx tsc --noEmit` passes.
- **M4: Review & Verification Gate**
  - Reviewers review documentation clarity, formula correctness, and JSDoc completeness.
  - Challenger checks acceptance criteria and typecheck.
  - Forensic Auditor verifies integrity and absence of shortcuts or facades.
  - Final orchestrator synthesis and handoff to parent.
