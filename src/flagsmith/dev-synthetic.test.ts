/**
 * scripts/dev-synthetic.mjs against a local fake Edge API and events API (never Flagsmith): it refuses without the
 * Development confirmations, labels every identity, injects the known difference and duplicates every second batch.
 * This proves the script, not the live pipeline: V-9 and F-8 are only passed by the Development run itself.
 */
import { spawn } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

type Ev = { event: string; identifier: string; value: string | null; metadata?: Record<string, unknown> }
const events: Ev[] = []
let server: Server
let base = ''
let failId = ''

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x')
    if (req.method === 'POST' && url.pathname.endsWith('/v1/events')) {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        events.push(...(JSON.parse(body) as { events: Ev[] }).events)
        res.writeHead(202).end()
      })
      return
    }
    if (url.pathname.includes('identities')) {
      const id = url.searchParams.get('identifier') ?? ''
      if (failId && id.endsWith(failId)) {
        req.socket.destroy() // like "fetch failed"
        return
      }
      const n = Number(id.slice(-3))
      const variant = n % 2 ? 'chance_to_win' : 'control'
      res.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          identifier: id,
          traits: [],
          flags: [
            {
              feature: { id: 1, name: 'readout_framing', type: 'MULTIVARIATE' },
              enabled: true,
              feature_state_value: variant,
              variant,
              metadata: { experiment: { id: 7, name: 'dev', in_experiment: true } },
            },
          ],
        }),
      )
      return
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end('[]')
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => server.close())

function run(args: string[], env: Record<string, string> = {}) {
  return new Promise<{ code: number | null; out: string; err: string }>((resolve) => {
    const p = spawn('node', ['scripts/dev-synthetic.mjs', ...args], {
      env: { PATH: process.env.PATH ?? '', ...env },
    })
    let out = ''
    let err = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (err += d))
    p.on('close', (code) => resolve({ code, out, err }))
  })
}
const OK = ['--environment', 'development', '--i-understand-this-is-synthetic']

