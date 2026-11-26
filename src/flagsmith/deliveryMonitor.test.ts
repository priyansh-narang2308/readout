/** The monitor reports what happened on the wire, allowing for the SDK's own single retry (33 C-18). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetDeliveryMonitor,
  batchKeysFromBody,
  createMonitoredFetch,
  deliveryLog,
  LOG_LIMIT,
  outcome,
  SDK_ATTEMPTS,
  waitForOutcome,
} from './deliveryMonitor'

const URL_ = 'https://events.api.flagsmith.com/v1/events'
const body = JSON.stringify({ events: [{ event: 'readout_score', identifier: 'u', metadata: { attemptId: 'A', send: 1 } }] })
const respond = (status: number) => createMonitoredFetch(async () => new Response('', { status }))

beforeEach(() => __resetDeliveryMonitor())

describe('delivery monitor', () => {
  it('the pinned SDK makes two attempts per batch', () => expect(SDK_ATTEMPTS).toBe(2))

  it('one failure is still pending: the SDK retry is due', async () => {
    await respond(500)(URL_, { method: 'POST', body })
    expect(outcome('score:A:1')).toBe('pending')
  })

  it('two failures are failed', async () => {
    await respond(500)(URL_, { method: 'POST', body })
    await respond(503)(URL_, { method: 'POST', body })
    expect(outcome('score:A:1')).toBe('failed')
  })

  it('a network error counts as a failed attempt', async () => {
    const f = createMonitoredFetch(async () => {
      throw new TypeError('offline')
    })
    await expect(f(URL_, { method: 'POST', body })).rejects.toThrow()
    await expect(f(URL_, { method: 'POST', body })).rejects.toThrow()
    expect(outcome('score:A:1')).toBe('failed')
  })

  it('ok is sticky once any attempt succeeds', async () => {
    await respond(500)(URL_, { method: 'POST', body })
    await respond(202)(URL_, { method: 'POST', body })
    await respond(500)(URL_, { method: 'POST', body })
    expect(outcome('score:A:1')).toBe('ok')
  })

  it('does not watch requests that are not to the events API', async () => {
    await respond(500)('https://edge.api.flagsmith.com/api/v1/identities/?identifier=u', {})
    expect(outcome('other')).toBeUndefined()
  })
})

describe('batch keys: which batch a POST belongs to', () => {
  const b = (events: unknown[]) => JSON.stringify({ events })
  it('exposures by identity, scores and rules copies by attempt and send, dev checks by their own id', () => {
    expect(batchKeysFromBody(b([{ event: '$flag_exposure', identifier: 'u1' }])).keys).toEqual(['exposure:u1'])
    expect(batchKeysFromBody(b([{ event: 'readout_score', metadata: { attemptId: 'A', send: 2 } }])).keys).toEqual(['score:A:2'])
    expect(batchKeysFromBody(b([{ event: 'readout_score', metadata: { attemptId: 'A' } }])).keys).toEqual(['score:A:1'])
    expect(batchKeysFromBody(b([{ event: 'readout_rules_copied', metadata: { attemptId: 'A', send: 1 } }])).keys).toEqual(['rules:A:1'])
    expect(batchKeysFromBody(b([{ event: 'readout_dev_check', metadata: { devCheckId: 'D', attemptId: 'A' } }])).keys).toEqual(['devcheck:D'])
  })

  it('one batch with an exposure and four score events reports both keys, once each', () => {
    const four = ['readout_score', 'readout_completed', 'readout_loss_call', 'readout_near_miss_call'].map((event) => ({
      event,
      metadata: { attemptId: 'A', send: 1 },
    }))
    const r = batchKeysFromBody(b([{ event: '$flag_exposure', identifier: 'u1' }, ...four]))
    expect(r.keys.sort()).toEqual(['exposure:u1', 'score:A:1'])
    expect(r.events).toHaveLength(5)
  })

  it('anything unrecognisable is "other", never a score', () => {
    expect(batchKeysFromBody('not json').keys).toEqual(['other'])
    expect(batchKeysFromBody(undefined).keys).toEqual(['other'])
    expect(batchKeysFromBody(b([])).keys).toEqual(['other'])
    expect(batchKeysFromBody(b([{ event: 'x', metadata: {} }])).keys).toEqual(['other'])
  })
})

describe('waiting and the log', () => {
  afterEach(() => vi.useRealTimers())

  it('waitForOutcome resolves at once when settled, and with the current state when the time runs out', async () => {
    await respond(202)(URL_, { body })
    expect(await waitForOutcome('score:A:1', 50)).toBe('ok')
    expect(await waitForOutcome('score:none:1', 0)).toBeUndefined()
    vi.useFakeTimers()
    const never = createMonitoredFetch(() => new Promise<Response>(() => {}))
    void never(URL_, { body: JSON.stringify({ events: [{ event: 'readout_score', metadata: { attemptId: 'B', send: 1 } }] }) })
    const p = waitForOutcome('score:B:1', 3000)
    await vi.advanceTimersByTimeAsync(3000)
    expect(await p).toBe('pending')
  })

  it('the debug log keeps only the most recent entries', async () => {
    const ok = respond(202)
    for (let i = 0; i < LOG_LIMIT + 25; i++) {
      await ok(URL_, { body: JSON.stringify({ events: [{ event: 'readout_score', metadata: { attemptId: `A${i}`, send: 1 } }] }) })
    }
    const log = deliveryLog()
    expect(log).toHaveLength(LOG_LIMIT)
    expect(log[log.length - 1]!.key).toBe(`score:A${LOG_LIMIT + 24}:1`)
    expect(log[0]!.key).toBe('score:A25:1')
  })
})
