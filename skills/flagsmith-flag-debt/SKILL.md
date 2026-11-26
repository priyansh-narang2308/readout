---
name: flagsmith-flag-debt
description: >
  Identify stale or 100% rolled-out feature flags, safely remove dead code paths, open a GitHub PR,
  and archive the flags in Flagsmith to eliminate technical debt.
allowed-tools: Bash(flagsmith:*), Bash(git:*), Bash(gh:*), Bash(grep:*), Bash(node:*)
metadata:
  author: readout-team
  version: "1.0.0"
  specification: "agentskills.io/1.0"
---

# Flagsmith: Get Rid of Flag Debt

Autonomous lifecycle cleanup for stale feature flags and deprecated code branches.

## Workflow Steps

1. **Flag Inventory:** Run `flagsmith flag list --json` to inspect all flags and their rollout percentages.
2. **Staleness Analysis:** Flags that are:
   - 100% enabled for > 30 days → Ready for code graduation (remove conditional, keep new code).
   - 0% enabled (disabled) for > 30 days → Ready for dead code removal (delete feature branch).
3. **Codebase Cross-Reference:** Use `grep` to locate all references to the flag in `src/`.
4. **Git Branch & Refactoring:**
   - Create branch `refactor/retire-<flag_name>`
   - Replace `if (flagsmith.hasFeature('...')) { A } else { B }` with `A`.
   - Update tests to reflect permanent feature state.
5. **PR Creation & Flag Archival:**
   - Open PR via `gh pr create` with audit log.
   - Archive the flag in Flagsmith once PR merges.
