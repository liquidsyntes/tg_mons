# AGENTS.md

## Project purpose

`tg_mons` is a web application for monitoring, comparing, and analysing Telegram channels. It consists of a Next.js web UI, a separate TypeScript worker that collects data through Telegram/MTProto, and a PostgreSQL database accessed with Prisma.

Primary product areas:

- Channel monitoring, historical metrics, comparison and reports
- Telegram collection jobs, authentication, retries and persistence
- Analytics: engagement, advertising, citation/network signals and fraud checks
- Operational visibility, deployment and safe handling of secrets

## Stack and layout

- Next.js App Router and TypeScript: `src/app/`
- Reusable React UI: `src/components/`
- Domain logic and shared utilities: `src/lib/`
- Background Telegram worker: `src/worker/`
- Prisma schema, migrations and seed: `prisma/`
- Unit tests: colocate in `__tests__/` directories; the repository uses Vitest
- Reference documentation: `docs/`
- Local and production containers: `docker-compose.dev.yml`, `docker-compose.yml`, `Dockerfile.web`, `Dockerfile.worker`

Before changing an unfamiliar area, inspect the nearest related module and the relevant document in `docs/`. `GEMINI.md` is existing project guidance; preserve any non-conflicting conventions from it.

## Working rules

1. Start with a small plan: state the files to inspect, the intended change, and how it will be verified.
2. Read the relevant schema, types, API route or page, and worker flow before editing. Do not infer data shapes from UI labels alone.
3. Keep a task scoped. Do not mix feature work with unrelated refactors, formatting churn, dependency upgrades, or generated-file changes.
4. Prefer existing helpers and established patterns in `src/lib/`, `src/components/`, and `src/worker/` over introducing parallel abstractions.
5. Make TypeScript types explicit at public module boundaries. Avoid `any`, unsafe casts, silent fallbacks and swallowed errors.
6. Treat Telegram/API data as incomplete and unreliable: preserve existing retry, logging and error-isolation behaviour. Optional statistics must not stop the main collection cycle.
7. Never expose credentials, sessions, API keys, connection strings or real Telegram data. Do not add `.env` files. Update `.env.example` only when a new environment variable is genuinely required, without inserting a real value.
8. Do not hand-edit generated Prisma client output, lockfiles, or migrations created by tooling unless the task specifically requires it.
9. Maintain Russian product copy and existing UI terminology where applicable. Keep identifiers, code comments and technical documentation clear and consistent with nearby code.
10. When a change modifies persisted data, include the Prisma schema change, a migration, and any required read/write updates as one coherent change. Consider nullability and backward compatibility.

## Change-specific guidance

### UI and routes

- Keep App Router boundaries clear. Use server-side access by default; introduce client components only for browser APIs, local interaction or hooks that require them.
- Reuse existing components, styling tokens and Tailwind conventions. Avoid introducing a UI framework for a narrow change.
- Include loading, empty, error and partial-data states when the feature depends on asynchronously collected channel data.
- Keep analytics calculations out of presentational components. Put reusable calculations in `src/lib/`.

### API and domain logic

- Validate request inputs at the route boundary and return deliberate HTTP status codes.
- Keep metric formulas deterministic, protect against zero denominators, missing snapshots and insufficient history.
- When thresholds or classifications are introduced, represent the result as a typed value or enum that the UI can render safely.
- Add focused unit tests for normal, empty, boundary and malformed-data cases.

### Worker and Telegram collection

- Trace the complete flow before editing: client/auth -> fetcher or collector -> persister -> Prisma.
- Keep collection idempotent where possible. Avoid duplicate snapshots or posts on retries.
- Preserve retry-policy behaviour and log contextual, non-secret diagnostic details.
- Expensive or permission-dependent Telegram statistics should be optional and must fail independently from basic collection.
- If changing scheduling or delayed snapshots, cover partially available data and newly published posts.

### Database

- Read `prisma/schema.prisma` before designing fields or relations. Match existing naming, relation and index conventions.
- Create a migration for every schema change and inspect the generated SQL before committing it.
- Seed changes must remain safe to re-run and must not contain production secrets.

## Verification

Run the narrowest useful checks first, then the broader checks relevant to the change. Use the exact scripts defined in `package.json`; do not invent commands. Typical checks include:

```bash
npm ci
npm run lint
npm test
npm run build
npx prisma generate
```

For a worker, Prisma or Docker change, also validate the applicable local service workflow from `docs/deployment.md` and the compose files. If a command cannot be run, report the exact command, reason, and residual risk.

Before finishing:

- Review `git diff` for unrelated edits, credentials, generated artifacts and accidental formatting churn.
- Confirm tests cover the changed behaviour rather than only implementation details.
- Verify schema changes include a migration.
- Update the smallest relevant document in `docs/` when behaviour, setup, API contract or operating procedure has changed.

## Git and delivery

- Work on a descriptive feature or fix branch unless the user explicitly requests direct work on `main`.
- Use concise conventional commit messages, for example `feat(metrics): add ad share` or `fix(worker): isolate stats failure`.
- In the final report, give: what changed, files changed, verification performed and not performed, data or migration impact, and any follow-up risks.
- Do not commit, push, open pull requests, modify issues, or run destructive migrations without explicit user approval.

## Definition of done

A task is complete when the requested behaviour is implemented with minimal scope, TypeScript and tests are updated as needed, relevant verification has run or is transparently reported as not run, Prisma changes have a reviewed migration, secrets are untouched, and documentation is current when users or operators need new information.
