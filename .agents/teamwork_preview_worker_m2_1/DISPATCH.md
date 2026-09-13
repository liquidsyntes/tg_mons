## 2026-09-13T19:02:35Z
You are a Worker subagent for the TgMon documentation update task.
Your working directory is: c:\TgMon\.agents\teamwork_preview_worker_m2_1
Project root: c:\TgMon

MANDATORY FIRST STEP: Read the full original request file at c:\TgMon\.agents\ORIGINAL_REQUEST.md before starting work.
Also read the survey specifications at c:\TgMon\.agents\teamwork_preview_spec_miner_survey_3\handoff.md, c:\TgMon\.agents\teamwork_preview_explorer_survey_1\handoff.md, and c:\TgMon\.agents\teamwork_preview_orchestrator_1\PROJECT.md.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

EXCLUSIVE WRITE OWNERSHIP:
You exclusively own and may edit ONLY these files/directories:
- `docs/analytics-formulas.md`
- `docs/adr/` (including creating `docs/adr/0001-anti-fraud-detection-architecture.md`)
Do NOT edit any files outside of these.

YOUR TASKS:
1. Update `docs/analytics-formulas.md`:
   - Expand the "Антифрод (Fraud Detection)" section to thoroughly document all four new fraud metrics and the unified fraud score with exact mathematical formulas (using LaTeX notation `$$...$$` and `$..$`):
     a. Smooth Growth Check (`checkGrowthSmoothness`):
        - Daily subscriber delta $\Delta_i = F_i - F_{i-1}$
        - Mean daily increment $\mu_\Delta$ and population standard deviation $\sigma_\Delta$
        - Coefficient of Variation $CV = \sigma_\Delta / \mu_\Delta$
        - Anomaly threshold: $CV < 0.1$ across $\ge 14$ days of history with $\mu_\Delta > 0$
     b. Uncorrelated Spikes Check (`checkUncorrelatedSpikes`):
        - Dynamic threshold formula $T = \max(3\mu_\Delta, 50, 0.005 \cdot F_{\max})$
        - Temporal correlation window $[D-1, D]$ (2 days) for posts and external mentions
        - Anomaly condition: subscriber jump $> T$ on day $D$ with 0 posts and 0 mentions in window
     c. Citation Index (`calculateCitationIndex`) & Low Citation Growth (`checkLowCitationGrowth`):
        - Logarithmic citation index formula: $\text{CI} = \sum (\text{count}_i \times \log_{10}(\text{subscribers}_i))$
        - Boundary handling ($\text{subscribers}_i \le 1$ clamped to weight 0), 30-day window, self-citations excluded, rounding to 2 decimal places
        - Low Citation Growth formula: 30-day subscriber growth $G_{30\text{d}} = \frac{F_{\text{now}} - F_{30\text{d}}}{F_{30\text{d}}} \times 100\%$
        - Trigger condition: $G_{30\text{d}} > 5\%$ and $\text{CI} \le 1.0$
     d. Uniform Reaction Ratio / ERR Check (`checkUniformReactionRatio`):
        - Post ERR extraction: $\text{ERR}_k = \frac{R_k + C_k + F_k}{V_k} \times 100\%$
        - Window of up to 20 recent posts (minimum 10 posts required)
        - Mean $\mu_{\text{ERR}}$, population standard deviation $\sigma_{\text{ERR}}$, and Coefficient of Variation $CV = \sigma_{\text{ERR}} / \mu_{\text{ERR}}$
        - Anomaly threshold: $CV < 0.1$ (template-like bot engagement)
     e. Unified Fraud Score (`runFraudAudit`):
        - Aggregation: $\text{fraudScore} = \sum (\text{flag}_j \times 25) \in \{0, 25, 50, 75, 100\}$
        - Risk tiers: 0% Clean (emerald), 25% Low (amber), 50% Moderate (rose), 75% High (rose), 100% Critical (rose)
        - `RiskBadge` visual mapping

2. Create `docs/adr/0001-anti-fraud-detection-architecture.md`:
   - Ensure the directory `docs/adr/` exists.
   - Write a complete, production-grade Architecture Decision Record adhering to project standards.
   - Include: Title, Status, Context, Decision, Architectural Design (Two-Tier Model: Worker background collection + PostgreSQL `fraud_signals` persistence, and Web on-the-fly `runFraudAudit` aggregation), Detailed Thresholds & Justifications ($CV < 0.1$, $N \ge 14$, $N \ge 10$, $T = \max(3\mu, 50, 0.005F_{\max})$, $G_{30\text{d}} > 5\% \land \text{CI} \le 1.0$), Alternatives Considered (e.g. ML models vs deterministic explainable heuristics), Trade-offs, and Consequences.
   - You may use the comprehensive draft in `c:\TgMon\.agents\teamwork_preview_spec_miner_survey_3\handoff.md` as reference.

3. Write your completion report to `c:\TgMon\.agents\teamwork_preview_worker_m2_1\handoff.md`.
4. Send a message to your parent with your completion status and changes summary.
