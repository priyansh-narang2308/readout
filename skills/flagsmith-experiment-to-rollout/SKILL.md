---
name: flagsmith-experiment-to-rollout
description: >-
  Use when a change should be PROVEN with a Flagsmith A/B experiment before it ships to everyone: pre-register,
  wire a multivariate flag, create and verify the experiment with the Flagsmith CLI, pass a pre-flight gate, start
  it (human approval), monitor with a sample-ratio check first, decide by the pre-registered rule, roll the winner
  out (human approval), and clean the flag up. Triggers on "A/B test this", "run an experiment", "prove it works",
  "roll out the winner", "experiment then rollout", "is the split broken", "SRM".
---

# Flagsmith: experiment → rollout

One job, nine steps. Do them in order. Stop at the first failure and report it in one line.
Tested with `@flagsmith/cli` 2.0.0. Run `flagsmith <cmd> --help` before using any flag not shown here.

## Hard rules

- **Never print, echo, log or store credentials.** Never run `flagsmith auth token`. The CLI already holds the
  session (`flagsmith login`); check it with `flagsmith auth status --jq '.organisation'` only.
- **Human approval** in plain words, naming the environment and experiment, before: start, any weight change,
  rollout, ending the experiment, archiving or deleting. One approval covers one action.
- **Development first.** Production only after the same steps passed in Development.
- **No synthetic traffic or events in Production.** Never present Development numbers as real results.
- **No peeking.** While running: no weight changes, no early stop, no early decision. The only early stop is a
  failed sample-ratio check or a broken guardrail (step 6).
- **Small output.** Every read uses `--jq` to return only the fields needed. Never dump whole objects.
- If the CLI has no command for a step, use `flagsmith api` with the endpoint in `references/cli-recipes.md`.
  Never guess a flag or an endpoint; if one fails, stop and say so.

## Steps

1. **Pre-register** before any data exists. Fill `references/preregistration-template.md` into
   `experiments/<name>.md`: hypothesis, flag + two variants (control is the default), ONE primary metric and its
   direction, guardrails, minimum sample, run window, decision rule. Commit it.
2. **Wire** the code: `grep -rn` for the feature's entry point, add the flag check, default path = control.
   Open a PR with `gh pr create`. Merge before step 5.
3. **Set up in Development**: create the feature with both variants (control weight 100, treatment 0 in the
   environment default), the metrics and the experiment with its rollout **disabled**, 50/50.
   Recipes: `references/cli-recipes.md` §1–3.
4. **Pre-flight gate**: `scripts/preflight.sh <feature> <control> <treatment>` (exits non-zero on the first
   failure). Plus the manual items in `references/preflight-checklist.md`. All must pass.
5. **Start** (approval): ask "Start experiment <name> in <environment>?" Only after an explicit yes:
   recipe §4. Read back status = running.
6. **Monitor** at the planned times only. Each time, FIRST:
   `node scripts/srm.mjs --a <exposures A> --b <exposures B>`. Exit 1 = broken split → stop the experiment
   (approval), report, interpret nothing. Then check guardrails. Do not judge the primary metric yet.
7. **Decide** at the end of the window with `references/decision-rules.md`: winner / no difference / broken.
   Write the result and its as-of time into `experiments/<name>.md`.
8. **Roll out** (approval): winner → 100% (recipe §5), end the experiment, then a cleanup PR that removes the
   flag check and the losing code path. Archive the feature only after that PR is merged (recipe §6).
9. **Rollback** at any time a guardrail breaks: `references/rollback.md` (one command, control to 100%).

## Output to the user

After each step, one line: `step N ✓ <fact>` or `step N ✗ <reason> — stopped`. No raw JSON.

## Worked example

`examples/readout-framing.md`: a real experiment run with this workflow.
