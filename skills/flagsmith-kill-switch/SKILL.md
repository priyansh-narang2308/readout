---
name: flagsmith-kill-switch
description: >
  Emergency incident response: trace a broken feature or error spike to its governing Flagsmith flag,
  immediately disable it across the Edge API, verify rollback, and generate an incident post-mortem trail.
allowed-tools: Bash(flagsmith:*), Bash(git:*), Bash(gh:*), Bash(curl:*), Bash(node:*)
metadata:
  author: readout-team
  version: "1.0.0"
  specification: "agentskills.io/1.0"
---

# Flagsmith: Put Out the Fire (Kill Switch)

Rapid incident containment without requiring emergency hotfixes, rollbacks, or redeployments.

## Workflow Steps

1. **Incident Triage:** Parse the error log or alert message to identify the failing component.
2. **Flag Resolution:** Trace the failing component back to its Flagsmith feature flag via AST / grep.
3. **Execution (Kill Switch):**
   ```bash
   flagsmith flag disable <failing_feature>
   ```
4. **Edge API Verification:** Verify that `edge.api.flagsmith.com` immediately serves `enabled: false` to clients.
5. **Incident Audit Trail:**
   - Log the incident timestamp, flag name, actor, and mitigation command.
   - Automatically open an incident tracking issue via `gh issue create`.
