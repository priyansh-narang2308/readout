/**
 * Task 30, through the whole real stack: the app routes, StudyProvider with the real Flagsmith layer, the real SDK
 * and the real MeasuredSession, on the shared fake network. One ordered log records every write of
 * readout.attempt, every useExperiment call, every trackEvent and every events POST.
 *
 * AC-2 / 29 §6.3 rule 2 "persist before acting": the attempt is saved before the exposure; the payload is saved,
 *   and the send claimed, before any score event is tracked.
 * V-5: one identity throughout, equal to readout.uid.
 * AC-1: with an attempt already stored (corrupt, void or finished), neither the landing page nor /challenge can
 *   start a second measured run, and nothing reaches the events API.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../app/App'
import { __resetClient, flagsmith } from '../flagsmith/client'
import { __resetDeliveryMonitor } from '../flagsmith/deliveryMonitor'
import { events, fakeFetch, net, resetNet, until } from '../flagsmith/fakeNetwork.testutil'
import { buildPayload } from './controller'
import { MEASURED_ORDER } from '../content/scenarios.v1'
import { KEYS, lockCall, newAttempt, withStatus, writeAttempt } from './attemptStore'
import { StudyProvider } from './StudyContext'

const log: string[] = []

vi.mock('@flagsmith/flagsmith/react', async (orig) => {
  const real = await orig<typeof import('@flagsmith/flagsmith/react')>()
  return {
    ...real,
    useExperiment: (...args: Parameters<typeof real.useExperiment>) => {
      log.push('useExperiment')
      return real.useExperiment(...args)
    },
  }
})

let path = ''
function Path() {
  path = useLocation().pathname
  return null
}

async function visit(at: string) {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[at]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <StudyProvider>
          <AppRoutes />
          <Path />
        </StudyProvider>
      </MemoryRouter>,
    )
  })
}

const first = (prefix: string) => log.findIndex((l) => l.startsWith(prefix))
const wait = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)))

beforeEach(() => {
  localStorage.clear()
  log.length = 0
  __resetClient()
  __resetDeliveryMonitor()
  resetNet()
  vi.stubEnv('VITE_FLAGSMITH_ENV_KEY', 'test-client-env-key')
  vi.stubEnv('VITE_FLAGSMITH_ENV_NAME', 'development')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url.includes('/v1/events')) {
        const names = (JSON.parse(String(init?.body)) as { events: { event: string }[] }).events.map((e) => e.event)
        log.push(`post:${names.join(',')}`)
      }
      return fakeFetch(input, init)
    }),
  )
  const setItem = Storage.prototype.setItem
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
    if (k === KEYS.attempt) {
      try {
        const a = JSON.parse(v) as { status: string; index?: number }
        log.push(`save:${a.status}:${a.index ?? '-'}`)
      } catch {
        log.push('save:unparseable')
      }
    }
    return setItem.call(this, k, v)
  })
  const track = flagsmith.trackEvent.bind(flagsmith)
  vi.spyOn(flagsmith, 'trackEvent').mockImplementation((name, opts) => {
    log.push(`track:${name}`)
    return track(name, opts)
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('persist before acting (AC-2, rule 2), on the real stack', () => {
  it('Start → six calls → flip: saved before exposed, payload saved and claimed before tracked, one identity', async () => {
    await visit('/')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start the challenge' }))
    })
    await until(() => path === '/challenge')
    await until(() => events().some((e) => e.event === '$flag_exposure'))

    // The attempt is on disk before the exposure is even requested, let alone posted.
    const saved = first('save:in_progress:0')
    expect(saved).toBeGreaterThanOrEqual(0)
    expect(saved).toBeLessThan(first('useExperiment'))
    expect(first('useExperiment')).toBeLessThan(first('post:$flag_exposure'))

    for (let i = 0; i < 6; i++) {
      fireEvent.keyDown(window, { key: String((i % 4) + 1) })
      fireEvent.keyDown(window, { key: 'Enter' })
      await wait(260)
    }
    await until(() => path === '/readout')

    // Each lock was saved, in order, and the run was scored before anything was tracked.
    const saves = log.filter((l) => l.startsWith('save:in_progress:')).map((l) => Number(l.split(':')[2]))
    expect([...new Set(saves)]).toEqual([0, 1, 2, 3, 4, 5, 6])
    const scored = first('save:scored_pending')
    const claimed = first('save:sent_1')
    const tracked = first('track:readout_score')
    expect(scored).toBeGreaterThan(log.lastIndexOf('save:in_progress:6'))
    expect(claimed).toBeGreaterThan(scored)
    expect(tracked).toBeGreaterThan(claimed)
    expect(first('post:readout_score')).toBeGreaterThan(tracked)

    // Exactly one exposure and one batch of four, all for the stored identity (V-5).
    const uid = localStorage.getItem(KEYS.uid)
    const sent = events()
    expect(sent.filter((e) => e.event === '$flag_exposure')).toHaveLength(1)
    expect(sent.filter((e) => e.event !== '$flag_exposure').map((e) => e.event)).toEqual([
      'readout_score',
      'readout_completed',
      'readout_loss_call',
      'readout_near_miss_call',
    ])
    expect(new Set(sent.map((e) => e.identifier))).toEqual(new Set([uid]))
  })
})

const UID = '11111111-2222-4333-8444-555555555555'
function finished(status: 'sent_1' | 'sent_2') {
  let a = newAttempt({ uid: UID, variant: 'control', experimentId: 42, envName: 'development' })
  MEASURED_ORDER.forEach((id) => (a = lockCall(a, id, 'control', 1000)))
  a = withStatus(a, 'scored_pending', { scoredAt: new Date().toISOString(), payload: buildPayload(a, null) })
  a = withStatus(a, 'sent_1', { delivery: { send1: status === 'sent_2' ? 'failed' : 'ok' } })
  if (status === 'sent_2') a = withStatus(a, 'sent_2', { delivery: { send1: 'failed', send2: 'ok' } })
  return a
}

const STORED: [string, () => void][] = [
  ['corrupt', () => localStorage.setItem(KEYS.attempt, '{"v":1,"status":"in_progress","answers":')],
  ['void', () => localStorage.setItem(KEYS.attempt, JSON.stringify({ v: 1, status: 'void', voidedAt: new Date().toISOString() }))],
  ['sent once', () => writeAttempt(finished('sent_1'))],
  ['sent twice', () => writeAttempt(finished('sent_2'))],
]

describe('one measured attempt per browser (AC-1), on the real stack', () => {
  it.each(STORED)('%s: the landing page offers practice only, /challenge never runs, nothing is sent', async (_, seed) => {
    localStorage.setItem(KEYS.uid, UID)
    seed()
    const before = localStorage.getItem(KEYS.attempt)
    await visit('/')
    expect(screen.queryByRole('button', { name: 'Start the challenge' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Continue/ })).toBeNull()
    cleanup()
    await visit('/challenge')
    await wait(150)
    expect(path).not.toBe('/challenge')
    expect(log).not.toContain('useExperiment')
    expect(net.requests.filter((r) => r.includes('/v1/events'))).toEqual([])
    // A corrupt record becomes void (kept, never deleted); any other record is untouched.
    if (_ === 'corrupt') expect(JSON.parse(localStorage.getItem(KEYS.attempt)!).status).toBe('void')
    else expect(localStorage.getItem(KEYS.attempt)).toBe(before)
  })
})
