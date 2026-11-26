---
name: flagsmith-experimenter
description: >
  Design, provision, run, evaluate, and graduate feature flags and A/B experiments using Flagsmith.
  Use when creating feature flags, multivariate rollouts, or experiments in Flagsmith, integrating
  the Flagsmith SDK into client/server code, setting up Bayesian metrics, validating Sample Ratio
  Mismatch (SRM), or safely rolling out winning variants to 100% of users while retiring dead code.
allowed-tools: Bash(flagsmith:*), Bash(node:*), Bash(curl:*), Bash(python3:*)
metadata:
  author: readout-team
  version: "1.0.0"
  specification: "agentskills.io/1.0"
---

# Flagsmith Experimenter

An autonomous engineering skill for running reliable, statistically defensible A/B experiments with Flagsmith.

Designed around the **Four Pillars of Track 04**:
1. **Completes the whole job:** Covers hypothesis pre-registration → CLI/API provisioning → SDK client integration → live SRM auditing → winner rollout.
2. **Token efficiency:** Compact CLI queries (`flagsmith flag get <name> --json`), cached schemas, and progressive disclosure references (`references/`).
3. **Creative CLI usage:** Bridges the Flagsmith CLI, REST Edge API, and offline statistical scripts (`scripts/srm_check.mjs`).
4. **Safety around production changes:** Enforces a mandatory dry-run step, human confirmation gates before modifying production flags, and strict zero-SRM verification before declaring a winner.

---

## 1. Tool Routing

Choose the appropriate execution path based on available tooling:

| Environment Capability | Recommended Tool | Command Pattern |
|---|---|---|
| **Flagsmith CLI installed** | `flagsmith` CLI (v2) | `flagsmith flag list`, `flagsmith evaluate --identity <id>` |
| **Direct API access** | Edge / Core REST API | `curl -sH "X-Environment-Key: $KEY" https://edge.api.flagsmith.com/api/v1/flags/` |
| **Statistical Verification** | Bundled scripts | `node scripts/srm_check.mjs --control <n> --treatment <n>` |

---

## 2. Standard 5-Phase Workflow

### Phase 1: Pre-Registration & Metric Architecture
Before writing code or toggling flags, define the experimental protocol:
1. **Hypothesis:** State the expected causal effect: *"Changing [Variable] from [Control] to [Treatment] will [increase/decrease] [Primary Metric] without harming [Guardrail Metrics]."*
2. **Primary Metric (Decision Driver):** Aggregation `Mean` or `Occurrence`, expected direction `increase`.
3. **Guardrail Metrics (Safety Bounds):** Metrics that must not degrade (e.g., completion rate, checkout errors, bounce rate). Expected direction `not_decrease`.
4. **Sample Size & MDE:** Pre-register minimum sample size before interpreting results to prevent premature stopping (peeking fallacy).

### Phase 2: Safe Flag Provisioning (with Safety Gate)
1. Verify whether the target environment is `Development` or `Production`.
2. **SAFETY GATE:** If targeting `Production`, verify with the user before applying writes.
3. Provision the multivariate feature flag:
   ```bash
   # Inspect existing flags first
   flagsmith flag list --json
   
   # For experiments, create a multivariate flag with 50/50 split
   # Control: base value (e.g. "control")
   # Variations: treatment value (e.g. "treatment", weight 50%)
   ```
4. Define and attach metrics in Flagsmith:
   - Primary metric (M1)
   - Guardrail metrics (M2+)

### Phase 3: Client/Server SDK Integration (Zero-Confound Isolation)
When integrating the Flagsmith SDK into an application:
1. **Identities & Hashing:** Always evaluate flags against stable, anonymized user IDs:
   ```typescript
   import { createFlagsmithInstance } from '@flagsmith/flagsmith'
   
   const flagsmith = createFlagsmithInstance()
   await flagsmith.init({
     environmentID: process.env.VITE_FLAGSMITH_ENV_KEY,
     identity: userId,
     enableEvents: true, // required for experiment analytics
   })
   ```
2. **Automated Exposure Tracking:** Ensure `$flag_exposure` fires as soon as the user encounters the treatment UI, not prematurely on background loads.
3. **Event Ingestion:** Track outcome events at the point of action:
   ```typescript
   flagsmith.trackEvent('checkout_success', {
     identifier: userId,
     value: cartTotal,
   })
   await flagsmith.flushEvents()
   ```
4. **Layout & Visual Parity:** Ensure the *only* difference between treatments is the experimental variable. No unintended font, spacing, or timing confounds.

### Phase 4: Live Statistical Audit (SRM First!)
**Never interpret experiment results without checking Sample Ratio Mismatch first!**
If traffic allocated to Control vs Treatment diverges unexpectedly from 50/50, the experiment has an SRM bias (e.g., bot filtering, redirect crashes).

Run the zero-dependency SRM script:
```bash
node scripts/srm_check.mjs --control 104 --treatment 96 --ratio 50/50
```
- If `p < 0.001`: **STOP.** Flag an SRM warning. Do not declare a winner.
- If `p ≥ 0.001`: Sample ratio is statistically sound. Proceed to evaluate Bayesian win probability.

### Phase 5: Winner Rollout & Safe Code Graduation
When Flagsmith confirms a winner (>95% Win Probability with zero guardrail regressions):
1. **Graduation:** Update the feature flag to 100% rollout of the winning variant:
   ```bash
   flagsmith flag update <feature_name> --value <winning_variant> --enabled
   ```
2. **Code Cleanup:** Remove the conditional branching in application code, deleting dead variant code safely while retaining test coverage.

---

## 3. Token Efficiency Guidelines

When interacting with Flagsmith in agent turns:
- Prefer `--json` and pipe to `jq` or short node snippets rather than reading raw terminal tables.
- Use `references/cli-cheat-sheet.md` for exact syntax.
- Cache environment IDs locally in `flagsmith.json` to prevent re-querying project metadata on every turn.

---

## 4. Sub-Documents & References

- [`references/cli-cheat-sheet.md`](references/cli-cheat-sheet.md): Essential CLI commands and JSON output filtering.
- [`references/experiment-patterns.md`](references/experiment-patterns.md): Formulas for sample size, MDE, Bayesian win probability, and guardrail heuristics.
- [`references/safety-rules.md`](references/safety-rules.md): Production change gates, credential protection, and non-destructive experiment lifecycles.
