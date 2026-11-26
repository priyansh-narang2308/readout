#!/usr/bin/env node
/**
 * Lightweight Flagsmith Environment Inspector.
 * Uses the official Edge API to verify flag status, multivariate split, and identity resolution.
 *
 * Usage:
 *   FLAGSMITH_KEY=... node flagsmith_inspect.mjs [--identity <id>] [--feature <name>]
 */

const key = (process.env.FLAGSMITH_KEY ?? process.env.VITE_FLAGSMITH_ENV_KEY ?? '').trim()
if (!key) {
  console.error('Error: Set FLAGSMITH_KEY or VITE_FLAGSMITH_ENV_KEY environment variable.')
  process.exit(2)
}

const args = process.argv.slice(2)
const getArg = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

const identity = getArg('--identity') ?? `agent-probe-${Date.now()}`
const targetFeature = getArg('--feature')

async function run() {
  const url = `https://edge.api.flagsmith.com/api/v1/identities/?identifier=${encodeURIComponent(identity)}`
  try {
    const res = await fetch(url, {
      headers: {
        'X-Environment-Key': key,
        'Accept': 'application/json',
      },
    })

    if (!res.ok) {
      console.error(`Edge API returned HTTP ${res.status}: ${await res.text()}`)
      process.exit(1)
    }

    const data = await res.json()
    const flags = data.flags ?? []

    const summary = flags.map((f) => ({
      name: f.feature?.name ?? f.feature_name,
      enabled: f.enabled,
      value: f.feature_state_value,
      multivariate: f.multivariate_feature_state_values?.length > 0,
    }))

    if (targetFeature) {
      const match = summary.find((f) => f.name === targetFeature)
      if (!match) {
        console.error(`Feature '${targetFeature}' not found in environment.`)
        process.exit(1)
      }
      console.log(JSON.stringify(match, null, 2))
    } else {
      console.log(JSON.stringify({ identity, totalFlags: summary.length, flags: summary }, null, 2))
    }
  } catch (err) {
    console.error(`Inspection failed: ${err.message}`)
    process.exit(1)
  }
}

run()
