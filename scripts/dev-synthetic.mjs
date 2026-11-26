#!/usr/bin/env node
/**
 * The labelled synthetic pipeline check (12 §8.4, 28 §10 V-9, 29 F-8). DEVELOPMENT ONLY. Approval A-10: run by the
 * account owner on their own machine, with the Development environment's client-side key.
 *
 * What it does, through the app's own pinned SDK (`@flagsmith/flagsmith` 12.4.0, the same events pipeline the app uses):
 * - creates N identities named `synthetic-dev-<run>-<n>` (never a UUID, so they can't be mistaken for players);
 * - for each, resolves `readout_framing` with getExperimentFlag (which records `$flag_exposure` if enrolled);
 * - sends the four score events with a KNOWN injected difference: chance_to_win scores 5/6, control 3/6, everyone
 *   finishes, the loss call is 1 for chance_to_win and 0 for control, the near-miss call is 1 for both;
 * - F-8: every second identity sends its score batch twice, identical. Flagsmith does not de-duplicate metric events,
 *   but Mean is a per-identity average and Occurrence a per-identity flag, so the results must still equal the
 *   injected values exactly. That is the live check of the server-side assumption in 28 §7.
 * - metadata `{ scenarioSet: "synthetic-dev", synthetic: true, run }`, so `npm run impact` and any export reader
 *   rejects it as not a player.
 *
 * Expected Development results after a refresh: M1 chance_to_win 0.833 vs control 0.5; M2 1.0 both; M3 1.0 vs 0.0;
 * M4 1.0 both. Screenshot captioned "SYNTHETIC — Development — pipeline check only". Then end the Dev experiment.
 *
 * It refuses to run without `--environment development` AND `--i-understand-this-is-synthetic`, and refuses if the key
 * matches VITE_FLAGSMITH_ENV_KEY of a production build environment (VITE_FLAGSMITH_ENV_NAME=production).
 * It never prints the key.
 *
 * --f8: the DECISIVE duplicate check (the default run's duplicates repeat identical values, so per-event and
 * per-identity averaging give the same answer and F-8 cannot be told apart; found 17 Nov). Identities
 * `synthetic-dev-f8-<run>-NNN` send only `readout_score`: odd n (pattern A) one event of 1; even n (pattern B) the
 * value 0 three times, as three separate POSTs (an identical retried send). Per-identity Mean: the cohort averages
 * 0.5; per-event Mean: 0.25. The script prints A/B counts per arm so the exact mixture with earlier data can be
 * predicted under each rule.
 *
 *   FLAGSMITH_DEV_CLIENT_KEY=… node scripts/dev-synthetic.mjs --environment development --i-understand-this-is-synthetic [--n 120] [--f8]
 *   [--api <edge url> --events <events url>]   local test servers only (the unit test uses these)
 */
import { randomBytes } from 'node:crypto'
import { createFlagsmithInstance } from '@flagsmith/flagsmith/isomorphic'

export const FLAG = 'readout_framing'
export const INJECTED = {
  chance_to_win: { score: 5 / 6, loss: 1, nearMiss: 1 },
  control: { score: 3 / 6, loss: 0, nearMiss: 1 },
}

const args = process.argv.slice(2)
const opt = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const die = (msg) => {
  console.error(`dev-synthetic: ${msg}`)
  process.exit(2)
}

if (opt('--environment') !== 'development') die('refusing: pass --environment development (this script never runs against Production).')
if (!args.includes('--i-understand-this-is-synthetic')) die('refusing: pass --i-understand-this-is-synthetic.')
const key = (process.env.FLAGSMITH_DEV_CLIENT_KEY ?? '').trim()
if (!key) die('FLAGSMITH_DEV_CLIENT_KEY is not set (the Development client-side environment key).')
if (process.env.VITE_FLAGSMITH_ENV_NAME === 'production' && key === (process.env.VITE_FLAGSMITH_ENV_KEY ?? '').trim())
  die('refusing: that key is the production build key.')
const n = Number(opt('--n') ?? 120)
if (!Number.isInteger(n) || n < 2 || n > 500) die('--n must be a whole number from 2 to 500.')
const api = opt('--api')
const eventsApiUrl = opt('--events')
const lookup = opt('--lookup') // re-read the arms of an earlier run's identities, with events OFF (no exposure)
if (lookup !== undefined && !/^[0-9a-f]{6}$/.test(lookup)) die('--lookup takes the six-hex run id printed by an earlier run.')
const run = lookup ?? randomBytes(3).toString('hex')
const f8 = args.includes('--f8')
const pad = (i) => String(i).padStart(3, '0')

// Printed first, so a run that dies part-way can still be found and reconstructed (see --lookup).
console.log(`SYNTHETIC — Development — pipeline check only · run ${run}${f8 ? ' · F-8 cohort' : ''}${lookup ? ' · LOOKUP (no events sent)' : ''}`)

