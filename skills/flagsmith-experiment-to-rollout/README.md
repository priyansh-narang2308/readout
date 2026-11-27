# flagsmith-experiment-to-rollout

An Agent Skill that takes a coding agent through a whole Flagsmith job: **prove a change with an A/B experiment, then
roll the winner out to everyone**. Pre-registration → wiring PR → feature, metrics and experiment via the Flagsmith CLI
→ pre-flight gate → start → sample-ratio check first → decide by the pre-registered rule → rollout → cleanup PR and
archive. A human approves every irreversible step (start, rollout, end, archive).

## Why it is safe

- **Decide before data**: the decision rule is written and committed before the start; no peeking, no early winner.
- **Sample ratio first**: `scripts/srm.mjs` blocks any reading of a broken split.
- **Human gates** on every Production write; Development first; no synthetic traffic in Production.
- **No secrets**: it never runs `flagsmith auth token` or prints credentials.

## Why it is small

- `SKILL.md` is under 70 lines; details live in `references/` and load only for the step that needs them.
- Every CLI read uses `--jq` to return only the fields to check (for example `{status, rollout, split, metrics}`).
- The scripts print one line each; the agent reports one line per step.

## Files

```
SKILL.md                       the nine steps and the hard rules
references/cli-recipes.md      exact commands per step (@flagsmith/cli 2.0.0)
references/*.md                pre-registration template, pre-flight checklist, decision rules, rollback
scripts/srm.mjs                sample-ratio check, no dependencies
scripts/preflight.sh           the automated gate; exits at the first failure
tests/run.sh                   10 tests (stub CLI, no network): sh tests/run.sh
examples/readout-framing.md    the real experiment this workflow came from
```

## 60-second demo

```
> A/B test the new pricing headline, then roll out the winner.
step 1 ✓ experiments/pricing-headline.md committed (primary: checkout_started, increase; 7-day window)
step 2 ✓ PR #42 wires flag pricing_headline (default: control)
step 3 ✓ experiment created · status created · rollout off · split 50/50 · 2 metrics
step 4 ✓ preflight passed (4 automated, 5 manual)
step 5 ? Start experiment "Pricing headline" in Production? → yes → running
step 6 ✓ srm: ok (n=1840, p=0.62) · guardrails ok · window open, no decision
step 7 ✓ treatment wins by the pre-registered rule (as of day 7)
step 8 ? Roll "treatment" out to 100% in Production? → yes → done · cleanup PR #43
```

Illustrative transcript of the agent's output format, not real data.
