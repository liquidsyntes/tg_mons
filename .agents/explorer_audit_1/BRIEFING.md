# BRIEFING — 2026-09-20T13:52:45Z

## Mission
Investigate Requirement R1 (Local Development & Docker changes) and audit docs/deployment.md and README.md.

## 🔒 My Identity
- Archetype: explorer
- Roles: explorer, auditor
- Working directory: c:\TgMon\.agents\explorer_audit_1
- Original parent: 6b9b89ed-37b7-4d65-8fa9-17c98562278f
- Milestone: audit-r1-docker-docs

## 🔒 Key Constraints
- Read-only investigation — do NOT implement changes to project code or docs outside .agents/explorer_audit_1
- Output handoff.md with 5 components
- Maintain progress.md heartbeat

## Current Parent
- Conversation ID: 6b9b89ed-37b7-4d65-8fa9-17c98562278f
- Updated: 2026-09-20T13:51:15Z

## Investigation State
- **Explored paths**:
  - `docker-compose.yml`
  - `docker-compose.dev.yml`
  - `Dockerfile.web`
  - `Dockerfile.worker`
  - `package.json`
  - `GEMINI.md`
  - `docs/deployment.md`
  - `README.md`
  - `git diff`
- **Key findings**:
  1. `docker-compose.dev.yml` overrides `web` command to `npm run dev` (`next dev -p 4000`), sets `NODE_ENV=development` and `WATCHPACK_POLLING=true`, mounts `.:/app` while isolating `/app/node_modules` and `/app/.next`. It overrides `worker` command to `npx tsx watch src/worker/index.ts`.
  2. `README.md` line 56 still refers to an obsolete Режим 2 ("PostgreSQL и worker в Docker с локальным Next.js"), which was removed from `docs/deployment.md`.
  3. `README.md` completely omits `docker-compose.dev.yml` and the multi-file command `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build`.
  4. `README.md` primarily instructs running on host with `npm run dev:all`, which conflicts with `GEMINI.md` guidance ("The docker-compose.yml and Dockerfile.web are configured for a production build. For local development with Hot Reload, you MUST run the web container inside Docker... Do NOT run npm run dev locally on the host machine.").
  5. `docs/deployment.md` was partially updated (added `docker compose -f ... up -d --build`), but still lacks clear migration steps for the dev Docker flow, lists host mode first, and still has an outdated verification date (17 сентября instead of 20 сентября).
- **Unexplored areas**: None regarding R1.

## Key Decisions Made
- Formulate complete, exact before/after diffs and step-by-step modification plan for `docs/deployment.md` and `README.md`.

## Artifact Index
- `c:\TgMon\.agents\explorer_audit_1\handoff.md` — Final handoff report