const tally = { chance_to_win: 0, control: 0, notEnrolled: 0, duplicates: 0, errors: 0 }
// A background send that rejects outside the loop (17 Nov: "fetch failed" killed a run and lost its counts).
process.on('unhandledRejection', (e) => {
  tally.errors++
  console.log(`background ERROR: ${String(e?.message ?? e).slice(0, 80)}`)
})
const f8Tally = { chance_to_win: { A: 0, B: 0 }, control: { A: 0, B: 0 } }
for (let i = 1; i <= n; i++) {
  const identity = `synthetic-dev-${f8 ? 'f8-' : ''}${run}-${pad(i)}`
  const pattern = f8 ? (i % 2 ? 'A' : 'B') : i % 2 ? 'single' : 'duplicated'
  let variant = null
  let stage = 'init'
  try {
    const fs = createFlagsmithInstance()
    await fs.init({
      environmentID: key,
      identity,
      cacheFlags: false,
      realtime: false,
      enableAnalytics: false,
      enableEvents: !lookup,
      ...(api ? { api } : {}),
      ...(eventsApiUrl && !lookup ? { eventProcessorConfig: { eventsApiUrl } } : {}),
    })
    if (lookup) {
      const f = fs.getExperimentFlag(FLAG) // enableEvents: false above, so no exposure can be recorded
      variant = f?.experiment?.inExperiment ? (f.variant ?? null) : null
      console.log(`${pad(i)} ${variant ?? 'not-enrolled'} ${pattern} lookup`)
      if (variant === 'chance_to_win' || variant === 'control') {
        tally[variant]++
        if (f8) f8Tally[variant][pattern]++
      } else tally.notEnrolled++
      continue
    }
    const flag = fs.getExperimentFlag(FLAG)
    variant = flag?.experiment?.inExperiment ? (flag.variant ?? null) : null
    stage = 'events'
    if (variant !== 'chance_to_win' && variant !== 'control') {
      tally.notEnrolled++
      await fs.flushEvents()
      console.log(`${pad(i)} not-enrolled ${pattern} ok`)
      continue
    }
    if (f8) {
      const metadata = { scenarioSet: 'synthetic-dev', synthetic: true, run, f8: true }
      if (pattern === 'A') {
        fs.trackEvent('readout_score', { identifier: identity, value: '1', metadata })
        await fs.flushEvents()
      } else {
        for (let k = 0; k < 3; k++) {
          fs.trackEvent('readout_score', { identifier: identity, value: '0', metadata })
          await fs.flushEvents() // three separate POSTs, like a retried send
        }
        tally.duplicates += 2
      }
      f8Tally[variant][pattern]++
    } else {
      const v = INJECTED[variant]
      const metadata = { scenarioSet: 'synthetic-dev', synthetic: true, run }
      const batch = () => {
        fs.trackEvent('readout_score', { identifier: identity, value: String(v.score), metadata })
        fs.trackEvent('readout_completed', { identifier: identity, metadata })
        fs.trackEvent('readout_loss_call', { identifier: identity, value: String(v.loss), metadata })
        fs.trackEvent('readout_near_miss_call', { identifier: identity, value: String(v.nearMiss), metadata })
      }
      batch()
      if (i % 2 === 0) {
        batch() // F-8: an identical duplicate batch
        tally.duplicates++
      }
      await fs.flushEvents()
    }
    tally[variant]++
    console.log(`${pad(i)} ${variant} ${pattern} ok`)
  } catch (e) {
    // Not retried: a failed send may still have arrived, so a retry could add an unknown duplicate. Reported instead,
    // so the run's expected values can be bounded with this identity in or out.
    tally.errors++
    console.log(`${pad(i)} ${variant ?? 'unknown'} ${pattern} ERROR at ${stage}: ${String(e?.message ?? e).slice(0, 80)}`)
  }
}

console.log(`identities: ${n} (synthetic-dev-${f8 ? 'f8-' : ''}${run}-001 … ${String(n).padStart(3, '0')})`)
console.log(`enrolled: chance_to_win ${tally.chance_to_win}, control ${tally.control}; not enrolled ${tally.notEnrolled}; errors ${tally.errors}`)
if (f8) {
  for (const arm of ['chance_to_win', 'control'])
    console.log(`F-8 ${arm}: pattern A (one 1) ${f8Tally[arm].A}, pattern B (0 sent three times) ${f8Tally[arm].B}`)
  console.log(`extra identical score events sent: ${tally.duplicates}`)
  console.log('cohort alone: per-identity Mean 0.5 if A = B; per-event Mean A / (A + 3B)')
} else {
  console.log(`duplicate batches sent (F-8): ${tally.duplicates}`)
  console.log('expected after refresh: M1 0.833 vs 0.5 · M2 1.0 vs 1.0 · M3 1.0 vs 0.0 · M4 1.0 vs 1.0 (chance_to_win vs control)')
}
if (tally.notEnrolled === n || tally.errors > 0) process.exit(1)