describe('dev-synthetic.mjs', () => {
  it('refuses without --environment development, without the synthetic confirmation, or without a key', async () => {
    expect((await run(['--i-understand-this-is-synthetic'], { FLAGSMITH_DEV_CLIENT_KEY: 'k' })).code).toBe(2)
    expect((await run(['--environment', 'production', '--i-understand-this-is-synthetic'], { FLAGSMITH_DEV_CLIENT_KEY: 'k' })).code).toBe(2)
    expect((await run(['--environment', 'development'], { FLAGSMITH_DEV_CLIENT_KEY: 'k' })).code).toBe(2)
    expect((await run(OK)).code).toBe(2)
    const prod = await run(OK, { FLAGSMITH_DEV_CLIENT_KEY: 'same', VITE_FLAGSMITH_ENV_KEY: 'same', VITE_FLAGSMITH_ENV_NAME: 'production' })
    expect(prod.code).toBe(2)
    expect(prod.err).toMatch(/production build key/)
    expect(events).toEqual([])
  })

  it('labelled identities, one exposure each, the injected values, and every second batch duplicated', async () => {
    const r = await run([...OK, '--n', '8', '--api', `${base}/api/v1/`, '--events', `${base}/v1/events`], {
      FLAGSMITH_DEV_CLIENT_KEY: 'fake-dev-key-for-test',
    })
    expect(r.err).toBe('')
    expect(r.code).toBe(0)
    expect(r.out).toMatch(/^SYNTHETIC — Development — pipeline check only/)
    expect(r.out).not.toMatch(/fake-dev-key-for-test/)
    const ids = new Set(events.map((e) => e.identifier))
    expect(ids.size).toBe(8)
    for (const id of ids) expect(id).toMatch(/^synthetic-dev-[0-9a-f]{6}-\d{3}$/)
    expect(events.filter((e) => e.event === '$flag_exposure')).toHaveLength(8)
    const scores = events.filter((e) => e.event === 'readout_score')
    expect(scores).toHaveLength(8 + 4) // four identities sent their batch twice (F-8)
    for (const e of scores) {
      const n = Number(e.identifier.slice(-3))
      expect(Number(e.value)).toBeCloseTo(n % 2 ? 5 / 6 : 3 / 6, 10)
      expect(e.metadata).toMatchObject({ scenarioSet: 'synthetic-dev', synthetic: true })
    }
    const loss = events.filter((e) => e.event === 'readout_loss_call')
    for (const e of loss) expect(e.value).toBe(Number(e.identifier.slice(-3)) % 2 ? '1' : '0')
    // Per-identity Mean (what Flagsmith computes) is unchanged by the duplicates.
    const perId = new Map<string, number[]>()
    for (const e of scores) perId.set(e.identifier, [...(perId.get(e.identifier) ?? []), Number(e.value)])
    for (const [, vals] of perId) expect(new Set(vals).size).toBe(1)
  }, 30000)

  it('--f8: odd identities send one score of 1, even identities send 0 three times in separate POSTs', async () => {
    events.length = 0
    const r = await run([...OK, '--f8', '--n', '6', '--api', `${base}/api/v1/`, '--events', `${base}/v1/events`], {
      FLAGSMITH_DEV_CLIENT_KEY: 'fake-dev-key-for-test',
    })
    expect(r.err).toBe('')
    expect(r.code).toBe(0)
    expect(r.out).toMatch(/F-8 cohort/)
    expect(r.out).not.toMatch(/fake-dev-key-for-test/)
    // the fake assigns odd → chance_to_win, even → control
    expect(r.out).toMatch(/F-8 chance_to_win: pattern A \(one 1\) 3, pattern B \(0 sent three times\) 0/)
    expect(r.out).toMatch(/F-8 control: pattern A \(one 1\) 0, pattern B \(0 sent three times\) 3/)
    const scores = events.filter((e) => e.event === 'readout_score')
    for (const e of scores) {
      expect(e.identifier).toMatch(/^synthetic-dev-f8-[0-9a-f]{6}-\d{3}$/)
      expect(e.metadata).toMatchObject({ synthetic: true, f8: true })
    }
    const by = new Map<string, string[]>()
    for (const e of scores) by.set(e.identifier, [...(by.get(e.identifier) ?? []), String(e.value)])
    for (const [id, vals] of by) expect(vals).toEqual(Number(id.slice(-3)) % 2 ? ['1'] : ['0', '0', '0'])
    expect(events.filter((e) => e.event !== 'readout_score' && e.event !== '$flag_exposure')).toEqual([])
  }, 30000)

  it('prints the run id first and every identity, survives a network failure, and exits 1 naming it', async () => {
    events.length = 0
    failId = '-003'
    try {
      const r = await run([...OK, '--f8', '--n', '4', '--api', `${base}/api/v1/`, '--events', `${base}/v1/events`], {
        FLAGSMITH_DEV_CLIENT_KEY: 'fake-dev-key-for-test',
      })
      const lines = r.out.trim().split('\n')
      expect(lines[0]).toMatch(/^SYNTHETIC — Development — pipeline check only · run [0-9a-f]{6} · F-8 cohort$/)
      expect(lines[1]).toMatch(/^001 chance_to_win A ok$/)
      expect(lines[2]).toMatch(/^002 control B ok$/)
      expect(lines[3]).toMatch(/^003 unknown A ERROR at init/)
      expect(lines[4]).toMatch(/^004 control B ok$/)
      expect(r.out).toMatch(/errors 1/)
      expect(r.code).toBe(1)
      expect(new Set(events.map((e) => e.identifier.slice(-3)))).toEqual(new Set(['001', '002', '004']))
    } finally {
      failId = ''
    }
  }, 30000)

  it('--lookup re-reads arms of an earlier run and sends no events at all', async () => {
    events.length = 0
    const r = await run([...OK, '--f8', '--lookup', 'abc123', '--n', '4', '--api', `${base}/api/v1/`, '--events', `${base}/v1/events`], {
      FLAGSMITH_DEV_CLIENT_KEY: 'fake-dev-key-for-test',
    })
    expect(r.code).toBe(0)
    expect(r.out).toMatch(/run abc123 · F-8 cohort · LOOKUP \(no events sent\)/)
    expect(r.out).toMatch(/^001 chance_to_win A lookup$/m)
    expect(r.out).toMatch(/^002 control B lookup$/m)
    expect(r.out).toMatch(/F-8 control: pattern A \(one 1\) 0, pattern B \(0 sent three times\) 2/)
    await new Promise((res) => setTimeout(res, 300))
    expect(events).toEqual([])
    expect((await run([...OK, '--lookup', 'nothex'], { FLAGSMITH_DEV_CLIENT_KEY: 'k' })).code).toBe(2)
  }, 30000)
})
