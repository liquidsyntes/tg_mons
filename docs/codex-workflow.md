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
| Telegram collection | `src/worker/index.ts`, `collector.ts`, `fetcher.ts`, `message-content.ts`, `post-mentions.ts`, `persister.ts`, `retry-policy.ts` |
| Data model | `prisma/schema.prisma`, recent migrations, affected persistence code |
| Environment or release work | `.env.example`, compose files, `docs/deployment.md` |
| Git conventions | `docs/git-workflow.md` |

Work in the main checkout (`C:\TgMon` / `/mnt/c/TgMon`) as required by GEMINI.md. Inspect branch, status and recent history first; preserve existing uncommitted work.

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
| Documentation only | Check statements against source, relative links and anchors, UTF-8, Mermaid syntax where changed, and the complete diff; do not claim fresh runtime tests without running them |
| Pure UI component | Lint, focused component or utility tests if available, production build when practical |
| Metric or classifier | Unit tests for ordinary, zero, empty and threshold cases |
| API route | Input validation review, relevant tests, lint and build |
| Worker collector | Tests for failure isolation and partial responses; inspect retry and persistence behaviour |
| Prisma schema | Migration present, generated client succeeds, persistence code and tests updated |
| Environment or Docker | `.env.example` reviewed; relevant compose or Docker workflow validated without using real secrets |

The current checks are `npx tsc --noEmit`, `npx eslint src`, `npm test`, and `npm run build`; CI uses Node.js 22. `npm run lint` still invokes the deprecated Next.js 15 lint command. `scripts/` is excluded from tsconfig and the CI lint scope, so changed maintenance scripts need separate targeted checks. For tests in a constrained environment, `npm test -- --maxWorkers=2` reduces concurrency without narrowing the suite.

## Guardrails

- Commits, pushes, PRs, merges and Docker updates require an explicit user instruction. A successful verification is not deployment authorization.
- Never copy real values from local environment files, logs or Telegram sessions into code, tests, issues or commits.
- Do not delete data, reset databases, rewrite migration history or change deployment configuration unless the task explicitly calls for it and the impact is understood.
- Preserve graceful degradation for Telegram statistics that require permissions or are unavailable for a channel.
- A Telegram dependency change must cover both web and worker, existing sessions, optional statistics, partial articles and persistence; web also invokes the collector.
- Before declaring a Docker deployment successful, verify host port mapping, the home page and the body of `/api/health`. HTTP 200 alone does not establish a successful collection cycle.
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
