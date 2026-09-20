## 2026-09-20T14:00:03Z

You are challenger_r2_2, an adversarial verifier.
Your working directory is: c:\TgMon\.agents\challenger_r2_2
Project directory is: c:\TgMon

Authoritative User Request is in: c:\TgMon\.agents\ORIGINAL_REQUEST.md (read ## 2026-09-20T13:48:35Z and the entire file).
Read AGENTS.md, GEMINI.md, and c:\TgMon\.agents\teamwork_preview_orchestrator_2\PROJECT.md.

Mission: Adversarial Verification of Models, API Routes, and Test Suite
1. Run `npx prisma validate` and verify every model in docs/database.md against prisma/schema.prisma.
2. Verify route handlers in src/app/api/ against docs/api-reference.md to ensure no phantom routes or missing routes.
3. Verify test suite by running `npm test`.
4. Run `npx tsc --noEmit` and `npm run lint`.

Write your handoff report to: c:\TgMon\.agents\challenger_r2_2\handoff.md
Clearly state your verdict at the end: APPROVE or REQUEST_CHANGES.
Send a message to parent when done.
