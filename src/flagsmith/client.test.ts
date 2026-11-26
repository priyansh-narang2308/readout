/**
 * Task 27: the Flagsmith client against 28 §4. The init options row by row, the four-part readiness gate with every
 * refusal reason, and enrol's three ways to fall back to practice (not configured, SDK error, 4 s timeout). The real
 * SDK runs against the shared fake network; nothing leaves the test.
 */
import type { IFlagsmith } from '@flagsmith/flagsmith/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetClient, enrol, evaluateGate, FLAG_KEY, GATE_TIMEOUT_MS, initFlagsmith, initOptions, isReady } from './client'
import { fakeFetch, net, resetNet } from './fakeNetwork.testutil'

beforeEach(() => {
  __resetClient()
  resetNet()
  vi.stubEnv('VITE_FLAGSMITH_ENV_KEY', 'test-client-env-key')
  vi.stubEnv('VITE_FLAGSMITH_ENV_NAME', 'development')
  vi.stubGlobal('fetch', vi.fn(fakeFetch))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('init options (28 §4)', () => {
  it('match the spec table: identity at init, no cache, no defaults, default Edge API, events on, no analytics', () => {
    const o = initOptions('uid-1') as Record<string, unknown>
    expect(o.environmentID).toBe('test-client-env-key')
    expect(o.identity).toBe('uid-1')
    expect(o.cacheFlags).toBe(false)
    expect(o.realtime).toBe(false)
    expect(o.enableAnalytics).toBe(false)
    expect(o.enableEvents).toBe(true)
    expect(typeof o.fetch).toBe('function') // the delivery monitor
    expect('api' in o).toBe(false)
    expect('defaultFlags' in o).toBe(false)
    expect('eventProcessorConfig' in o).toBe(false)
  })

  it('logs in a Development build, never in production', () => {
    vi.stubEnv('MODE', 'development')
    expect((initOptions('uid-1') as Record<string, unknown>).enableLogs).toBe(true)
    vi.stubEnv('VITE_FLAGSMITH_ENV_NAME', 'production')
    expect((initOptions('uid-1') as Record<string, unknown>).enableLogs).toBe(false)
  })

  it('a blank key counts as not configured', () => {
    vi.stubEnv('VITE_FLAGSMITH_ENV_KEY', '   ')
    expect((initOptions('uid-1') as Record<string, unknown>).environmentID).toBeUndefined()
  })
})

type Fake = Pick<IFlagsmith, 'getAllFlags' | 'loadingState'>
const flag = (over: Record<string, unknown> = {}) => ({
  enabled: true,
  value: 'chance_to_win',
  variant: 'chance_to_win',
  experiment: { id: 42, name: 'readout framing', inExperiment: true },
  ...over,
})
const NONE = Symbol('no flag')
const fs = (source: string, f: unknown = flag()): Fake =>
  ({ loadingState: { source }, getAllFlags: () => (f === NONE ? {} : { [FLAG_KEY]: f }) }) as unknown as Fake

describe('readiness gate (28 §4: all four, or practice)', () => {
  it('enrols only from the server, with the flag, in the experiment, on a known variant', () => {
    expect(evaluateGate(fs('SERVER'))).toEqual({
      enrolled: true,
      variant: 'chance_to_win',
      experimentId: 42,
      experimentName: 'readout framing',
      value: 'chance_to_win',
    })
    expect(evaluateGate(fs('SERVER', flag({ variant: 'control' })))).toMatchObject({ enrolled: true, variant: 'control' })
  })

  it.each([
    ['cached flags', fs('CACHE'), 'not-server'],
    ['default flags', fs('DEFAULT_FLAGS'), 'not-server'],
    ['no loading state', { getAllFlags: () => ({}) } as unknown as Fake, 'not-server'],
    ['flag missing', fs('SERVER', NONE), 'flag-missing'],
    ['flag disabled', fs('SERVER', flag({ enabled: false })), 'flag-disabled'],
    ['no experiment on the flag', fs('SERVER', flag({ experiment: undefined })), 'not-in-experiment'],
    ['experiment without inExperiment', fs('SERVER', flag({ experiment: { id: 42, name: 'x' } })), 'not-in-experiment'],
    ['identity outside the experiment', fs('SERVER', flag({ experiment: { id: 42, name: 'x', inExperiment: false } })), 'not-in-experiment'],
    ['unknown variant', fs('SERVER', flag({ variant: 'treatment_b' })), 'unknown-variant'],
    ['no variant', fs('SERVER', flag({ variant: undefined })), 'unknown-variant'],
  ])('%s → practice (%s)', (_, f, reason) => {
    expect(evaluateGate(f)).toMatchObject({ enrolled: false, reason })
  })
})

describe('enrol (Start)', () => {
  it('not configured: practice without any network call', async () => {
    vi.stubEnv('VITE_FLAGSMITH_ENV_KEY', '')
    expect(await enrol('uid-1')).toEqual({ enrolled: false, reason: 'not-configured' })
    expect(net.requests).toEqual([])
  })

  it('the identity call fails: practice with sdk-error, never enrolled', async () => {
    net.identityStatus = 500
    expect(await enrol('uid-1')).toMatchObject({ enrolled: false, reason: 'sdk-error' })
    expect(isReady('uid-1')).toBe(false)
  })

  it('no answer within 4 s: practice with timeout', async () => {
    expect(GATE_TIMEOUT_MS).toBe(4000) // 28 §4
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    const p = enrol('uid-1')
    await vi.advanceTimersByTimeAsync(GATE_TIMEOUT_MS - 1)
    let settled = false
    void p.then(() => (settled = true))
    await Promise.resolve()
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await p).toEqual({ enrolled: false, reason: 'timeout' })
  })

  it('a running experiment enrols with the served variant; the identity is evaluated at init', async () => {
    net.variant = 'control'
    expect(await enrol('uid-1')).toMatchObject({ enrolled: true, variant: 'control', experimentId: 42 })
    expect(net.requests.some((r) => r.includes('identities/') && r.includes('identifier=uid-1'))).toBe(true)
    expect(isReady('uid-1')).toBe(true)
    expect(isReady('someone-else')).toBe(false)
  })

  it('initialises once per identity per page load', async () => {
    await initFlagsmith('uid-1')
    await initFlagsmith('uid-1')
    expect(net.requests.filter((r) => r.includes('identities/')).length).toBe(1)
    await initFlagsmith('uid-2')
    expect(net.requests.filter((r) => r.includes('identifier=uid-2')).length).toBe(1)
  })
})
