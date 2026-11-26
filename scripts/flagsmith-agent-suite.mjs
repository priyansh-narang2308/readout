#!/usr/bin/env node
/**
 * Flagsmith Agent Suite - Master CLI Runner
 * Track 04 · Flagsmith Agent Skills (WeMakeDevs × Flagsmith Hackathon)
 *
 * Implements all 5 suggested Track 04 workflows:
 *   1. ship-safely:   Code change to flagged gradual rollout with rollback ready
 *   2. flag-debt:     Find stale flags, remove dead code, open PR, archive flags
 *   3. kill-switch:   Trace broken feature to flag, kill it, leave audit trail
 *   4. prove-it:      Set up experiment, verify SRM, roll winner out to all
 *   5. migrate:       Inventory competitor/env setup and migrate to Flagsmith
 *
 * Usage:
 *   node scripts/flagsmith-agent-suite.mjs <workflow> [--dry-run]
 */

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const workflows = {
  'ship-safely': 'skills/flagsmith-ship-safely/scripts/ship_safely.mjs',
  'flag-debt':   'skills/flagsmith-flag-debt/scripts/clean_flag_debt.mjs',
  'kill-switch': 'skills/flagsmith-kill-switch/scripts/kill_switch.mjs',
  'prove-it':    'skills/flagsmith-experimenter/scripts/prove_it_works.mjs',
  'migrate':     'skills/flagsmith-migrator/scripts/migrate_to_flagsmith.mjs',
}

const cmd = process.argv[2]
const extraArgs = process.argv.slice(3).join(' ')

if (!cmd || cmd === '--help' || cmd === '-h' || !workflows[cmd]) {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════╗
║                  FLAGSMITH AGENT SKILLS SUITE                         ║
║         Winning Toolkit for Track 04 · Flagsmith Agent Skills         ║
╚═══════════════════════════════════════════════════════════════════════╝

Available Workflows:
  1. ship-safely    Ship a code change behind a gradual rollout + instant rollback
  2. flag-debt      Find stale flags, clean dead code, open PR, archive flags
  3. kill-switch    Emergency incident containment: kill flag + audit trail
  4. prove-it       End-to-end experiment: verify SRM + roll winner out
  5. migrate        Migrate LaunchDarkly/Unleash/Env toggles to Flagsmith

Usage:
  node scripts/flagsmith-agent-suite.mjs <workflow> [--dry-run]

Example:
  node scripts/flagsmith-agent-suite.mjs prove-it --dry-run
  node scripts/flagsmith-agent-suite.mjs ship-safely checkout_v2
  node scripts/flagsmith-agent-suite.mjs kill-switch billing_api
`)
  process.exit(cmd ? 1 : 0)
}

const targetScript = workflows[cmd]
if (!existsSync(targetScript)) {
  console.error(`Error: Script '${targetScript}' not found.`)
  process.exit(1)
}

try {
  execSync(`node ${targetScript} ${extraArgs}`, { stdio: 'inherit' })
} catch (err) {
  process.exit(err.status || 1)
}
