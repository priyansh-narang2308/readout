#!/usr/bin/env node
/**
 * Upgrade C: the impact report from a real event export (src/evidence/impact.ts has the rules it enforces).
 *
 *   npm run impact -- --file <export.json> --env production --as-of "29 Nov 2026 12:30 IST" --source "<where it came from>"
 *
 * Reads the file, prints Markdown, writes nothing and contacts nothing. Every flag is required: a number without its
 * environment, time and source can't be quoted.
 */
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { loadTs } from './load-ts.mjs'

let values
try {
  ;({ values } = parseArgs({
    options: { file: { type: 'string' }, env: { type: 'string' }, 'as-of': { type: 'string' }, source: { type: 'string' } },
  }))
} catch (e) {
  values = {}
}
const { file, env, source } = values
const asOf = values['as-of']
if (!file || !asOf || !source || (env !== 'production' && env !== 'development')) {
  console.error(
    'Usage: npm run impact -- --file <export.json> --env production|development --as-of "<time read>" --source "<where the export came from>"',
  )
  process.exit(1)
}
const [m] = await loadTs('/src/evidence/impact.ts')
try {
  const parsed = m.parseEvents(m.readExport(readFileSync(file, 'utf8')), env)
  console.log(m.report(parsed, m.impact(parsed), { env, asOf, source }))
} catch (e) {
  console.error(`impact: ${e.message}`)
  process.exit(1)
}
