---
name: flagsmith-ship-safely
description: >
  Safely release a code change behind a Flagsmith feature flag with a canary rollout and rollback plan.
  Use when shipping a new feature, gating an existing route, setting up a 10% -> 50% -> 100% rollout,
  or configuring automated circuit breakers before code hits production.
allowed-tools: Bash(flagsmith:*), Bash(git:*), Bash(gh:*), Bash(node:*)
metadata:
  author: readout-team
  version: "1.0.0"
  specification: "agentskills.io/1.0"
---

# Flagsmith: Ship Safely

A complete engineering workflow for progressive, zero-downtime feature delivery.

## Workflow Steps

1. **Code Gate Inspection:** Identify the new feature code or refactor in the local git diff.
2. **Flag Provisioning:** Create the feature flag in Flagsmith with `default_enabled: false` (dark launch).
3. **Guard in Code:** Wrap the entry point with the Flagsmith SDK check:
   ```typescript
   if (flagsmith.hasFeature('new_checkout_flow')) {
     return <NewCheckoutFlow />
   }
   return <LegacyCheckoutFlow />
   ```
4. **Gradual Canary Rollout:**
   - Phase 1 (Internal): 0% public, enabled for internal testers via Identity Overrides.
   - Phase 2 (Canary): 10% segment rollout.
   - Phase 3 (Ramp): 50% rollout if error rates remain stable.
   - Phase 4 (Full): 100% rollout.
5. **Rollback Readiness:** Generate an instant 1-command killswitch command in case of production regression.

## CLI Commands

```bash
# Provision dark flag (0% rollout)
flagsmith flag update <feature_name> --value "canary" --disabled

# Enable for 10% canary segment
flagsmith flag enable <feature_name>

# Instant Rollback (if errors trigger)
flagsmith flag disable <feature_name>
```
