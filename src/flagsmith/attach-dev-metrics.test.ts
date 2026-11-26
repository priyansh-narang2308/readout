/**
 * scripts/flagsmith-attach-dev-metrics.mjs against a local fake of the Flagsmith v2.291.0 experimentation API (never
 * Flagsmith). Proves the script's refusals, idempotent attach, masking and stop conditions, not the live result.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const TOKEN = 'admin-secret-token-xyz'
const ENV_KEY = 'DevEnvKeyAbc1234567890'
const NAMES = [
  ['Readout score (unfinished = 0)', 'mean', 'readout_score'],
  ['Finished measured run', 'occurrence', 'readout_completed'],
  ['Correct call on significant loss', 'mean', 'readout_loss_call'],
  ['Correct call on promising-but-inconclusive result', 'mean', 'readout_near_miss_call'],
  ['Copied the Readout Rules', 'occurrence', 'readout_rules_copied'],
] as const
const MID = [9101, 9102, 9103, 9104, 9105]
const EXP = 4242

type Attached = { id: number; metric: number; expected_direction: string; aggregation: string; direction: string; metric_name: string }
let s: {
  envName: string
  forbid: boolean
  hang: boolean
  status: string
  attached: Attached[]
  results: null | Record<string, unknown>
  refreshStatus: number
  sums: Record<number, { control: number; chance_to_win: number }>
  requests: { method: string; path: string; body: unknown; auth: string | undefined }[]
}
const GOOD_SUMS = {
  9101: { control: 68.3333333, chance_to_win: 99 },
  9102: { control: 55, chance_to_win: 68 },
  9103: { control: 0, chance_to_win: 67 },
  9104: { control: 54, chance_to_win: 67 },
  9105: { control: 1, chance_to_win: 0 },
}
function reset() {
  s = {
    envName: 'Development',
    forbid: false,
    hang: false,
    status: 'running',
    attached: [{ id: 1, metric: 9101, expected_direction: 'increase', aggregation: 'mean', direction: 'up', metric_name: NAMES[0][0] }],
    results: { as_of: '2026-11-16T18:58:00Z', refresh_requested_at: '2026-11-16T18:57:00Z', last_error_at: null, payload: null, is_final: false },
    refreshStatus: 202,
    sums: { ...GOOD_SUMS },
    requests: [],
  }
}
reset()

let server: Server
let api = ''
beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      const path = (req.url ?? '').replace(/^\/api\/v1/, '')
      const body = raw ? JSON.parse(raw) : null
      s.requests.push({ method: req.method ?? '', path, body, auth: req.headers.authorization })
      const send = (code: number, json?: unknown) => res.writeHead(code, { 'content-type': 'application/json' }).end(json === undefined ? '' : JSON.stringify(json))
      if (req.headers.authorization !== `Api-Key ${TOKEN}`) return send(401, { detail: 'Invalid token.' })
      if (s.forbid) return send(403, { detail: 'You do not have permission to perform this action.' })
      const E = `/environments/${ENV_KEY}`
      if (path === `${E}/`) return send(200, { id: 77, name: s.envName, api_key: ENV_KEY, project: 5 })
      if (path === `${E}/experiment-metrics/`)
        return send(200, {
          count: 5,
          next: null,
          results: NAMES.map(([name, aggregation, event], i) => ({ id: MID[i], name, aggregation, direction: 'up', definition: { version: 1, event }, experiments: [] })),
        })
      if (path === `${E}/experiments/`)
        return send(200, { count: 1, next: null, results: [{ id: EXP, name: 'Readout framing v1', status: s.status, feature: { id: 3, name: 'readout_framing' }, metrics: s.attached }] })
      const X = `${E}/experiments/${EXP}`
      if (path === `${X}/`) return send(200, { id: EXP, name: 'Readout framing v1', status: s.status, metrics: s.attached })
      if (path === `${X}/metrics/` && req.method === 'GET') return s.hang ? undefined : send(200, s.attached) // hang: never answer
      if (path === `${X}/metrics/` && req.method === 'POST') {
        if (s.attached.some((a) => a.metric === body.metric)) return send(400, { metric: ['Metric is already attached to this experiment.'] })
        const i = MID.indexOf(body.metric)
        const row = { id: s.attached.length + 1, metric: body.metric, expected_direction: body.expected_direction, aggregation: NAMES[i]![1], direction: 'up', metric_name: NAMES[i]![0] }
        s.attached.push(row)
        return send(201, { ...row, created_at: 'x' })
      }
      if (path === `${X}/results/`) return send(200, { results: s.results })
      if (path === `${X}/results/refresh/`) {
        if (s.refreshStatus === 429) return send(429, { detail: 'A refresh was requested recently. Try again later.' })
        s.results = {
          as_of: '2026-11-17T01:00:00Z',
          refresh_requested_at: new Date().toISOString(),
          last_error_at: null,
          is_final: false,
          payload: {
            srm_p_value: 0.56,
            metrics: MID.map((id) => ({ metric_id: id, variants: { control: { n: 140, sum: s.sums[id]!.control, sum_squares: 0 }, chance_to_win: { n: 150, sum: s.sums[id]!.chance_to_win, sum_squares: 0 } }, inference: {} })),
          },
        }
        return send(202)
      }
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
  dir = mkdtempSync(join(tmpdir(), 'attach-'))
  envFile = join(dir, '.env')
  out = join(dir, 'transcript.json')
  writeFileSync(envFile, `VITE_FLAGSMITH_ENV_KEY=${ENV_KEY}\nVITE_FLAGSMITH_ENV_NAME=development\n`)
  return () => rmSync(dir, { recursive: true, force: true })
})

const OK = ['--environment', 'development', '--i-confirm-development']
function run(extra: string[] = [], env: Record<string, string> = { FLAGSMITH_ADMIN_API_KEY: TOKEN }) {
  return new Promise<{ code: number | null; out: string; err: string }>((resolve) => {
    const p = spawn('node', ['scripts/flagsmith-attach-dev-metrics.mjs', ...OK, '--api', api, '--env-file', envFile, '--out', out, '--poll-ms', '20', '--poll-max', '5', ...extra], {
      env: { PATH: process.env.PATH ?? '', ...env },
    })
    let o = ''
    let e = ''
    p.stdout.on('data', (d) => (o += d))
    p.stderr.on('data', (d) => (e += d))
    p.on('close', (code) => resolve({ code, out: o, err: e }))
  })
}
function noSecrets(text: string) {
  expect(text).not.toContain(TOKEN)
  expect(text).not.toContain(ENV_KEY)
  for (const id of [...MID, EXP]) expect(text).not.toContain(String(id))
}

describe('flagsmith-attach-dev-metrics.mjs', () => {
  it('refuses before any request without the confirmations, the token, or a Development .env', async () => {
    const bare = (a: string[], env: Record<string, string>) =>
      new Promise<number | null>((resolve) => {
        spawn('node', ['scripts/flagsmith-attach-dev-metrics.mjs', ...a, '--api', api, '--env-file', envFile], { env: { PATH: process.env.PATH ?? '', ...env } }).on('close', resolve)
      })
    expect(await bare(['--i-confirm-development'], { FLAGSMITH_ADMIN_API_KEY: TOKEN })).toBe(2)
    expect(await bare(['--environment', 'production', '--i-confirm-development'], { FLAGSMITH_ADMIN_API_KEY: TOKEN })).toBe(2)
    expect(await bare(['--environment', 'development'], { FLAGSMITH_ADMIN_API_KEY: TOKEN })).toBe(2)
    expect((await run([], {})).code).toBe(2)
    expect((await run([], { FLAGSMITH_ADMIN_API_KEY: ENV_KEY })).code).toBe(2) // the client key is not an admin key
    writeFileSync(envFile, `VITE_FLAGSMITH_ENV_KEY=${ENV_KEY}\nVITE_FLAGSMITH_ENV_NAME=production\n`)
    expect((await run()).code).toBe(2)
    expect(s.requests).toEqual([])
  })

  it('stops when the key belongs to an environment not named Development, before any write', async () => {
    s.envName = 'Production'
    const r = await run()
    expect(r.code).toBe(1)
    expect(r.err).toMatch(/not Development/)
    expect(s.requests.filter((q) => q.method !== 'GET')).toEqual([])
  })

  it('stops on a permission failure and writes nothing', async () => {
    s.forbid = true
    const r = await run()
    expect(r.code).toBe(1)
    expect(r.err).toMatch(/authentication\/permission failed \(403\)/)
    expect(s.requests.filter((q) => q.method !== 'GET')).toEqual([])
  })

  it('attaches M2–M5 once with the approved directions, keeps M1 primary, masks everything; a re-run attaches nothing', async () => {
    const r = await run(['--no-refresh'])
    expect(r.err).toBe('')
    expect(r.code).toBe(0)
    const posts = s.requests.filter((q) => q.method === 'POST')
    expect(posts.map((p) => p.body)).toEqual([
      { metric: 9102, expected_direction: 'not_decrease' },
      { metric: 9103, expected_direction: 'increase' },
      { metric: 9104, expected_direction: 'not_decrease' },
      { metric: 9105, expected_direction: 'increase' },
    ])
    expect(s.attached.map((a) => a.metric)).toEqual(MID)
    expect(r.out).toMatch(/M1 increase \(primary\) · M2 not_decrease · M3 increase · M4 not_decrease · M5 increase · each once ✓/)
    noSecrets(r.out)
    noSecrets(readFileSync(out, 'utf8'))
    expect(readFileSync(out, 'utf8')).toMatch(/"metric": "M2"/)

    s.requests = []
    const again = await run(['--no-refresh'])
    expect(again.code).toBe(0)
    expect(s.requests.filter((q) => q.method === 'POST')).toEqual([])
    expect(again.out).toMatch(/M5 already attached/)
  }, 30000)

  const writes = () => s.requests.filter((q) => q.method !== 'GET')
  const row = (i: number, dir: string) => ({ id: i + 1, metric: MID[i]!, expected_direction: dir, aggregation: NAMES[i]![1], direction: 'up', metric_name: NAMES[i]![0] })

  it('--dry-run sends GET only, changes nothing and prints the four pending attachments and the refresh', async () => {
    s.results = { as_of: 'a', refresh_requested_at: '2026-11-16T18:57:00Z', last_error_at: null, payload: null, is_final: false }
    const r = await run(['--dry-run'])
    expect(r.err).toBe('')
    expect(r.code).toBe(0)
    expect(s.requests.length).toBeGreaterThan(0)
    expect(writes()).toEqual([]) // fails if dry-run sends any POST, PUT, PATCH or DELETE
    expect(s.attached.map((a) => a.metric)).toEqual([9101]) // nothing attached
    expect(r.out).toMatch(/M1 attached · increase · primary/)
    expect(r.out).toMatch(/would make 4 attachments/)
    const lines = r.out.split('\n').filter((l) => /^\s+\d\. POST/.test(l))
    expect(lines).toHaveLength(4)
    expect(lines[0]).toMatch(/\{"metric": M2, "expected_direction": "not_decrease"\}.*readout_completed/)
    expect(lines[1]).toMatch(/\{"metric": M3, "expected_direction": "increase"\}.*readout_loss_call/)
    expect(lines[2]).toMatch(/\{"metric": M4, "expected_direction": "not_decrease"\}.*readout_near_miss_call/)
    expect(lines[3]).toMatch(/\{"metric": M5, "expected_direction": "increase"\}.*readout_rules_copied/)
    expect(r.out).toMatch(/results\/refresh\/ — allowed now/)
    expect(r.out).toMatch(/No POST, PUT, PATCH or DELETE was sent/)
    noSecrets(r.out)
    const t = readFileSync(out, 'utf8')
    noSecrets(t)
    const j = JSON.parse(t)
    expect(j.mode).toBe('dry-run')
    expect(j.plan.pendingAttachments.map((w: { body: unknown }) => w.body)).toEqual([
      { metric: 'M2', expected_direction: 'not_decrease' },
      { metric: 'M3', expected_direction: 'increase' },
      { metric: 'M4', expected_direction: 'not_decrease' },
      { metric: 'M5', expected_direction: 'increase' },
    ])
    expect(j.steps.every((x: { request: string }) => x.request.startsWith('GET '))).toBe(true)
  }, 30000)

  it('--dry-run lists only what is still pending and reports a refresh that is not yet allowed, still GET only', async () => {
    s.attached = [row(0, 'increase'), row(2, 'increase')]
    s.results = { as_of: 'a', refresh_requested_at: new Date().toISOString(), last_error_at: null, payload: null, is_final: false }
    const r = await run(['--dry-run'])
    expect(r.code).toBe(0)
    expect(writes()).toEqual([])
    expect(r.out).toMatch(/would make 3 attachments/)
    expect(r.out).not.toMatch(/"metric": M3/)
    expect(r.out).toMatch(/not yet allowed/)
  }, 30000)

  it('--dry-run and apply both stop when M1 is not primary, without any write', async () => {
    s.attached = [row(2, 'increase'), row(0, 'increase')]
    const d = await run(['--dry-run'])
    expect(d.code).toBe(1)
    expect(d.err).toMatch(/primary \(metrics\[0\]\) is M3, not M1/)
    expect(writes()).toEqual([])
    const a = await run()
    expect(a.code).toBe(1)
    expect(writes()).toEqual([])
  }, 30000)

  it('--dry-run sends no write on any stop path (wrong environment, permission failure, wrong direction)', async () => {
    s.envName = 'Production'
    expect((await run(['--dry-run'])).code).toBe(1)
    expect(writes()).toEqual([])
    reset()
    s.forbid = true
    expect((await run(['--dry-run'])).code).toBe(1)
    expect(writes()).toEqual([])
    reset()
    s.attached = [row(0, 'increase'), row(1, 'increase')] // M2 attached with the wrong direction
    const r = await run(['--dry-run'])
    expect(r.code).toBe(1)
    expect(r.err).toMatch(/M2 is attached with "increase", approved is "not_decrease"/)
    expect(writes()).toEqual([])
  }, 30000)

  it('a request that never gets an answer stops the run (no hang) before any write, in apply and dry-run', async () => {
    s.hang = true
    for (const extra of [['--no-refresh'], ['--dry-run']]) {
      s.requests = []
      const r = await run([...extra, '--timeout-ms', '300'])
      expect(r.code).toBe(1)
      expect(r.err).toMatch(/GET \/environments\/<env-key>\/experiments\/<id>\/metrics\/ got no response in 0.3 s\. Nothing was changed/)
      expect(writes()).toEqual([])
      noSecrets(r.err)
    }
  }, 30000)

  const allFive = () => [row(0, 'increase'), row(1, 'not_decrease'), row(2, 'increase'), row(3, 'not_decrease'), row(4, 'increase')]
  const finalResults = (sums = GOOD_SUMS, is_final = true) => ({
    as_of: '2026-11-17T07:10:00Z', refresh_requested_at: '2026-11-17T06:45:40Z', last_error_at: null, is_final,
    payload: { srm_p_value: null, metrics: MID.map((id) => ({ metric_id: id, variants: { control: { n: 140, sum: sums[id as keyof typeof sums].control, sum_squares: 0 }, chance_to_win: { n: 150, sum: sums[id as keyof typeof sums].chance_to_win, sum_squares: 0 } }, inference: {} })) },
  })

  it('--audit: completed experiment, five once, M1 primary, final results match — GET only', async () => {
    s.status = 'completed'
    s.attached = allFive()
    s.results = finalResults()
    const r = await run(['--audit'])
    expect(r.err).toBe('')
    expect(r.code).toBe(0)
    expect(writes()).toEqual([])
    expect(r.out).toMatch(/AUDIT PASSED/)
    expect(r.out).toMatch(/SRM p-value: n\/a \(not computed by Flagsmith\)/)
    const t = JSON.parse(readFileSync(out, 'utf8'))
    expect(t.mode).toBe('audit')
    expect(t.verification.is_final).toBe(true)
    expect(t.steps.every((x: { request: string }) => x.request.startsWith('GET '))).toBe(true)
    noSecrets(r.out)
    noSecrets(readFileSync(out, 'utf8'))
  }, 30000)

  it('--audit stops (no write) on a running experiment, a missing metric, a moved primary or changed results; waits if not final', async () => {
    s.attached = allFive()
    s.results = finalResults()
    expect((await run(['--audit'])).code).toBe(1) // still running
    s.status = 'completed'
    s.attached = allFive().slice(0, 4)
    expect((await run(['--audit'])).code).toBe(1)
    s.attached = [row(1, 'not_decrease'), row(0, 'increase'), row(2, 'increase'), row(3, 'not_decrease'), row(4, 'increase')]
    expect((await run(['--audit'])).err).toMatch(/primary \(metrics\[0\]\) is M2, not M1/)
    s.attached = allFive()
    s.results = finalResults({ ...GOOD_SUMS, 9102: { control: 81, chance_to_win: 102 } })
    const changed = await run(['--audit'])
    expect(changed.code).toBe(1)
    expect(changed.err).toMatch(/Do not tag measured-v1/)
    s.results = finalResults(GOOD_SUMS, false)
    const pending = await run(['--audit'])
    expect(pending.code).toBe(3)
    expect(pending.out).toMatch(/not final yet/)
    expect(writes()).toEqual([])
    expect(s.requests.length).toBeGreaterThan(20)
  }, 30000)

  it('respects the 5-minute refresh limit: a recent request means no POST and exit 3', async () => {
    s.results = { as_of: 'a', refresh_requested_at: new Date().toISOString(), last_error_at: null, payload: null, is_final: false }
    const r = await run()
    expect(r.code).toBe(3)
    expect(r.out).toMatch(/Re-run in \d+ s/)
    expect(s.requests.some((q) => q.path.endsWith('/results/refresh/'))).toBe(false)
  }, 30000)

  it('a 429 from Flagsmith is reported as "re-run later" (exit 3), not a failure', async () => {
    s.refreshStatus = 429
    const r = await run()
    expect(r.code).toBe(3)
    expect(r.out).toMatch(/refused the refresh/)
  }, 30000)

  it('refreshes once and verifies n and sum for every metric and arm against the recorded events', async () => {
    const r = await run()
    expect(r.err).toBe('')
    expect(r.code).toBe(0)
    expect(s.requests.filter((q) => q.path.endsWith('/results/refresh/'))).toHaveLength(1)
    expect(r.out).toMatch(/ALL FIVE METRICS MATCH/)
    expect(r.out).toMatch(/still RUNNING/)
    const t = JSON.parse(readFileSync(out, 'utf8'))
    expect(t.verification.allMatch).toBe(true)
    expect(t.verification.rows).toHaveLength(10)
    noSecrets(r.out)
    noSecrets(readFileSync(out, 'utf8'))
    // never ends, pauses or edits the experiment
    expect(s.requests.filter((q) => q.method !== 'GET').every((q) => /\/metrics\/$|\/results\/refresh\/$/.test(q.path))).toBe(true)
  }, 30000)

  it('a per-event Occurrence (M2 counting duplicates) fails the check and says not to end the experiment', async () => {
    s.sums = { ...GOOD_SUMS, 9102: { control: 81, chance_to_win: 102 } }
    const r = await run()
    expect(r.code).toBe(1)
    expect(r.err).toMatch(/do not match.*Do NOT end the experiment/)
    expect(JSON.parse(readFileSync(out, 'utf8')).verification.rows.filter((x: { match: boolean }) => !x.match).map((x: { metric: string }) => x.metric)).toEqual(['M2', 'M2'])
  }, 30000)
})
