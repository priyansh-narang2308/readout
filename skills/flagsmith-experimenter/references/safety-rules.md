# Production Safety & Guardrails for AI Agents

Rules to protect production stability and experimentation integrity.

---

## 1. Secrets Management
- **NEVER** write Flagsmith server-side keys or Admin API tokens to version control.
- Client-side environment keys (`VITE_FLAGSMITH_ENV_KEY`) are public by design, but should still be loaded from `.env` or CI secrets.
- Always run `check:secrets` before committing.

---

## 2. Production Change Gates
Before executing any write operation against a Flagsmith Production environment:
1. **Display Plan:** Output the exact feature name, intended action (enable, update, rollout), and target environment.
2. **Require Confirmation:** If operating as an autonomous agent, stop and request human approval before executing production writes.
3. **Rollout Verification:** Use 50/50 randomized splits for active experiments; never set 100% rollout to an unproven variation during an active test.

---

## 3. Winner Graduation Checklist
When graduating an experiment:
1. Confirm SRM is clean ($p \ge 0.001$).
2. Confirm win probability $> 95\%$ on the primary metric.
3. Confirm zero statistically significant regressions on guardrail metrics.
4. Set the feature flag to 100% rollout of the winning variant in Flagsmith.
5. In application code: refactor out the branch check, delete dead treatment code, update unit tests, and deploy.
