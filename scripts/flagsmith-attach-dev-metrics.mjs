#!/usr/bin/env node
/**
 * Attach M2–M5 to the running DEVELOPMENT experiment "Readout framing v1", verify the attachment, refresh and read
 * the results, and check them against the events already recorded in evidence/development/validation.md.
 *
 * Run by the account owner on their own machine. Never touches Production. Never ends, pauses or edits the experiment.
 * Never creates metrics, experiments or tokens. Prints and records nothing secret: the admin credential is read only from
 * an environment variable and never printed; the environment key comes from the git-ignored .env and is never printed;
 * every ID in output is replaced by a label (E, M1…M5) or "<id>".
 *
 * Written against Flagsmith v2.291.0 (api/experimentation, tag v2.291.0):
 *   GET  /api/v1/environments/{key}/                                   environment (name check)
 *   GET  /api/v1/environments/{key}/experiment-metrics/                metrics (id, name, aggregation, direction, definition)
 *   GET  /api/v1/environments/{key}/experiments/                       experiments (name, status, feature, metrics[])
 *   GET  /api/v1/environments/{key}/experiments/{id}/                  detail; metrics[0] is what the dashboard calls primary
 *   GET  /api/v1/environments/{key}/experiments/{id}/metrics/          attached metrics (unpaginated)
 *   POST /api/v1/environments/{key}/experiments/{id}/metrics/          {"metric": <id>, "expected_direction": …} → 201
 *   GET  /api/v1/environments/{key}/experiments/{id}/results/          {"results": {as_of, refresh_requested_at, last_error_at, payload, is_final} | null}
 *   POST /api/v1/environments/{key}/experiments/{id}/results/refresh/  202; 429 within 5 minutes of the last request
 *
 * Exit codes: 0 all verified (or dry-run preview complete) · 1 stopped on an unexpected response or a failed check
 *             2 refused before any request · 3 results refresh not allowed yet (5-minute limit) or not computed in time:
 *             re-run later, nothing is lost
 *
 *   export FLAGSMITH_ADMIN_API_KEY=…            # an existing organisation API key (never pasted into chat or a file)
 *   node scripts/flagsmith-attach-dev-metrics.mjs --environment development --i-confirm-development --dry-run
 *   node scripts/flagsmith-attach-dev-metrics.mjs --environment development --i-confirm-development
 *
 * --dry-run: GET requests only. Verifies the environment, the running experiment, the existing metrics and that M1 is
 * attached and primary, then prints the exact writes the apply run would make, and exits. The HTTP helper refuses any
 * method but GET in this mode before a request is built, so no POST, PUT, PATCH or DELETE can leave the machine.
 *
 * --audit: GET requests only, for after the experiment has been ended. Verifies the experiment is completed, all five
 * metrics are attached once with the approved directions and M1 primary, and the final results still match the recorded
 * events. Same write guard as --dry-run.
 *
 * Options: --auth-scheme Api-Key|Token (default Api-Key; Token for a personal API token) · --no-refresh (attach and verify
 * only) · --out <file> (sanitized transcript; default evidence/development/api/attach-[dryrun-]<time>.json)
 * Test-only: --api http://127.0.0.1:<port>/api/v1 · --env-file <path> · --poll-ms <n> · --poll-max <n> · --timeout-ms <n>
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const opt = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const has = (name) => args.includes(name)
const refuse = (msg) => {
  console.error(`attach-dev-metrics: REFUSED — ${msg}`)
  process.exit(2)
}

// ---------- what we expect (authoritative files in this repo) ----------
const EXPERIMENT_NAME = 'Readout framing v1'
const FLAG = 'readout_framing'
const template = JSON.parse(readFileSync(join(ROOT, 'flagsmith/experiment.template.json'), 'utf8'))
const METRICS = [1, 2, 3, 4, 5].map((n) => {
  const m = JSON.parse(readFileSync(join(ROOT, `flagsmith/m${n}.json`), 'utf8'))
  return { label: `M${n}`, ...m, expected_direction: template.metrics[n - 1].expected_direction }
})
// Approved roles (EXPERIMENT.md §6). The template must agree; if it doesn't, stop rather than guess.
const APPROVED = { M1: 'increase', M2: 'not_decrease', M3: 'increase', M4: 'not_decrease', M5: 'increase' }
for (const m of METRICS)
  if (m.expected_direction !== APPROVED[m.label])
    refuse(`${m.label} expected_direction in experiment.template.json is "${m.expected_direction}", approved is "${APPROVED[m.label]}".`)

/**
 * What Flagsmith must report if the Development events recorded before attachment are included
 * (evidence/development/validation.md; v2.291.0 results_query.py: n = all exposed, unquarantined identities;
 * Occurrence = 1 per identity with ≥1 event after first exposure; Mean = per-identity average, no event counts 0).
 * Control: 2 devval plays (pane 4/6, headless 1/6) + synthetic 53 + F-8 cohort 85 (A 41, B 44).
 * chance_to_win: 1 devval play (1/6) + synthetic 67 + F-8 cohort 82 (A 43, B 39; identity 168 never exposed).
 * Both devval headless plays answered S2 "distrust" and S3 "ship" (MEASURED_ORDER S3,S1,S5,S2,S4,S6, keys 1,2,3,4,1,2);
 * the pane play answered S2 "distrust", S3 "collecting" and copied the Rules.
 */
