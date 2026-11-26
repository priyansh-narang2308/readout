# Flagsmith Agent Skills Suite

Official Track 04 submission for the WeMakeDevs × Flagsmith Hackathon: **"Flagsmith Agent Skills"**.

A modular, open-standard (`agentskills.io/specification`) toolkit that gives AI coding agents (Claude Code, Cursor, Antigravity) complete autonomy over the feature flag and experimentation lifecycle using the **Flagsmith CLI**, `git`, `gh`, and `grep`.

---

## The 5 Core Lifecycle Skills

We implemented **all 5 official workflows** recommended in the Flagsmith hackathon prompt:

| Skill Directory | Workflow Pattern | Description |
|---|---|---|
| [`flagsmith-ship-safely`](flagsmith-ship-safely/) | **Ship This Safely** | Progressive canary delivery: dark launch (0%) → canary (10%) → ramp (50%) → 100% GA with instant circuit-breaker rollback. |
| [`flagsmith-flag-debt`](flagsmith-flag-debt/) | **Get Rid of Flag Debt** | Automatically detects stale flags (>30 days 100% or 0%), refactors dead code branches, opens a cleanup PR, and archives flags in Flagsmith. |
| [`flagsmith-kill-switch`](flagsmith-kill-switch/) | **Put Out the Fire** | Emergency incident containment: traces a production error to its governing flag, executes instant sub-second killswitch via Edge API, and files an audit trail. |
| [`flagsmith-experimenter`](flagsmith-experimenter/) | **Prove It Works** | Full A/B testing lifecycle: hypothesis pre-registration, Pearson Chi-Square Sample Ratio Mismatch (SRM) audit, Bayesian win probability evaluation, and winner graduation. |
| [`flagsmith-migrator`](flagsmith-migrator/) | **Move Us to Flagsmith** | Automatically inventories competitor/legacy flags (LaunchDarkly, Unleash, hardcoded env vars), generates migration manifests, provisions them in Flagsmith, and rewrites SDK calls. |

---

## Unified Agent Runner CLI

Run any workflow in one command:
```bash
# Display help and available workflows
node scripts/flagsmith-agent-suite.mjs --help

# Execute workflows
node scripts/flagsmith-agent-suite.mjs ship-safely <feature_name>
node scripts/flagsmith-agent-suite.mjs flag-debt [--dry-run]
node scripts/flagsmith-agent-suite.mjs kill-switch <feature_name>
node scripts/flagsmith-agent-suite.mjs prove-it [--dry-run]
node scripts/flagsmith-agent-suite.mjs migrate [--dry-run]
```

---

## Token Efficiency Benchmark

Agents are judged on token economy. By replacing verbose terminal dumps with selective JSON extractions (`flagsmith flag get <name> --json --jq ...`) and offline statistical verification, our suite achieves an **81% to 88% token reduction** across all workflows:

- **Full Lifecycle Experimentation Run:** **~783 tokens total** (vs ~4,500 tokens for un-optimized agents).
- Benchmark log documented in [`flagsmith-experimenter/DEMO_RUN.md`](flagsmith-experimenter/DEMO_RUN.md).
