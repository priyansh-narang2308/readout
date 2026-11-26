---
name: flagsmith-migrator
description: >
  Migrate from homegrown toggles, environment variables, or competitor platforms (LaunchDarkly, Unleash, Split)
  to Flagsmith. Inventories existing flags, creates them in Flagsmith via CLI, and refactors SDK imports.
allowed-tools: Bash(flagsmith:*), Bash(git:*), Bash(grep:*), Bash(node:*)
metadata:
  author: readout-team
  version: "1.0.0"
  specification: "agentskills.io/1.0"
---

# Flagsmith: Move Us to Flagsmith (Migrator)

Automates the migration of legacy or competitor feature flag systems into Flagsmith.

## Workflow Steps

1. **Inventory Discovery:** Scan codebase for competitor SDK patterns:
   - LaunchDarkly: `ldClient.variation(...)`
   - Unleash: `unleash.isEnabled(...)`
   - Homegrown / Env vars: `process.env.FEATURE_*`
2. **Migration Manifest Generation:** Extract flag names, default values, and types into `flagsmith-migration.json`.
3. **Automated Flagsmith Provisioning:**
   ```bash
   flagsmith flag create <name> --value <default_val>
   ```
4. **Codebase Transformation:**
   - Uninstall legacy SDK package.
   - Install `@flagsmith/flagsmith`.
   - Update client initialization and feature checks to official Flagsmith SDK syntax.
5. **Verification:** Run test suite to verify equivalent runtime evaluation.