const EXPECTED = {
  n: { control: 140, chance_to_win: 150 },
  sum: {
    M1: { control: 27.3333333 + 41, chance_to_win: 56 + 43 },
    M2: { control: 55, chance_to_win: 68 }, // raw readout_completed events would be 55 + duplicates: per-identity check
    M3: { control: 0, chance_to_win: 67 },
    M4: { control: 54, chance_to_win: 67 },
    M5: { control: 1, chance_to_win: 0 },
  },
}
const TOL = 0.01

// ---------- refusals before any request ----------
if (opt('--environment') !== 'development') refuse('pass --environment development (this script never runs against Production).')
if (!has('--i-confirm-development')) refuse('pass --i-confirm-development.')
const token = (process.env.FLAGSMITH_ADMIN_API_KEY ?? '').trim()
if (!token) refuse('FLAGSMITH_ADMIN_API_KEY is not set. Export an existing key in this shell; it is never printed.')
const scheme = opt('--auth-scheme') ?? 'Api-Key'
if (!['Api-Key', 'Token'].includes(scheme)) refuse('--auth-scheme must be Api-Key or Token.')
const api = (opt('--api') ?? 'https://api.flagsmith.com/api/v1').replace(/\/$/, '')
if (api !== 'https://api.flagsmith.com/api/v1' && !/^http:\/\/127\.0\.0\.1:\d+\/api\/v1$/.test(api))
  refuse('--api may only be Flagsmith SaaS or a local test server.')
const envFile = opt('--env-file') ?? join(ROOT, '.env')
const dotenv = Object.fromEntries(
  readFileSync(envFile, 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
if (dotenv.VITE_FLAGSMITH_ENV_NAME !== 'development') refuse('.env is not the Development configuration (VITE_FLAGSMITH_ENV_NAME).')
const envKey = dotenv.VITE_FLAGSMITH_ENV_KEY ?? ''
if (!/^[A-Za-z0-9]{10,}$/.test(envKey)) refuse('.env has no usable VITE_FLAGSMITH_ENV_KEY.')
if (token === envKey) refuse('FLAGSMITH_ADMIN_API_KEY is the client-side environment key, not an admin key.')
const DRY = has('--dry-run')
const AUDIT = has('--audit')
if (DRY && AUDIT) refuse('pass --dry-run or --audit, not both.')
const READ_ONLY = DRY || AUDIT
const pollMs = Number(opt('--poll-ms') ?? 20000)
const pollMax = Number(opt('--poll-max') ?? 30)
const timeoutMs = Number(opt('--timeout-ms') ?? 30000) // per request; a silent connection stops the run instead of hanging it

// ---------- masking ----------
const labels = new Map() // numeric id → label
const ID_KEYS = /^(id|pk|metric|metric_id|experiment|experiment_id|feature|feature_id|project|organisation|environment|segment_ids|author|user|identity|identifier|multivariate_feature_option)$/
function scrubString(s) {
  let out = s.split(envKey).join('<env-key>').split(token).join('<redacted>')
  out = out.replace(/\/experiments\/\d+/g, '/experiments/<id>').replace(/\/metrics\/\d+/g, '/metrics/<id>')
  return out
}
function mask(v, key = '') {
  if (ID_KEYS.test(key)) {
    if (typeof v === 'number') return labels.get(v) ?? '<id>'
    if (Array.isArray(v)) return v.map(() => '<id>')
    if (v && typeof v === 'object') return '<masked>'
    if (typeof v === 'string') return /^(E|M[1-5])$/.test(v) ? v : '<id>' // our own labels are already safe
    return v
  }
  if (Array.isArray(v)) return v.map((x) => mask(x))
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mask(x, k)]))
  if (typeof v === 'string') return scrubString(v)
  return v
}

