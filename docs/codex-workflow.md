# Codex workflow

This document is a practical companion to the repository-level `AGENTS.md`. `AGENTS.md` is the authoritative instruction file for coding agents.

## Read before editing

Choose the smallest useful reading set for the task:

| Task area | Read first |
| --- | --- |
| Product scope or terminology | `README.md`, `docs/overview.md` |
| Architecture and module ownership | `docs/architecture.md`, `docs/codebase.md` |
| API work | `docs/api-reference.md`, relevant `src/app/api/**/route.ts` |
| Metrics or channel analytics | `docs/analytics-formulas.md`, `src/lib/metrics.ts`, related tests |
| Telegram collection | `src/worker/index.ts`, `collector.ts`, `fetcher.ts`, `persister.ts`, `retry-policy.ts` |
| Data model | `prisma/schema.prisma`, recent migrations, affected persistence code |
| Environment or release work | `.env.example`, compose files, `docs/deployment.md` |
| Git conventions | `docs/git-workflow.md` |

## Safe implementation loop

1. Restate the requested outcome and identify the affected layer or layers.
2. Inspect existing patterns and trace data from source to UI before changing contracts.
3. Implement the smallest coherent vertical slice.
4. Add or update tests close to the changed domain logic.
5. Run targeted checks, then the repository scripts appropriate to the change.
6. Inspect the diff for secrets, migrations, unintended files and behaviour gaps.
7. Summarise the result and explicitly identify checks that were not run.

## Practical check matrix

| Change | Minimum evidence |
| --- | --- |
| Pure UI component | Lint, focused component or utility tests if available, production build when practical |
| Metric or classifier | Unit tests for ordinary, zero, empty and threshold cases |
| API route | Input validation review, relevant tests, lint and build |
| Worker collector | Tests for failure isolation and partial responses; inspect retry and persistence behaviour |
| Prisma schema | Migration present, generated client succeeds, persistence code and tests updated |
| Environment or Docker | `.env.example` reviewed; relevant compose or Docker workflow validated without using real secrets |

## Guardrails

- Never copy real values from local environment files, logs or Telegram sessions into code, tests, issues or commits.
- Do not delete data, reset databases, rewrite migration history or change deployment configuration unless the task explicitly calls for it and the impact is understood.
- Preserve graceful degradation for Telegram statistics that require permissions or are unavailable for a channel.
- Prefer a clearly reported limitation to a speculative implementation.
- Keep the repository clean: no temporary patch scripts, debug dumps, build artefacts or editor-specific files.

## Agent report template

```md
## Result
- Implemented: ...
- Files: ...

## Verification
- Passed: `...`
- Not run: `...` because ...

## Data impact
- Migration: none | `migration-name`
- Compatibility / rollout notes: ...

## Risks or follow-up
- ...
```
