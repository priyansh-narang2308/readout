/**
 * Delivery monitor (33 C-18).
 *
 * The SDK's flushEvents() resolves even when a batch was dropped, and its event processor retries a failed
 * batch once internally. So a resolved promise proves nothing. Instead, the SDK is given this fetch wrapper
 * (init option `fetch`). For requests to the events API it records the real HTTP outcome per batch key,
 * without modifying the request or response. All other requests pass straight through.
 *
 * Outcome per batch key: 'pending' while a request is in flight or a retry is still due, 'ok' once ANY attempt
 * returns 2xx (sticky), 'failed' only when the SDK has used all its attempts and every one failed.
 *
 * Retry: @flagsmith/flagsmith 12.4.0 (pinned) posts a failed batch once more after `retryBackoffMs` (1 s), then drops
 * it. So one failure is NOT final: calling it 'failed' then would trigger a re-send on the next visit even when the
 * SDK's own retry succeeds, which is a duplicate. A batch is 'failed' after SDK_ATTEMPTS failures.
 */

/** Attempts the pinned SDK makes per batch: the first post plus one retry (event-processor postBatch). */
export const SDK_ATTEMPTS = 2

export type Outcome = 'pending' | 'ok' | 'failed'

type Rec = { inFlight: number; ok: boolean; failures: number; lastStatus: number | null; events: string[] }

const records = new Map<string, Rec>()
const listeners = new Set<() => void>()
const log: { at: number; key: string; status: number | 'network-error'; events: string[] }[] = []
/** The log is for the debug panel only; it keeps the most recent entries so a long session can't grow it forever. */
export const LOG_LIMIT = 100
function pushLog(entry: (typeof log)[number]) {
  log.push(entry)
  if (log.length > LOG_LIMIT) log.splice(0, log.length - LOG_LIMIT)
}

export const EVENTS_HOST = 'events.api.flagsmith.com'

/** Batch key: `exposure:<identifier>` for exposures, `score:<attemptId>:<send>` for score events, else `other`. */
export function batchKeysFromBody(body: unknown): { keys: string[]; events: string[] } {
  if (typeof body !== 'string') return { keys: ['other'], events: [] }
  try {
    const parsed = JSON.parse(body) as { events?: { event: string; identifier?: string; metadata?: Record<string, unknown> }[] }
    const keys = new Set<string>()
    const events: string[] = []
    for (const e of parsed.events ?? []) {
      events.push(e.event)
      if (e.event === '$flag_exposure') keys.add(`exposure:${e.identifier ?? ''}`)
      else if (e.metadata && typeof e.metadata.devCheckId === 'string') keys.add(`devcheck:${e.metadata.devCheckId}`)
      else if (e.metadata && typeof e.metadata.attemptId === 'string')
        keys.add(`${e.event === 'readout_rules_copied' ? 'rules' : 'score'}:${e.metadata.attemptId}:${e.metadata.send ?? 1}`)
      else keys.add('other')
    }
    return { keys: keys.size ? [...keys] : ['other'], events }
  } catch {
    return { keys: ['other'], events: [] }
  }
}

function rec(key: string): Rec {
  let r = records.get(key)
  if (!r) {
    r = { inFlight: 0, ok: false, failures: 0, lastStatus: null, events: [] }
    records.set(key, r)
  }
  return r
}

function notify() {
  listeners.forEach((l) => l())
}

export function outcome(key: string): Outcome | undefined {
  const r = records.get(key)
  if (!r) return undefined
  if (r.ok) return 'ok'
  if (r.inFlight > 0 || r.failures < SDK_ATTEMPTS) return 'pending'
  return 'failed'
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function deliveryLog() {
  return log.slice()
}

/** Resolve when the key has a settled outcome or the timeout passes. */
export function waitForOutcome(key: string, timeoutMs: number): Promise<Outcome | undefined> {
  return new Promise((resolve) => {
    const done = () => {
      const o = outcome(key)
      if (o === 'ok' || o === 'failed') {
        cleanup()
        resolve(o)
      }
    }
    const timer = setTimeout(() => {
      cleanup()
      resolve(outcome(key))
    }, timeoutMs)
    const off = subscribe(done)
    function cleanup() {
      clearTimeout(timer)
      off()
    }
    done()
  })
}

type LikeFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export function createMonitoredFetch(base: LikeFetch = (...a) => fetch(...a)): LikeFetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!url.includes(EVENTS_HOST) && !url.includes('/v1/events')) return base(input, init)
    const { keys, events } = batchKeysFromBody(init?.body)
    keys.forEach((k) => {
      const r = rec(k)
      r.inFlight++
      r.events = events
    })
    notify()
    try {
      const res = await base(input, init)
      const ok = res.status >= 200 && res.status < 300
      keys.forEach((k) => {
        const r = rec(k)
        r.inFlight--
        r.lastStatus = res.status
        if (ok) r.ok = true
        else r.failures++
      })
      pushLog({ at: Date.now(), key: keys.join('|'), status: res.status, events })
      notify()
      return res
    } catch (err) {
      keys.forEach((k) => {
        const r = rec(k)
        r.inFlight--
        r.failures++
      })
      pushLog({ at: Date.now(), key: keys.join('|'), status: 'network-error', events })
      notify()
      throw err
    }
  }
}

/** Test helper. */
export function __resetDeliveryMonitor() {
  records.clear()
  log.length = 0
}
