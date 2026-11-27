# Prompt for Antigravity: build the Track 04 Flagsmith Agent Skill

Copy everything below the line into Antigravity.

---

You are joining a hackathon project mid-flight. Read `HANDOFF.md` in this repo first, then `EXPERIMENT.md`,
`docs/LAUNCH.md`, `scripts/flagsmith-prepare-production.mjs`, `scripts/srm.mjs` and `evidence/production/README.md`.
They describe a real Flagsmith experiment ("Readout framing v1") that we set up, verified and launched by hand. Your job
is to turn that hard-won workflow into a reusable **Agent Skill** for the Flagsmith hackathon, **Track 04 – Flagsmith
Agent Skills**.

## The track (verbatim intent)

"Coding agents now ship features, roll them out and clean up afterwards. Build an Agent Skill that takes an agent through
a whole Flagsmith job with the Flagsmith CLI: a complete workflow, not a single command. Winning skills get merged into
the official Flagsmith skills repo." The idea we are taking: **"Prove it works: set up an experiment and roll the
winner out to everyone."** Judging tip: "The CLI chains with git, gh, grep and CI, and `--json` with `--jq` fetches only
what the agent needs. Token count is judged, so keep the output small."

## What to build

A skill named `flagsmith-experiment-to-rollout` that walks an agent through the whole lifecycle, with a human approving
every irreversible step:

1. **Design**: from a change the user describes, write a pre-registration: hypothesis, the flag and its two variations,
   ONE primary metric with its expected direction, guardrails, minimum sample, run window, and the decision rule
   written *before* any data exists. Save it as `experiments/<name>.md` in the user's repo.
2. **Wire**: find where the feature lives (grep), add the flag check in code behind the variation, make sure the
   default is the control, open a PR with `gh`.
3. **Set up**: create the flag, its variations, the metrics and the experiment with the Flagsmith CLI, in
   **Development first**. Verify by reading everything back with `--json --jq` (exact counts, weights 50/50, rollout
   disabled until start).
4. **Pre-flight gate**: a checklist the agent must pass before asking to start: flag exists in the target environment,
   default = control, weights equal, primary metric attached, no existing exposures, the app build points at the right
   environment. Stop at the first failure.
5. **Start (human approval required)**: the agent asks in plain words, quoting the environment name and the experiment
   name, and only starts after an explicit yes.
6. **Monitor**: read results on a schedule with small `--jq` queries. ALWAYS check sample-ratio mismatch first
   (chi-square on the two exposure counts, p < 0.001 = broken split, stop and report; port the logic of
   `scripts/srm.mjs`). Never peek-and-stop on the primary metric before the planned window ends.
7. **Decide**: apply the pre-registered decision rule exactly: winner, no difference, or broken. Write the result into
   the pre-registration file with the as-of time.
8. **Roll out (human approval required)**: set the winner as the flag's value for 100% in the target environment, end
   the experiment, then open a cleanup PR that removes the losing branch of code and the flag check, and archives the
   flag only after the PR is merged.
9. **Rollback**: one documented command path to revert to control if a guardrail breaks.

## Hard rules for the skill (put these in SKILL.md, they are part of what we are judged on)

- Never print, echo, log or store API keys or tokens. Credentials come from the environment the CLI already uses.
- Production writes (start, weight changes, rollout, archive) always need explicit human approval for that action.
- Never send synthetic events or test traffic to Production, and never present Development data as real results.
- Never change variant weights or stop early while an experiment runs, except the SRM/guardrail stop.
- Every CLI read uses `--json` plus `--jq` to return only the needed fields. No full-object dumps.
- If a CLI command is missing for a step, say so and use the documented REST endpoint; never guess flags.

## Ground truth first (do this before writing anything)

1. Install the Flagsmith CLI and run its help for every subcommand you plan to use. **Use only commands and flags you
   actually saw in `--help` or the official Flagsmith docs.** Record the exact versions in the skill.
2. Look at the official Flagsmith skills repo and copy its layout and frontmatter conventions exactly, so the skill
   can be merged without changes.
3. Look at an existing Anthropic/agent skill (`SKILL.md` with `name` and `description` frontmatter) for the format.

## Deliverables

```
skills/flagsmith-experiment-to-rollout/
  SKILL.md              # concise: when to use, the 9 steps, approvals, hard rules; links to references
  references/
    preregistration-template.md
    preflight-checklist.md
    cli-recipes.md      # each step's exact CLI commands with --json --jq
    decision-rules.md   # SRM first, then the primary metric, guardrails, no peeking
    rollback.md
  scripts/
    srm.mjs (or .sh)    # tiny, no dependencies, prints one line
    preflight.sh        # runs the gate, exits non-zero on the first failure
  examples/
    readout-framing.md  # the real worked example: our Readout experiment, as run (no numbers until real results exist)
README.md               # one paragraph + a 60-second demo transcript
```

## Quality bar

- **Token budget**: keep SKILL.md short (under ~150 lines) and push details into `references/` that load only when
  needed. Measure the output of every recipe and trim it. Mention the token-saving choices in the README.
- **Prove it works**: run the whole flow end to end in the **Development** environment of our Flagsmith project (never
  Production), on a throwaway flag such as `skill_demo_button_text`, and save a sanitized transcript (keys and IDs
  masked) in `examples/`. Development runs are clearly labelled as Development.
- Add a short test for `srm.mjs` and `preflight.sh` (pass and fail cases).
- Keep the Readout app untouched: do not edit the 33 frozen files (`scripts/check-frozen.mjs`), do not change
  anything under `src/`, and keep CI green (`.github/workflows/ci.yml`).
- Conventional commits, small and focused, **no Co-Authored-By lines**. Never commit `.env`. Don't push without the
  owner's OK.

## Context you must not break

The Readout Production experiment is **running right now** (started 26 Nov 2026) with real players, until the final
refresh on Sun 29 Nov, 12:30 IST. Do not touch Production in Flagsmith at all while building this skill: no reads that
need new credentials, no writes, no events. Do not reveal publicly what Readout is testing (p-value vs chance to beat
control) before that time; the skill's Readout example must stay private in the repo until then, or describe it
without naming the two framings.

## Final checklist before you say "done"

- Every CLI command in the skill was run for real in Development and its output seen.
- SKILL.md frontmatter matches the official skills repo format.
- Tests pass; CI green; no secret in any file (`npm run check:secrets` passes).
- A 3-line summary for the submission: what the skill does, why it's safe (human gates, SRM first, pre-registration),
  and how small its output is.
