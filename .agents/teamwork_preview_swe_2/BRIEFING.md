# BRIEFING — 2026-09-13T16:17:30Z

## Mission
Orchestrate uniform ERR detection (`checkUniformReactionRatio`), unified fraud score (`runFraudAudit`), and UI badge on channel card following SWE Light.

## 🔒 My Identity
- Archetype: SWE Light Orchestrator
- Roles: orchestrator, user_liaison, human_reporter, successor
- Working directory: c:\TgMon\.agents\teamwork_preview_swe_2
- Original parent: parent
- Original parent conversation ID: eba9c8a0-c62a-4af4-87b1-b18f86a8b11c

## 🔒 My Workflow
- **Pattern**: SWE Light
- **Scope document**: c:\TgMon\.agents\teamwork_preview_swe_2\DISPATCH.md
1. **Decompose**: Single whole task sequentially refined by implementer and reviewers. No decomposition.
2. **Dispatch & Execute**:
   - teamwork_preview_implementer -> produces initial working diff + tests [COMPLETED]
   - teamwork_preview_reviewer (Round 1) -> tries to break diff, fixes, verifies [IN PROGRESS]
   - teamwork_preview_reviewer (Round 2) -> adversarial review and edge cases [PENDING]
   - teamwork_preview_reviewer (Round 3) -> adversarial review and edge cases [PENDING]
   - teamwork_preview_victory_auditor -> independent audit [PENDING]
3. **On failure**: Retry, replace, redistribute per SWE Light.
4. **Succession**: Spawn count >= 16.
- **Work items**:
  1. Implementer pass [done]
  2. Reviewer Round 1 [in-progress]
  3. Reviewer Round 2 [pending]
  4. Reviewer Round 3 [pending]
  5. Victory Auditor [pending]
- **Current phase**: 2
- **Current focus**: teamwork_preview_reviewer (Round 1: 7c6ae81f-8eda-4f92-82bb-f4be2b84d498)

## 🔒 Key Constraints
- NEVER write, modify, or create source code files yourself.
- NEVER explore or debug the codebase to solve the task yourself.
- Verify independently: read diffs and re-run relevant tests.
- Carry open-issues ledger across all rounds.
- Run at least 3 review rounds before victory audit.
- Propagate task verbatim.

## Current Parent
- Conversation ID: eba9c8a0-c62a-4af4-87b1-b18f86a8b11c
- Updated: 2026-09-13T16:07:43Z

## Key Decisions Made
- SWE Light pattern selected. Direct dispatch to teamwork_preview_implementer. Implementer completed. Reviewer Round 1 dispatched.

## Team Roster
| Agent | Type | Work Item | Status | Conv ID |
|-------|------|-----------|--------|---------|
| implementer_1 | teamwork_preview_implementer | Initial implementation & tests | completed | 1eb86144-70c0-4e6a-976d-408e502ed4b5 |
| reviewer_r1 | teamwork_preview_reviewer | Adversarial review Round 1 | in-progress | 7c6ae81f-8eda-4f92-82bb-f4be2b84d498 |

## Succession Status
- Succession required: no
- Spawn count: 2 / 16
- Pending subagents: 7c6ae81f-8eda-4f92-82bb-f4be2b84d498
- Predecessor: none
- Successor: not yet spawned

## Active Timers
- Heartbeat cron: 1e89a0a9-1096-46e3-ac47-59cd41239e67/task-12
- Safety timer: none

## Artifact Index
- c:\TgMon\.agents\teamwork_preview_swe_2\DISPATCH.md
- c:\TgMon\.agents\teamwork_preview_swe_2\progress.md
- c:\TgMon\.agents\teamwork_preview_swe_2\BRIEFING.md
- c:\TgMon\.agents\teamwork_preview_implementer_1\handoff.md