// ---------- transcript ----------
const transcript = { tool: 'flagsmith-attach-dev-metrics', mode: DRY ? 'dry-run' : AUDIT ? 'audit' : 'apply', environment: 'Development', started: new Date().toISOString(), steps: [] }
const outFile = opt('--out') ?? join(ROOT, `evidence/development/api/attach-${DRY ? 'dryrun-' : AUDIT ? 'audit-' : ''}${transcript.started.replace(/[:.]/g, '-')}.json`)
function save() {
  mkdirSync(dirname(outFile), { recursive: true })
  writeFileSync(outFile, JSON.stringify(mask(transcript), null, 2) + '\n')
}
const log = (s) => console.log(scrubString(s))
function stop(msg, detail) {
  transcript.stopped = msg
  if (detail !== undefined) transcript.stopDetail = detail
  save()
  console.error(`attach-dev-metrics: STOPPED — ${scrubString(msg)}`)
  if (detail !== undefined) console.error(JSON.stringify(mask(detail), null, 2))
  console.error(`Sanitized transcript: ${outFile.replace(ROOT + '/', '')}`)
  process.exit(1)
}

// ---------- HTTP ----------
async function call(method, path, { body, expect = [200] } = {}) {
  // Hard guard: in dry-run and audit nothing but GET is ever sent, whatever the code below asks for.
  if (READ_ONLY && method !== 'GET') stop(`${DRY ? 'dry-run' : 'audit'} guard: refused to send ${method} ${path}`)
  const url = `${api}${path}`
  let res
  try {
    res = await fetch(url, {
      method,
      headers: { Authorization: `${scheme} ${token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (e) {
    if (e?.name === 'TimeoutError')
      stop(`${method} ${path} got no response in ${timeoutMs / 1000} s. ${method === 'GET' ? 'Nothing was changed by this request.' : 'This write may or may not have arrived: run --dry-run to see the current state before re-running.'}`)
    stop(`${method} ${path} failed before a response: ${e?.message ?? e}`)
  }
  let text
  try {
    text = await res.text()
  } catch (e) {
    stop(`${method} ${path}: the response body did not arrive (${e?.name === 'TimeoutError' ? `no data in ${timeoutMs / 1000} s` : e?.message ?? e})`)
  }
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { nonJsonBody: text.slice(0, 200) }
  }
  transcript.steps.push({ at: new Date().toISOString(), request: `${method} ${path}`, body: body ?? null, status: res.status, response: json })
  if (res.status === 401 || res.status === 403) stop(`authentication/permission failed (${res.status}) on ${method} ${path}`, json)
  if (!expect.includes(res.status)) stop(`unexpected HTTP ${res.status} on ${method} ${path} (expected ${expect.join('/')})`, json)
  return { status: res.status, json, headers: res.headers }
}
async function list(path) {
  const out = []
  let next = path
  for (let page = 0; next && page < 20; page++) {
    const { json } = await call('GET', next)
    if (Array.isArray(json)) return json
    if (!json || !Array.isArray(json.results)) stop(`unexpected list shape from GET ${path}`, json)
    out.push(...json.results)
    next = json.next ? json.next.replace(api, '') : null
    if (next && next.startsWith('http')) stop('pagination left the API host', { next: json.next })
  }
  return out
}
const E = `/environments/${envKey}`

// ---------- 1. environment ----------
log(`${DRY ? 'DRY RUN (GET only, nothing is changed) · ' : AUDIT ? 'AUDIT (GET only, nothing is changed) · ' : ''}Flagsmith API · Development only · auth: ${scheme} from FLAGSMITH_ADMIN_API_KEY (not shown) · env key from .env (not shown)`)
const env = (await call('GET', `${E}/`)).json
if (!env || typeof env.name !== 'string') stop('environment response has no name', env)
if (!/^development$/i.test(env.name.trim())) stop(`the .env key belongs to environment "${env.name}", not Development`)
log(`1  environment: "${env.name}" ✓`)

// ---------- 2. metrics (existing; never created here) ----------
const allMetrics = await list(`${E}/experiment-metrics/`)
for (const m of METRICS) {
  const found = allMetrics.filter((x) => x.name === m.name)
  if (found.length !== 1) stop(`${m.label} "${m.name}": expected exactly one metric with this name, found ${found.length}`)
  const f = found[0]
  const ev = f.definition?.event
  if (f.aggregation !== m.aggregation || f.direction !== m.direction || ev !== m.definition.event)
    stop(`${m.label} does not match flagsmith/m${m.label.slice(1)}.json`, { aggregation: f.aggregation, direction: f.direction, event: ev })
  m.id = f.id
  labels.set(f.id, m.label)
  log(`2  ${m.label} "${m.name}" · ${f.aggregation} · ${f.direction} · ${ev} ✓`)
}

// ---------- 3. experiment (existing; never created, edited or ended here) ----------
const exps = (await list(`${E}/experiments/`)).filter((x) => x.name === EXPERIMENT_NAME)
if (exps.length !== 1) stop(`expected exactly one experiment named "${EXPERIMENT_NAME}" in Development, found ${exps.length}`)
const exp = exps[0]
labels.set(exp.id, 'E')
const wantStatus = AUDIT ? 'completed' : 'running'
if (exp.status !== wantStatus) stop(`experiment status is "${exp.status}", expected "${wantStatus}"`)
if (exp.feature?.name !== FLAG) stop(`experiment flag is "${exp.feature?.name}", expected "${FLAG}"`)
log(`3  experiment "${exp.name}" · ${exp.status} · flag ${exp.feature.name} ✓`)
const X = `${E}/experiments/${exp.id}`

// ---------- 4. attached before ----------
function checkAttached(rows, { requireAll }) {
  const byMetric = new Map()
  for (const r of rows) {
    const label = labels.get(r.metric)
    if (!label) stop('an unknown metric is attached to the experiment', r)
    if (byMetric.has(label)) stop(`${label} is attached more than once`, rows)
    const want = METRICS.find((m) => m.label === label)
    if (r.expected_direction !== want.expected_direction)
      stop(`${label} is attached with "${r.expected_direction}", approved is "${want.expected_direction}"`, r)
    byMetric.set(label, r)
  }
  if (requireAll) for (const m of METRICS) if (!byMetric.has(m.label)) stop(`${m.label} is not attached after attaching`, rows)
  return byMetric
}
log(`4  reading the experiment's attached metrics… (stops by itself after ${timeoutMs / 1000} s without an answer)`)
const before = (await call('GET', `${X}/metrics/`)).json
if (!Array.isArray(before)) stop('attached-metrics response is not a list', before)
const attachedBefore = checkAttached(before, { requireAll: false })
if (!attachedBefore.has('M1')) stop('M1 is not attached; this script does not set the primary metric')
log(`4  attached before: ${[...attachedBefore.keys()].join(', ') || 'none'}`)
const detail0 = (await call('GET', `${X}/`)).json
if (!Array.isArray(detail0?.metrics) || detail0.metrics.length !== before.length) stop('experiment detail disagrees with the attached-metrics list', detail0?.metrics)
if (labels.get(detail0.metrics[0]?.metric) !== 'M1') stop(`primary (metrics[0]) is ${labels.get(detail0.metrics[0]?.metric) ?? 'unknown'}, not M1`)
if (detail0.status !== wantStatus) stop(`experiment status is "${detail0.status}", expected "${wantStatus}"`)
log('4  M1 attached · increase · primary (first in the experiment) ✓')

// ---------- audit (after the experiment ended): five once, M1 primary, final results unchanged; GET only ----------
if (AUDIT) {
  if (before.length !== 5) stop(`expected 5 attached metrics, found ${before.length}`, before)
  checkAttached(before, { requireAll: true })
  for (const r of before) {
    const m = METRICS.find((x) => x.label === labels.get(r.metric))
    if (r.aggregation !== m.aggregation || r.direction !== m.direction) stop(`${m.label} attached row disagrees on aggregation/direction`, r)
  }
  log('A  attached: M1 increase (primary) · M2 not_decrease · M3 increase · M4 not_decrease · M5 increase · each once ✓')
  const r = (await call('GET', `${X}/results/`)).json?.results ?? null
  if (!r?.payload) stop('no stored results to audit', r)
  if (!r.is_final) {
    save()
    log(`A  results as of ${r.as_of} are not final yet (Flagsmith is still computing the end-of-experiment results). Re-run in 5 minutes.`)
    process.exit(3)
  }
  log(`A  final results as of ${r.as_of} (is_final: true)`)
  verifyResults(r)
  log('A  AUDIT PASSED: experiment completed, five metrics attached once, M1 primary, final results match. No write was sent.')
  process.exit(0)
}

// ---------- dry run: print the exact writes the apply run would make, then stop ----------
if (DRY) {
  const pending = METRICS.slice(1).filter((m) => !attachedBefore.has(m.label))
  const r0 = (await call('GET', `${X}/results/`)).json?.results ?? null
  let refreshNote
  if (r0?.is_final) refreshNote = 'not possible: results are final'
  else if (r0?.refresh_requested_at && 300 - (Date.now() - Date.parse(r0.refresh_requested_at)) / 1000 > 0)
    refreshNote = `not yet allowed: the 5-minute limit ends in ${Math.ceil(300 - (Date.now() - Date.parse(r0.refresh_requested_at)) / 1000)} s (the apply run would exit 3 without sending it)`
  else refreshNote = 'allowed now'
  const writes = pending.map((m) => ({
    request: `POST /environments/<env-key>/experiments/<id>/metrics/`,
    body: { metric: m.label, expected_direction: m.expected_direction },
    metric: `${m.label} "${m.name}" · ${m.aggregation} · ${m.definition.event}`,
  }))
  transcript.plan = { pendingAttachments: writes, refresh: { request: 'POST /environments/<env-key>/experiments/<id>/results/refresh/', note: refreshNote }, unchanged: ['M1 (stays primary, increase)', 'experiment status (stays running)', 'metric definitions', 'Production'] }
  save()
  log(`DRY RUN — the apply run would make ${writes.length} attachment${writes.length === 1 ? '' : 's'}:`)
  writes.forEach((w, i) => log(`  ${i + 1}. ${w.request}  {"metric": ${w.body.metric}, "expected_direction": "${w.body.expected_direction}"}   ${w.metric}`))
  if (!writes.length) log('  (none: M2–M5 are already attached with the approved directions)')
  log(`then: POST /environments/<env-key>/experiments/<id>/results/refresh/ — ${refreshNote}${has('--no-refresh') ? ' (skipped with --no-refresh)' : ''}`)
  log('then: GET-only polling and verification. Never: ending, pausing or editing the experiment, creating metrics, touching Production.')
  log(`Expected after apply: M1 increase (primary) · M2 not_decrease · M3 increase · M4 not_decrease · M5 increase · each once`)
  log(`DRY RUN complete. No POST, PUT, PATCH or DELETE was sent. Sanitized transcript: ${outFile.replace(ROOT + '/', '')}`)
  process.exit(0)
}

// ---------- 5. attach M2–M5 (skip any already attached with the approved direction) ----------
for (const m of METRICS.slice(1)) {
  if (attachedBefore.has(m.label)) {
    log(`5  ${m.label} already attached (${m.expected_direction}), not re-attached`)
    continue
  }
  const { json } = await call('POST', `${X}/metrics/`, { body: { metric: m.id, expected_direction: m.expected_direction }, expect: [201] })
  if (json?.metric !== m.id || json?.expected_direction !== m.expected_direction) stop(`${m.label} attach response does not match the request`, json)
  log(`5  ${m.label} attached · ${m.expected_direction} ✓`)
}

// ---------- 6. verify: five, once each, approved directions, M1 primary ----------
const after = (await call('GET', `${X}/metrics/`)).json
if (!Array.isArray(after) || after.length !== 5) stop(`expected 5 attached metrics, found ${Array.isArray(after) ? after.length : 'a non-list'}`, after)
checkAttached(after, { requireAll: true })
const detail = (await call('GET', `${X}/`)).json
if (!Array.isArray(detail?.metrics) || detail.metrics.length !== 5) stop('experiment detail does not list 5 metrics', detail?.metrics)
if (labels.get(detail.metrics[0].metric) !== 'M1') stop(`primary (metrics[0]) is ${labels.get(detail.metrics[0].metric) ?? 'unknown'}, not M1`)
if (detail.status !== 'running') stop(`experiment status changed to "${detail.status}"`)
for (const r of after) {
  const m = METRICS.find((x) => x.label === labels.get(r.metric))
  if (r.aggregation !== m.aggregation || r.direction !== m.direction) stop(`${m.label} attached row disagrees on aggregation/direction`, r)
}
log('6  attached: M1 increase (primary) · M2 not_decrease · M3 increase · M4 not_decrease · M5 increase · each once ✓')
save()

if (has('--no-refresh')) {
  log('Stopped before results (--no-refresh). Experiment left running.')
  process.exit(0)
}

// ---------- 7. results refresh, respecting the 5-minute limit ----------
const r0 = (await call('GET', `${X}/results/`)).json?.results ?? null
if (r0?.is_final) stop('results are final (experiment completed); refresh is not possible')
if (r0?.refresh_requested_at) {
  const waitS = Math.ceil(300 - (Date.now() - Date.parse(r0.refresh_requested_at)) / 1000)
  if (waitS > 0) {
    save()
    log(`7  a results refresh was requested less than 5 minutes ago. Re-run in ${waitS + 5} s (attachment is already done and will be skipped).`)
    process.exit(3)
  }
}
const asOfBefore = r0?.as_of ?? null
const refresh = await call('POST', `${X}/results/refresh/`, { expect: [202, 429] })
if (refresh.status === 429) {
  save()
  log(`7  Flagsmith refused the refresh (5-minute limit): ${JSON.stringify(refresh.json)}. Re-run later.`)
  process.exit(3)
}
const requestedAt = Date.now()
log(`7  results refresh accepted (202) · polling every ${pollMs / 1000} s`)
let results = null
for (let i = 0; i < pollMax; i++) {
  await new Promise((r) => setTimeout(r, pollMs))
  const r = (await call('GET', `${X}/results/`)).json?.results ?? null
  if (r?.last_error_at && Date.parse(r.last_error_at) >= requestedAt - 1000) stop('Flagsmith recorded an error computing results', r)
  if (r?.as_of && r.as_of !== asOfBefore && r.payload) {
    results = r
    break
  }
}
if (!results) {
  save()
  log('7  results not computed yet. Re-run in 5 minutes; nothing else is changed.')
  process.exit(3)
}
log(`7  results as of ${results.as_of}`)

// ---------- 8. verify every metric, every arm, against the recorded events ----------
function verifyResults(results) {
  const payload = results.payload
  if (!Array.isArray(payload?.metrics)) stop('results payload has no metrics list', payload)
  const armOf = (k) => (k === 'chance_to_win' ? 'chance_to_win' : k === 'control' || k === 'p_value' ? 'control' : null)
  const rows = []
  let allMatch = true
  for (const m of METRICS) {
    const mr = payload.metrics.filter((x) => x.metric_id === m.id)
    if (mr.length !== 1) stop(`${m.label}: expected one result entry, found ${mr.length}`)
    const variants = mr[0].variants ?? {}
    const keys = Object.keys(variants)
    if (keys.length !== 2 || keys.some((k) => !armOf(k)) || new Set(keys.map(armOf)).size !== 2)
      stop(`${m.label}: unexpected arms in results`, keys)
    for (const k of keys) {
      const arm = armOf(k)
      const { n, sum } = variants[k]
      const wantN = EXPECTED.n[arm]
      const wantSum = EXPECTED.sum[m.label][arm]
      const ok = n === wantN && Math.abs(sum - wantSum) <= TOL
      if (!ok) allMatch = false
      rows.push({ metric: m.label, event: m.definition.event, aggregation: m.aggregation, expected_direction: m.expected_direction, arm, n, sum: +sum.toFixed(4), mean: n ? +(sum / n).toFixed(4) : null, expectedN: wantN, expectedSum: +wantSum.toFixed(4), match: ok })
    }
  }
  transcript.verification = { as_of: results.as_of, is_final: results.is_final ?? null, rows, srm_p_value: payload.srm_p_value ?? null, allMatch }
  save()
  console.table(rows.map(({ metric, arm, n, expectedN, sum, expectedSum, mean, match }) => ({ metric, arm, n, expectedN, sum, expectedSum, mean, match })))
  log(`   SRM p-value: ${payload.srm_p_value ?? 'n/a (not computed by Flagsmith)'}`)
  log(`Sanitized transcript: ${outFile.replace(ROOT + '/', '')}`)
  if (!allMatch) {
    console.error(`attach-dev-metrics: STOPPED — results do not match the recorded Development events. ${AUDIT ? 'Do not tag measured-v1' : 'Do NOT end the experiment'}; send the transcript for review.`)
    process.exit(1)
  }
}
verifyResults(results)
log('8  ALL FIVE METRICS MATCH: pre-attachment events are included; M2/M5 count once per identity; M3/M4 values unchanged.')
log('   The experiment is still RUNNING. End it only after reviewing this output (dashboard › End Experiment).')
