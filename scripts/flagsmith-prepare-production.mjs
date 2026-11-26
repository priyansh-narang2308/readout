#!/usr/bin/env node
/**
 * Prepare (never start) the PRODUCTION experiment "Readout framing v1": create-or-verify metrics M1–M5 and the
 * experiment, CREATED and with its rollout DISABLED, then verify every field. Run by the account owner on their own
 * machine; never run by an agent.
 *
 * What it can write (apply mode only, and nothing else; the HTTP helper refuses every other write before it is built):
 *   POST /api/v1/environments/{key}/experiment-metrics/   a missing M1–M5, body exactly flagsmith/m{n}.json
 *   POST /api/v1/environments/{key}/experiments/          the experiment, if absent, with experiment_rollout.enabled false
 * It never calls start, pause, complete, rollout, results/refresh or exposures/refresh, never PATCHes, PUTs or
 * DELETEs, never updates a metric that differs (it stops and reports), never reads identities, never sends events.
 *
 * Why the rollout is created disabled: evidence/production/preparation-safety.md. Creating an experiment in v2.291.0
 * writes a live segment override with `enabled` exactly as sent; with true, about half of anyone who pressed Start
 * before launch would get chance_to_win as the practice default. With false they get exactly today's experience.
 * Start (26 Nov, after approval A-5, in the dashboard) flips it to enabled and running together.
 *
 * Secrets: FLAGSMITH_ADMIN_API_KEY (an existing organisation API key) and FLAGSMITH_PRODUCTION_ENV_KEY (the
 * Production client-side environment key) come only from environment variables, are never printed, never written, and
 * are scrubbed from the transcript. Every ID in output is replaced by a label (E, F, O, M1…M5) or "<id>": known ID
 * fields, any field named …_id/…_ids/…_uuid/…_version, any UUID-shaped string, and emails.
 *
 *   read -rs FLAGSMITH_ADMIN_API_KEY && export FLAGSMITH_ADMIN_API_KEY
 *   read -rs FLAGSMITH_PRODUCTION_ENV_KEY && export FLAGSMITH_PRODUCTION_ENV_KEY
 *   node scripts/flagsmith-prepare-production.mjs --environment production --i-confirm-production --dry-run
 *   node scripts/flagsmith-prepare-production.mjs --environment production --i-confirm-production --apply-production-prep
 *   node scripts/flagsmith-prepare-production.mjs --environment production --i-confirm-production --verify
 *
 * --dry-run  GET only. Checks the environment (named Production, in project "readout"), the flag, its default state, existing metrics, existing experiments and
 *            the warehouse, and prints the exact writes the apply run would make.
 * --verify   GET only. Requires the prepared state exactly (five metrics once, the experiment once, CREATED, M1 primary,
 *            rollout disabled at 100% with 50/50, no exposures, no results, no Production events).
 * --apply-production-prep  the only mode that writes; idempotent: what already exists and matches is not re-created.
 *
 * Exit codes: 0 verified / preview complete · 1 stopped (unexpected response, mismatch or unsafe state) · 2 refused
 * before any request. Transcript: evidence/production/api/prep-<mode>-<time>.json (sanitized).
 * Test-only: --api http://127.0.0.1:<port>/api/v1 · --env-file <path> · --timeout-ms <n> · --out <file>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const opt = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const has = (name) => args.includes(name)
const refuse = (msg) => {
  console.error(`prepare-production: REFUSED — ${msg}`)
  process.exit(2)
}

// ---------- what we expect (authoritative files in this repo) ----------
const EXPERIMENT_NAME = 'Readout framing v1'
const FLAG = 'readout_framing'
const PROJECT_NAME = 'readout'
const CONTROL = 'p_value'
const TREATMENT = 'chance_to_win'
const template = JSON.parse(readFileSync(join(ROOT, 'flagsmith/experiment.template.json'), 'utf8'))
const METRICS = [1, 2, 3, 4, 5].map((n) => {
  const def = JSON.parse(readFileSync(join(ROOT, `flagsmith/m${n}.json`), 'utf8'))
  return { label: `M${n}`, def, expected_direction: template.metrics[n - 1].expected_direction }
})
const APPROVED = { M1: 'increase', M2: 'not_decrease', M3: 'increase', M4: 'not_decrease', M5: 'increase' } // EXPERIMENT.md §6
for (const m of METRICS)
  if (m.expected_direction !== APPROVED[m.label]) refuse(`${m.label} direction in experiment.template.json is "${m.expected_direction}", approved is "${APPROVED[m.label]}".`)
const R = template.experiment_rollout
if (template.name !== EXPERIMENT_NAME || R.rollout_percentage !== 100 || R.feature_state_value?.value !== CONTROL || R.multivariate_feature_state_values?.length !== 1 || R.multivariate_feature_state_values[0].percentage_allocation !== 50)
  refuse('flagsmith/experiment.template.json no longer describes 100% rollout, control p_value, chance_to_win 50%.')

// ---------- refusals before any request ----------
if (opt('--environment') !== 'production') refuse('pass --environment production.')
if (!has('--i-confirm-production')) refuse('pass --i-confirm-production.')
const modes = ['--dry-run', '--verify', '--apply-production-prep'].filter(has)
if (modes.length !== 1) refuse('pass exactly one of --dry-run, --verify, --apply-production-prep.')
const MODE = modes[0].slice(2)
const APPLY = MODE === 'apply-production-prep'
const token = (process.env.FLAGSMITH_ADMIN_API_KEY ?? '').trim()
if (!token) refuse('FLAGSMITH_ADMIN_API_KEY is not set. Export an existing key in this shell; it is never printed.')
const envKey = (process.env.FLAGSMITH_PRODUCTION_ENV_KEY ?? '').trim()
if (!/^[A-Za-z0-9]{10,}$/.test(envKey)) refuse('FLAGSMITH_PRODUCTION_ENV_KEY is not set to an environment key. It is never printed.')
if (token === envKey) refuse('FLAGSMITH_ADMIN_API_KEY is the environment key, not an admin key.')
const envFile = opt('--env-file') ?? join(ROOT, '.env')
if (existsSync(envFile)) {
  const line = readFileSync(envFile, 'utf8').split('\n').find((l) => l.startsWith('VITE_FLAGSMITH_ENV_KEY='))
  const devKey = line ? line.slice(line.indexOf('=') + 1).trim() : ''
  if (devKey && devKey === envKey) refuse('FLAGSMITH_PRODUCTION_ENV_KEY equals the key in .env (the Development configuration).')
}
const api = (opt('--api') ?? 'https://api.flagsmith.com/api/v1').replace(/\/$/, '')
if (api !== 'https://api.flagsmith.com/api/v1' && !/^http:\/\/127\.0\.0\.1:\d+\/api\/v1$/.test(api)) refuse('--api may only be Flagsmith SaaS or a local test server.')
const timeoutMs = Number(opt('--timeout-ms') ?? 30000)

// ---------- masking ----------
const labels = new Map() // numeric id → label
const ID_KEYS = /^(id|pk|uuid|key|api_key|metric|metric_id|experiment|experiment_id|feature|feature_id|project|organisation|environment|segment|segment_ids|feature_segment|identity|identifier|author|user|multivariate_feature_option|rollout_segment)$/
const OPAQUE = /^(owners|group_owners|tags|created_by|segments|config|metadata)$/
function scrubString(s) {
  return s
    .split(envKey).join('<env-key>')
    .split(token).join('<redacted>')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
    .replace(/\/(experiments|experiment-metrics|projects|features|warehouse-connections)\/\d+/g, '/$1/<id>')
    .replace(/([?&](?:environment|feature)=)\d+/g, '$1<id>')
}
function mask(v, key = '') {
  if (OPAQUE.test(key)) return v == null ? v : '<masked>'
  // Known ID fields, plus any field named like one (…_id, …_ids, …_uuid, …_version as in environment_feature_version).
  if (ID_KEYS.test(key) || /_(id|ids|uuid|version)$/.test(key)) {
    if (typeof v === 'number') return labels.get(v) ?? '<id>'
    if (Array.isArray(v)) return v.map(() => '<id>')
    if (v && typeof v === 'object') return '<masked>'
    if (typeof v === 'string') return /^(E|F|O|M[1-5])$/.test(v) ? v : '<id>'
    return v
  }
  if (Array.isArray(v)) return v.map((x) => mask(x))
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mask(x, k)]))
  if (typeof v === 'string') return scrubString(v)
  return v
}

// ---------- transcript ----------
const transcript = { tool: 'flagsmith-prepare-production', mode: MODE, environment: 'Production', started: new Date().toISOString(), steps: [], writes: [] }
const outFile = opt('--out') ?? join(ROOT, `evidence/production/api/prep-${MODE}-${transcript.started.replace(/[:.]/g, '-')}.json`)
function save() {
  mkdirSync(dirname(outFile), { recursive: true })
  writeFileSync(outFile, JSON.stringify(mask(transcript), null, 2) + '\n')
}
const log = (s) => console.log(scrubString(s))
function stop(msg, detail) {
  transcript.stopped = msg
  if (detail !== undefined) transcript.stopDetail = detail
  save()
  console.error(`prepare-production: STOPPED — ${scrubString(msg)}`)
  if (detail !== undefined) console.error(JSON.stringify(mask(detail), null, 2))
  console.error(`Sanitized transcript: ${outFile.replace(ROOT + '/', '')}`)
  process.exit(1)
}

// ---------- HTTP, with a write allowlist ----------
const E = `/environments/${envKey}`
const ALLOWED_WRITES = [`POST ${E}/experiment-metrics/`, `POST ${E}/experiments/`]
async function call(method, path, { body, expect = [200] } = {}) {
  if (method !== 'GET') {
    // Hard guards, checked before a request exists: read-only modes send GETs only; apply sends only the two creates,
    // and an experiment only with its rollout disabled.
    if (!APPLY) stop(`${MODE} guard: refused to send ${method} ${path}`)
    if (!ALLOWED_WRITES.includes(`${method} ${path}`)) stop(`write guard: ${method} ${path} is not one of the two allowed creates`)
    if (path === `${E}/experiments/` && body?.experiment_rollout?.enabled !== false) stop('write guard: refused to create the experiment with its rollout enabled')
  }
  let res
  try {
    res = await fetch(`${api}${path}`, {
      method,
      headers: { Authorization: `Api-Key ${token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (e) {
    if (e?.name === 'TimeoutError')
      stop(`${method} ${path} got no response in ${timeoutMs / 1000} s. ${method === 'GET' ? 'Nothing was changed by this request.' : 'This create may or may not have arrived: run --dry-run before re-running.'}`)
    stop(`${method} ${path} failed before a response: ${e?.message ?? e}`)
  }
  let text
  try {
    text = await res.text()
  } catch (e) {
    stop(`${method} ${path}: the response body did not arrive (${e?.message ?? e})`)
  }
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { nonJsonBody: text.slice(0, 200) }
  }
  transcript.steps.push({ at: new Date().toISOString(), request: `${method} ${path}`, body: body ?? null, status: res.status, response: json })
  if (method !== 'GET') transcript.writes.push({ request: `${method} ${path}`, status: res.status })
  if (res.status === 401 || res.status === 403) stop(`authentication/permission failed (${res.status}) on ${method} ${path}`, json)
  if (!expect.includes(res.status)) stop(`unexpected HTTP ${res.status} on ${method} ${path} (expected ${expect.join('/')})`, json)
  return json
}
async function list(path) {
  const out = []
  let next = path
  for (let page = 0; next && page < 20; page++) {
    const json = await call('GET', next)
    if (Array.isArray(json)) return json
    if (!json || !Array.isArray(json.results)) stop(`unexpected list shape from GET ${path}`, json)
    out.push(...json.results)
    next = json.next ? json.next.replace(api, '') : null
    if (next && next.startsWith('http')) stop('pagination left the API host', { next: json.next })
  }
  return out
}

// ---------- 1. environment ----------
log(`${APPLY ? 'APPLY (creates only what is missing; never starts)' : `${MODE.toUpperCase()} (GET only, nothing is changed)`} · Flagsmith API · Production · keys from environment variables (not shown)`)
const env = await call('GET', `${E}/`)
if (!env || typeof env.name !== 'string' || typeof env.id !== 'number' || typeof env.project !== 'number') stop('environment response lacks name/id/project', env)
if (!/^production$/i.test(env.name.trim())) stop(`FLAGSMITH_PRODUCTION_ENV_KEY belongs to environment "${env.name}", not Production`)
labels.set(env.id, '<env>')
const project = await call('GET', `/projects/${env.project}/`)
if (project?.name !== PROJECT_NAME) stop(`the environment belongs to project "${project?.name}", not "${PROJECT_NAME}"`)
log(`1  project "${project.name}" · environment "${env.name}" ✓`)

// ---------- 2. the flag and its default (the experience everyone gets today) ----------
const features = (await list(`/projects/${env.project}/features/?environment=${env.id}&search=${FLAG}`)).filter((f) => f.name === FLAG)
if (features.length !== 1) stop(`expected exactly one feature named ${FLAG}, found ${features.length}`)
const feature = features[0]
labels.set(feature.id, 'F')
if (feature.type !== 'MULTIVARIATE') stop(`${FLAG} is ${feature.type}, not MULTIVARIATE`)
const options = feature.multivariate_options ?? []
const treat = options.filter((o) => o.string_value === TREATMENT)
if (options.length !== 1 || treat.length !== 1) stop(`${FLAG} must have exactly one variation, ${TREATMENT}; found ${options.map((o) => o.string_value ?? o.integer_value ?? o.boolean_value).join(', ') || 'none'}`)
const optionId = treat[0].id
labels.set(optionId, 'O')
if ((feature.num_identity_overrides ?? 0) !== 0) stop(`${FLAG} has ${feature.num_identity_overrides} identity override(s) in Production; expected 0`)
const efs = feature.environment_feature_state
if (!efs || efs.enabled !== true || efs.feature_state_value !== CONTROL) stop(`${FLAG} default in Production is not enabled with value ${CONTROL}`, efs)
const defaults = (await list(`${E}/featurestates/?feature=${feature.id}`)).filter((fs) => fs.identity == null && fs.feature_segment == null)
if (defaults.length !== 1) stop(`expected one environment default feature state for ${FLAG}, found ${defaults.length}`)
const weight = (defaults[0].multivariate_feature_state_values ?? []).find((v) => v.multivariate_feature_option === optionId)?.percentage_allocation ?? 0
if (weight !== 0) stop(`${TREATMENT} has environment weight ${weight}% in Production; expected 0 (EXPERIMENT.md §2)`)
log(`2  flag ${FLAG}: multivariate · enabled · default ${CONTROL} · ${TREATMENT} weight 0% · identity overrides 0 · segment overrides ${feature.num_segment_overrides ?? 0} ✓`)

// ---------- 3. metrics: exact match, or absent; never updated ----------
const allMetrics = await list(`${E}/experiment-metrics/`)
for (const m of METRICS) {
  const byName = allMetrics.filter((x) => x.name === m.def.name)
  const byEvent = allMetrics.filter((x) => x.definition?.event === m.def.definition.event && x.name !== m.def.name)
  if (byEvent.length) stop(`${m.label}: another metric ("${byEvent[0].name}") already measures ${m.def.definition.event}; resolve by hand, nothing is changed`)
  if (byName.length > 1) stop(`${m.label} "${m.def.name}" exists ${byName.length} times; resolve by hand, nothing is changed`)
  if (byName.length === 1) {
    const f = byName[0]
    if (f.aggregation !== m.def.aggregation || f.direction !== m.def.direction || !isDeepStrictEqual(f.definition, m.def.definition))
      stop(`${m.label} "${m.def.name}" exists but differs from flagsmith/m${m.label.slice(1)}.json; not updated`, { aggregation: f.aggregation, direction: f.direction, definition: f.definition })
    m.id = f.id
    labels.set(f.id, m.label)
  }
  log(`3  ${m.label} "${m.def.name}" · ${m.def.aggregation} · ${m.def.direction} · ${m.def.definition.event} · ${m.id ? 'exists, matches ✓' : 'absent (to create)'}`)
}
const others = allMetrics.length - METRICS.filter((m) => m.id).length
if (others) log(`3  ${others} other metric(s) exist in Production; left untouched`)

// ---------- 4. experiments ----------
async function findExperiment() {
  const all = await list(`${E}/experiments/`)
  const onFlag = all.filter((x) => x.feature?.name === FLAG)
  const foreign = onFlag.filter((x) => x.name !== EXPERIMENT_NAME)
  if (foreign.length) stop(`another experiment ("${foreign[0].name}", ${foreign[0].status}) exists on ${FLAG} in Production; nothing is changed`)
  const ours = all.filter((x) => x.name === EXPERIMENT_NAME)
  if (ours.length > 1) stop(`"${EXPERIMENT_NAME}" exists ${ours.length} times in Production; nothing is changed`)
  if (ours[0]) labels.set(ours[0].id, 'E')
  return { exp: ours[0] ?? null, otherCount: all.length - onFlag.length }
}
let { exp, otherCount } = await findExperiment()
if (otherCount) log(`4  ${otherCount} experiment(s) on other flags exist; left untouched`)
if (exp && exp.status !== 'created')
  stop(`"${EXPERIMENT_NAME}" is ${exp.status.toUpperCase()} in Production. Preparation never starts it; if this was not an approved launch, stop and investigate`)
const segOverrides = feature.num_segment_overrides ?? 0
if (segOverrides !== (exp ? 1 : 0)) stop(`${FLAG} has ${segOverrides} segment override(s); expected ${exp ? '1 (the prepared experiment’s rollout)' : '0'}`)

async function verifyExperiment(id) {
  const X = `${E}/experiments/${id}`
  const d = await call('GET', `${X}/`)
  const bad = (what) => stop(`experiment check failed: ${what}`, d)
  if (d?.name !== EXPERIMENT_NAME) bad('name')
  if (d.hypothesis !== template.hypothesis) bad('hypothesis differs from experiment.template.json')
  if (d.feature?.name !== FLAG) bad('flag')
  if (d.status !== 'created') bad(`status is ${d.status}, expected created`)
  if (d.started_at || d.ended_at) bad('it has a start or end time')
  if (!Array.isArray(d.metrics) || d.metrics.length !== 5) bad(`${d.metrics?.length} metrics attached, expected 5`)
  d.metrics.forEach((r, i) => {
    const m = METRICS[i]
    if (r.metric !== m.id) bad(`metric #${i + 1} is ${labels.get(r.metric) ?? 'unknown'}, expected ${m.label}${i === 0 ? ' (primary)' : ''}`)
    if (r.expected_direction !== m.expected_direction) bad(`${m.label} attached with ${r.expected_direction}, approved ${m.expected_direction}`)
    if ((r.aggregation && r.aggregation !== m.def.aggregation) || (r.direction && r.direction !== m.def.direction)) bad(`${m.label} attached row disagrees on aggregation/direction`)
  })
  const ro = d.experiment_rollout
  if (!ro) bad('no rollout')
  if (ro.enabled !== false) bad('rollout is ENABLED (players would be served the experiment override)')
  if (ro.rollout_percentage !== 100) bad(`rollout ${ro.rollout_percentage}%, expected 100%`)
  if (ro.feature_state_value?.value !== CONTROL) bad(`rollout control value ${ro.feature_state_value?.value}`)
  const mv = ro.multivariate_feature_state_values ?? []
  if (mv.length !== 1 || mv[0].multivariate_feature_option !== optionId || mv[0].percentage_allocation !== 50) bad(`rollout split is not ${CONTROL} 50 / ${TREATMENT} 50`)
  const exposures = (await call('GET', `${X}/exposures/`))?.exposures ?? null
  if (exposures) stop('the prepared experiment has computed exposures', exposures)
  const results = (await call('GET', `${X}/results/`))?.results ?? null
  if (results) stop('the prepared experiment has computed results', results)
  log(`4  experiment "${EXPERIMENT_NAME}" · CREATED · not started · flag ${FLAG}`)
  log('4  metrics: M1 increase (primary) · M2 not_decrease · M3 increase · M4 not_decrease · M5 increase · each once ✓')
  log(`4  rollout: DISABLED · 100% · ${CONTROL} 50 / ${TREATMENT} 50 · exposures none · results none ✓`)
}
if (exp) await verifyExperiment(exp.id)
else log(`4  experiment "${EXPERIMENT_NAME}": absent (to create)`)

// ---------- 5. warehouse (read only) ----------
const wh = await call('GET', `${E}/warehouse-connections/`)
if (!Array.isArray(wh) || wh.length !== 1) stop(`expected one warehouse connection in Production, found ${Array.isArray(wh) ? wh.length : 'a non-list'}`)
const w = wh[0]
if (w.warehouse_type !== 'flagsmith') stop(`warehouse is ${w.warehouse_type}, expected the Flagsmith-managed one`)
if ((w.total_events_received ?? 0) !== 0) stop(`Production has already received ${w.total_events_received} event(s) before launch; investigate before anything else`)
log(`5  warehouse: Flagsmith-managed · ${w.status} · 0 events (Connected only after the first real event, at launch) ✓`)

// ---------- plan ----------
const missing = METRICS.filter((m) => !m.id)
const expBody = () => ({
  feature: feature.id,
  name: EXPERIMENT_NAME,
  hypothesis: template.hypothesis,
  metrics: METRICS.map((m) => ({ metric: m.id, expected_direction: m.expected_direction })),
  experiment_rollout: {
    enabled: false, // launch-time state; Start sets it. See preparation-safety.md
    rollout_percentage: R.rollout_percentage,
    feature_state_value: R.feature_state_value,
    multivariate_feature_state_values: [{ multivariate_feature_option: optionId, percentage_allocation: 50 }],
  },
})
const plan = [
  ...missing.map((m) => ({ request: 'POST /environments/<env-key>/experiment-metrics/', body: m.def, label: m.label })),
  ...(exp ? [] : [{ request: 'POST /environments/<env-key>/experiments/', body: { ...expBody(), feature: 'F', metrics: METRICS.map((m) => ({ metric: m.label, expected_direction: m.expected_direction })), experiment_rollout: { ...expBody().experiment_rollout, multivariate_feature_state_values: [{ multivariate_feature_option: 'O', percentage_allocation: 50 }] } } }]),
]
transcript.plan = plan

if (MODE === 'verify') {
  if (plan.length) stop(`not prepared: ${missing.length} metric(s) and ${exp ? 0 : 1} experiment still to create`)
  save()
  log('VERIFY PASSED: five metrics once, experiment once, CREATED, M1 primary, rollout disabled, no exposures, no results, 0 Production events. No write was sent.')
  log(`Sanitized transcript: ${outFile.replace(ROOT + '/', '')}`)
  process.exit(0)
}
if (MODE === 'dry-run') {
  save()
  log(`DRY RUN — the apply run would make ${plan.length} create${plan.length === 1 ? '' : 's'}:`)
  plan.forEach((p, i) => log(`  ${i + 1}. ${p.request}  ${JSON.stringify(p.body)}`))
  if (!plan.length) log('  (none: everything is prepared and verified)')
  log('Never: start, pause, end, rollout changes, metric updates, deletes, events. The experiment stays CREATED with its rollout disabled.')
  log(`DRY RUN complete. No POST, PUT, PATCH or DELETE was sent. Sanitized transcript: ${outFile.replace(ROOT + '/', '')}`)
  process.exit(0)
}

// ---------- apply ----------
for (const m of missing) {
  const r = await call('POST', `${E}/experiment-metrics/`, { body: m.def, expect: [201] })
  if (typeof r?.id !== 'number' || r.name !== m.def.name || r.aggregation !== m.def.aggregation || r.direction !== m.def.direction || !isDeepStrictEqual(r.definition, m.def.definition))
    stop(`${m.label} create response does not match flagsmith/m${m.label.slice(1)}.json`, r)
  m.id = r.id
  labels.set(r.id, m.label)
  log(`6  ${m.label} created ✓`)
}
if (!exp) {
  const r = await call('POST', `${E}/experiments/`, { body: expBody(), expect: [201] })
  if (typeof r?.id !== 'number' || r.status !== 'created') stop('experiment create response is not a CREATED experiment', r)
  labels.set(r.id, 'E')
  log('6  experiment created (CREATED, rollout disabled) ✓')
}
// Re-read everything from scratch and verify.
const again = await findExperiment()
if (!again.exp) stop('the experiment is not listed after creating it')
const metricsAfter = await list(`${E}/experiment-metrics/`)
for (const m of METRICS) if (metricsAfter.filter((x) => x.name === m.def.name).length !== 1) stop(`${m.label} is not present exactly once after apply`)
await verifyExperiment(again.exp.id)
save()
log(`APPLY COMPLETE: prepared and verified. NOT started. Next: --verify, then nothing until launch (26 Nov 2026, 08:00 IST, approval A-5).`)
log(`Sanitized transcript: ${outFile.replace(ROOT + '/', '')}`)
