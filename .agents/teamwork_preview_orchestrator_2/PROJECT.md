# Project: TgMon Documentation Suite Factual Audit & Synchronization

## Architecture
- Web Application: Next.js App Router (`src/app/`, port 4000)
- Background Worker: Telegram MTProto collector & analytics (`src/worker/`)
- Database: PostgreSQL 15 with `pg_trgm` extension, Prisma ORM (`prisma/schema.prisma`)
- Docker Environment:
  - Production base: `docker-compose.yml`, `Dockerfile.web`, `Dockerfile.worker`
  - Local Dev Override: `docker-compose.dev.yml` (`.:/app` volume mount, anonymous volumes for `/app/node_modules` and `/app/.next`, `WATCHPACK_POLLING=true`, `command: npm run dev`)

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Docker Local Dev Docs | Document multi-file compose command `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build`, hot reload, volume mounts, dev commands | M1 | R1, ORIGINAL_REQUEST |
| 2 | README.md Mode 2 Synchronization | Fix outdated Mode 2 ("PostgreSQL и worker в Docker с локальным Next.js") and emphasize Docker dev mode | M1 | R1, survey explorer 1 |
| 3 | API Reference Route Factual Correction | Fix `/api/ai/trends` description to specify Watchlist (`isFavorite: true`) and My Channel (`isMine: true`) instead of generic competitors | M2 | R2, survey explorer 2 |
| 4 | Core Overview & Architecture Alignment | Align trend descriptions, worker schedulers, and update verification headers to 20 сентября 2026 года | M2 | R2, survey explorer 2 |
| 5 | Scripts Documentation Completeness | Add documentation for `backfill-subscribers.ts`, `repair-subscribers.ts`, `audit-metrics.ts`, and `fix_grouped_posts.ts` to `scripts/README.md` | M2 | R2, survey explorer 2 |
| 6 | Database Documentation & Prisma Schema | Create `docs/database.md` specifying all 15 models, `SyncStatus` enum, fields, indexes, and cascades; link from `docs/architecture.md` | M3 | R2, spec miner 1 |
| 7 | Environment Configuration Cleanup | Clean up `.env.example` to remove obsolete SQLite comments, clarify `MY_CHANNEL_USERNAME`, document 4 runtime env vars | M3 | R2, spec miner 1 |
| 8 | Date Refresh Across Documentation Suite | Update verification date headers across all docs to 20 сентября 2026 года | M1, M2, M3 | R2, all surveys |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Local Development & Docker Docs (R1) | `docs/deployment.md`, `README.md` | Survey | DONE (worker_m1) |
| 2 | Core Docs, API & Scripts Updates (R2 Core) | `docs/api-reference.md`, `docs/overview.md`, `docs/codebase.md`, `docs/analytics-formulas.md`, `docs/adr/0001-anti-fraud-detection-architecture.md`, `scripts/README.md` | Survey | DONE (worker_m2) |
| 3 | Database Docs & Environment (R2 Data) | `docs/database.md`, `docs/architecture.md`, `.env.example` | Survey | DONE (worker_m3, worker_polish) |
| 4 | Verification, Audit & Gate | Multi-agent review (Reviewers, Challengers, Forensic Auditor) and linting | M1, M2, M3 | DONE (ALL APPROVE & CLEAN) |

## Interface Contracts & Guidelines
- Russian language preserved across all user-facing and operator documentation.
- Exact multi-file Docker command: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build`.
- Code layout and existing markdown formatting conventions strictly preserved.
- Linters (`npm run lint`), TypeScript checks (`npx tsc --noEmit`), and tests (`npm test`) passed with 0 errors.

## Code Layout
- `docs/deployment.md` — Deployment and local development guide
- `README.md` — Repository landing page and quick start
- `docs/api-reference.md` — API route reference
- `docs/overview.md` — Product overview and capabilities
- `docs/architecture.md` — System architecture, data flow, and worker cycles
- `docs/codebase.md` — Codebase structure and modules
- `docs/analytics-formulas.md` — Analytics and anti-fraud mathematical formulas
- `docs/adr/` — Architecture Decision Records
- `docs/database.md` — PostgreSQL and Prisma schema specification
- `scripts/README.md` — Utility scripts documentation
- `.env.example` — Environment variables template
