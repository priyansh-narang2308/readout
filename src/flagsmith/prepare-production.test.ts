/**
 * scripts/flagsmith-prepare-production.mjs against a local fake of the Flagsmith v2.291.0 API (never Flagsmith).
 * Proves the refusals, the GET-only read modes, the write allowlist, the disabled rollout, idempotency, exact
 * verification, stop conditions and masking. It proves nothing about the live Production workspace.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const TOKEN = 'admin-secret-token-xyz'
const PROD_KEY = 'ProdEnvKeyAbc1234567890'
const DEV_KEY = 'DevEnvKeyZyx0987654321'
const ENV_ID = 8811
const PROJECT = 5513
const FEATURE = 6631
const OPTION = 7741
const VERSION_UUID = '3f2b9c1e-8a47-4d2b-9e61-0c5d7a8b4f12'
const STRAY_ID = 5577
const LOOSE_UUID = '9d4e0b7a-1c2f-4e8a-b3d5-6f7a8b9c0d1e' // under a field name no rule knows
const DEFS = [1, 2, 3, 4, 5].map((n) => JSON.parse(readFileSync(`flagsmith/m${n}.json`, 'utf8')))
const DIRS = ['increase', 'not_decrease', 'increase', 'not_decrease', 'increase']

type Metric = { id: number; name: string; aggregation: string; direction: string; definition: unknown }
type Exp = { id: number; name: string; hypothesis: string; status: string; metrics: { metric: number; expected_direction: string }[]; rollout: Record<string, unknown> }
let s: {
  envName: string
  projectName: string
  metrics: Metric[]
  exps: Exp[]
  weight: number
  identityOverrides: number
  events: number
  exposures: unknown
  nextId: number
  requests: { method: string; path: string; body: any }[]
}
function reset() {
  s = { envName: 'Production', projectName: 'readout', metrics: [], exps: [], weight: 0, identityOverrides: 0, events: 0, exposures: null, nextId: 9100, requests: [] }
}
reset()
const template = JSON.parse(readFileSync('flagsmith/experiment.template.json', 'utf8'))
function preparedState() {
  s.metrics = DEFS.map((d, i) => ({ id: 9001 + i, ...d }))
  s.exps = [
    {
      id: 4401,
      name: 'Readout framing v1',
      hypothesis: template.hypothesis,
      status: 'created',
      metrics: s.metrics.map((m, i) => ({ metric: m.id, expected_direction: DIRS[i]! })),
      rollout: { enabled: false, rollout_percentage: 100, feature_state_value: { type: 'string', value: 'p_value' }, multivariate_feature_state_values: [{ multivariate_feature_option: OPTION, percentage_allocation: 50 }] },
    },
  ]
}

let server: Server
let api = ''
beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      const path = (req.url ?? '').replace(/^\/api\/v1/, '')
      const body = raw ? JSON.parse(raw) : null
      s.requests.push({ method: req.method ?? '', path, body })
      const send = (code: number, json?: unknown) => res.writeHead(code, { 'content-type': 'application/json' }).end(json === undefined ? '' : JSON.stringify(json))
      if (req.headers.authorization !== `Api-Key ${TOKEN}`) return send(401, { detail: 'Invalid token.' })
      const E = `/environments/${PROD_KEY}`
      const ours = s.exps.filter((x) => x.status !== 'completed')
      if (path === `${E}/` && req.method === 'GET') return send(200, { id: ENV_ID, name: s.envName, api_key: PROD_KEY, project: PROJECT })
      if (path === `/projects/${PROJECT}/`) return send(200, { id: PROJECT, name: s.projectName, organisation: 12 })
      if (path === `/projects/${PROJECT}/features/?environment=${ENV_ID}&search=readout_framing`)
        return send(200, {
          count: 1,
          next: null,
          results: [
            {
              id: FEATURE,
              name: 'readout_framing',
              type: 'MULTIVARIATE',
              owners: [{ email: 'owner@example.com' }],
              multivariate_options: [{ id: OPTION, type: 'unicode', string_value: 'chance_to_win', default_percentage_allocation: 0 }],
              environment_feature_state: { id: 1, enabled: true, feature_state_value: 'p_value' },
              num_segment_overrides: ours.length,
              num_identity_overrides: s.identityOverrides,
            },
          ],
        })
      if (path === `${E}/featurestates/?feature=${FEATURE}`)
        return send(200, { count: 1, next: null, results: [{ id: 1, identity: null, feature_segment: null, environment_feature_version: VERSION_UUID, change_request_id: STRAY_ID, last_audit: LOOSE_UUID, enabled: true, multivariate_feature_state_values: [{ id: 2, multivariate_feature_option: OPTION, percentage_allocation: s.weight }] }] })
      if (path === `${E}/experiment-metrics/` && req.method === 'GET') return send(200, { count: s.metrics.length, next: null, results: s.metrics })
      if (path === `${E}/experiment-metrics/` && req.method === 'POST') {
        const m = { id: s.nextId++, ...body }
        s.metrics.push(m)
        return send(201, { ...m, experiments: [] })
      }
      const listed = (x: Exp) => ({ id: x.id, name: x.name, status: x.status, feature: { id: FEATURE, name: 'readout_framing' } })
      if (path === `${E}/experiments/` && req.method === 'GET') return send(200, { count: s.exps.length, next: null, results: s.exps.map(listed), status_counts: {} })
      if (path === `${E}/experiments/` && req.method === 'POST') {
        if (ours.length) return send(409, { detail: 'An active experiment already exists for this feature.' })
        const x: Exp = { id: s.nextId++, name: body.name, hypothesis: body.hypothesis, status: 'created', metrics: body.metrics, rollout: body.experiment_rollout }
        s.exps.push(x)
        return send(201, { id: x.id, name: x.name, feature: FEATURE, status: 'created' })
      }
      for (const x of s.exps) {
        const X = `${E}/experiments/${x.id}`
        if (path === `${X}/`)
          return send(200, {
            ...listed(x),
            hypothesis: x.hypothesis,
            started_at: null,
            ended_at: null,
            metrics: x.metrics.map((r, i) => ({ id: i + 1, ...r, aggregation: s.metrics.find((m) => m.id === r.metric)?.aggregation, direction: 'up' })),
            experiment_rollout: { ...x.rollout, audience: { match: 'any', segments: [] } },
          })
        if (path === `${X}/exposures/`) return send(200, { exposures: s.exposures })
        if (path === `${X}/results/`) return send(200, { results: null })
      }
      if (path === `${E}/warehouse-connections/`)
        return send(200, [{ id: 31, warehouse_type: 'flagsmith', status: 'pending_connection', total_events_received: s.events, unique_events_count: 0, last_event_received_at: null }])
      send(404, { detail: 'Not found.' })
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  api = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`
})
afterAll(() => {
  server.closeAllConnections()
  server.close()
})

let dir = ''
let envFile = ''
let out = ''
beforeEach(() => {
  reset()
  dir = mkdtempSync(join(tmpdir(), 'prep-'))
  envFile = join(dir, '.env')
  out = join(dir, 'transcript.json')
  writeFileSync(envFile, `VITE_FLAGSMITH_ENV_KEY=${DEV_KEY}\nVITE_FLAGSMITH_ENV_NAME=development\n`)
  return () => rmSync(dir, { recursive: true, force: true })
})

const OK = ['--environment', 'production', '--i-confirm-production']
const KEYS = { FLAGSMITH_ADMIN_API_KEY: TOKEN, FLAGSMITH_PRODUCTION_ENV_KEY: PROD_KEY }
function run(extra: string[], env: Record<string, string> = KEYS, base = OK) {
  return new Promise<{ code: number | null; out: string; err: string }>((resolve) => {
    const p = spawn('node', ['scripts/flagsmith-prepare-production.mjs', ...base, '--api', api, '--env-file', envFile, '--out', out, ...extra], { env: { PATH: process.env.PATH ?? '', ...env } })
    let o = ''
    let e = ''
    p.stdout.on('data', (d) => (o += d))
    p.stderr.on('data', (d) => (e += d))
    p.on('close', (code) => resolve({ code, out: o, err: e }))
  })
}
const writes = () => s.requests.filter((q) => q.method !== 'GET')
function noSecrets(text: string) {
  expect(text).not.toContain(TOKEN)
  expect(text).not.toContain(PROD_KEY)
  expect(text).not.toContain('owner@example.com')
  expect(text).not.toContain(LOOSE_UUID)
  expect(text).not.toContain(VERSION_UUID) // an ID under a field name not on the known list
  for (const id of [ENV_ID, PROJECT, FEATURE, OPTION, STRAY_ID, 4401, 9001, 9100, 9105]) expect(text).not.toContain(String(id))
}

describe('flagsmith-prepare-production.mjs', () => {
  it('refuses before any request: confirmations, one mode, both keys, keys distinct, not the Development key', async () => {
    expect((await run(['--dry-run'], KEYS, ['--i-confirm-production'])).code).toBe(2)
    expect((await run(['--dry-run'], KEYS, ['--environment', 'development', '--i-confirm-production'])).code).toBe(2)
    expect((await run(['--dry-run'], KEYS, ['--environment', 'production'])).code).toBe(2)
    expect((await run([])).code).toBe(2)
    expect((await run(['--dry-run', '--verify'])).code).toBe(2)
    expect((await run(['--dry-run'], { FLAGSMITH_PRODUCTION_ENV_KEY: PROD_KEY })).code).toBe(2)
    expect((await run(['--dry-run'], { FLAGSMITH_ADMIN_API_KEY: TOKEN })).code).toBe(2)
    expect((await run(['--dry-run'], { FLAGSMITH_ADMIN_API_KEY: PROD_KEY, FLAGSMITH_PRODUCTION_ENV_KEY: PROD_KEY })).code).toBe(2)
    expect((await run(['--dry-run'], { FLAGSMITH_ADMIN_API_KEY: TOKEN, FLAGSMITH_PRODUCTION_ENV_KEY: DEV_KEY })).code).toBe(2)
    expect((await run(['--start'])).code).toBe(2) // there is no start mode
    expect(s.requests).toEqual([])
  })

  it('stops when the key belongs to an environment not named Production', async () => {
    s.envName = 'Development'
    const r = await run(['--apply-production-prep'])
    expect(r.code).toBe(1)
    expect(r.err).toMatch(/not Production/)
    expect(writes()).toEqual([])
  })

  it('stops when the Production environment belongs to another project, before any write', async () => {
    s.projectName = 'some-other-project'
    const r = await run(['--apply-production-prep'])
    expect(r.code).toBe(1)
    expect(r.err).toMatch(/not "readout"/)
    expect(writes()).toEqual([])
    noSecrets(r.out + r.err + readFileSync(out, 'utf8'))
  })

  it('dry run on an empty Production: GET only, and shows 5 metric creates and one disabled experiment create', async () => {
    const r = await run(['--dry-run'])
    expect(r.code).toBe(0)
    expect(writes()).toEqual([])
    expect(r.out).toMatch(/would make 6 creates/)
    const t = JSON.parse(readFileSync(out, 'utf8'))
    expect(t.plan).toHaveLength(6)
    expect(t.plan[5].body.experiment_rollout.enabled).toBe(false)
    expect(t.plan[5].body.metrics.map((m: { metric: string }) => m.metric)).toEqual(['M1', 'M2', 'M3', 'M4', 'M5'])
    expect(t.writes).toEqual([])
    noSecrets(r.out + r.err + readFileSync(out, 'utf8'))
  })

  it('apply creates M1–M5 from the JSON files and the experiment CREATED with its rollout disabled; never starts', async () => {
    const r = await run(['--apply-production-prep'])
    expect(r.code).toBe(0)
    expect(r.out).toMatch(/APPLY COMPLETE/)
    const w = writes()
    expect(w.map((q) => `${q.method} ${q.path.replace(PROD_KEY, 'K')}`)).toEqual([...Array(5).fill('POST /environments/K/experiment-metrics/'), 'POST /environments/K/experiments/'])
    w.slice(0, 5).forEach((q, i) => expect(q.body).toEqual(DEFS[i]))
    const e = w[5]!.body
    expect(e.experiment_rollout).toEqual({ enabled: false, rollout_percentage: 100, feature_state_value: { type: 'string', value: 'p_value' }, multivariate_feature_state_values: [{ multivariate_feature_option: OPTION, percentage_allocation: 50 }] })
    expect(e.metrics).toEqual([9100, 9101, 9102, 9103, 9104].map((metric, i) => ({ metric, expected_direction: DIRS[i] })))
    expect(e.feature).toBe(FEATURE)
    expect(s.requests.some((q) => /start|pause|complete|rollout|refresh/.test(q.path))).toBe(false)
    expect(s.exps[0]!.status).toBe('created')
    noSecrets(r.out + r.err + readFileSync(out, 'utf8'))
  })

  it('is idempotent: a second apply and --verify send no write and pass', async () => {
    preparedState()
    const a = await run(['--apply-production-prep'])
    expect(a.code).toBe(0)
    const v = await run(['--verify'])
    expect(v.code).toBe(0)
    expect(v.out).toMatch(/VERIFY PASSED/)
    expect(writes()).toEqual([])
  })

  it('creates only what is missing (two metrics exist and match)', async () => {
    s.metrics = DEFS.slice(0, 2).map((d, i) => ({ id: 9001 + i, ...d }))
    const r = await run(['--apply-production-prep'])
    expect(r.code).toBe(0)
    expect(writes().map((q) => q.body.name ?? 'experiment')).toEqual([DEFS[2].name, DEFS[3].name, DEFS[4].name, 'Readout framing v1'])
    expect(writes()[3]!.body.metrics[0].metric).toBe(9001) // the existing M1 stays first (primary)
  })

  it.each([
    ['a metric that differs from its JSON file', () => (s.metrics = [{ id: 9001, ...DEFS[0], aggregation: 'occurrence' }]), /differs from flagsmith\/m1.json/],
    ['a duplicated metric', () => (s.metrics = [{ id: 9001, ...DEFS[0] }, { id: 9002, ...DEFS[0] }]), /exists 2 times/],
    ['another metric on the same event', () => (s.metrics = [{ id: 9001, ...DEFS[0], name: 'Score v0' }]), /already measures readout_score/],
    ['a running experiment', () => (preparedState(), (s.exps[0]!.status = 'running')), /RUNNING in Production/],
    ['another experiment on the flag', () => (preparedState(), (s.exps[0]!.name = 'Something else')), /another experiment/],
    ['a prepared rollout that is enabled', () => (preparedState(), (s.exps[0]!.rollout.enabled = true)), /rollout is ENABLED/],
    ['M1 not primary', () => (preparedState(), s.exps[0]!.metrics.reverse()), /metric #1 is M5, expected M1 \(primary\)/],
    ['a wrong split', () => (preparedState(), ((s.exps[0]!.rollout.multivariate_feature_state_values as { percentage_allocation: number }[])[0]!.percentage_allocation = 60)), /not p_value 50/],
    ['computed exposures', () => (preparedState(), (s.exposures = { as_of: 'x' })), /computed exposures/],
    ['a non-zero environment weight', () => (s.weight = 10), /environment weight 10%/],
    ['identity overrides', () => (s.identityOverrides = 2), /identity override/],
    ['events already in Production', () => (s.events = 3), /already received 3 event/],
  ])('stops, without writing, on %s', async (_n, setup, msg) => {
    setup()
    const r = await run(['--apply-production-prep'])
    expect(r.code).toBe(1)
    expect(r.err).toMatch(msg)
    expect(writes()).toEqual([])
    noSecrets(r.out + r.err + readFileSync(out, 'utf8'))
  })

  it('--verify fails on an unprepared Production and sends nothing', async () => {
    const r = await run(['--verify'])
    expect(r.code).toBe(1)
    expect(r.err).toMatch(/not prepared/)
    expect(writes()).toEqual([])
  })

  it('the write guards are in the code path, not just the flow: read-only modes, the allowlist, the enabled refusal', () => {
    const src = readFileSync('scripts/flagsmith-prepare-production.mjs', 'utf8')
    expect(src).toMatch(/if \(!APPLY\) stop\(/)
    expect(src).toMatch(/ALLOWED_WRITES = \[`POST \$\{E\}\/experiment-metrics\/`, `POST \$\{E\}\/experiments\/`\]/)
    expect(src).toMatch(/experiment_rollout\?\.enabled !== false\) stop\(/)
    expect(src).not.toMatch(/\/start\/|\/pause\/|\/complete\/|\/rollout\/|refresh\//)
  })
})
