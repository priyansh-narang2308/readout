/**
 * Task 28, on the wire: the real app routes (AppRoutes), the real StudyProvider with the real Flagsmith layer, the
 * real SDK, a fake network. 28 §5 "Never": no page except a live measured run records an exposure or sends an event;
 * pages for a finished, delivered attempt don't contact Flagsmith at all. 28 §8: a hidden page flushes during a live
 * measured run, and only once Flagsmith has been started on the page (StudyContext's visibilitychange handler).
 */
import { act, cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../app/App'
import { MEASURED_ORDER, type Call } from '../content/scenarios.v1'
import { KEYS, lockCall, newAttempt, withStatus, writeAttempt, writePractice } from '../run/attemptStore'
import { buildPayload } from '../run/controller'
import { StudyProvider } from '../run/StudyContext'
import { __resetClient, flagsmith } from './client'
import { __resetDeliveryMonitor } from './deliveryMonitor'
import { events, fakeFetch, net, resetNet, until } from './fakeNetwork.testutil'

const UID = '11111111-2222-4333-8444-555555555555'
const CALLS6: Call[] = ['ship', 'control', 'collecting', 'distrust', 'ship', 'control']

function seedAttempt(locked: number, delivered = false) {
  localStorage.setItem(KEYS.uid, UID)
  let a = newAttempt({ uid: UID, variant: 'chance_to_win', experimentId: 42, envName: 'development' })
  for (let i = 0; i < locked; i++) a = lockCall(a, MEASURED_ORDER[i]!, CALLS6[i]!, 2000)
  if (delivered) {
    a = withStatus(a, 'scored_pending', { scoredAt: new Date().toISOString(), payload: buildPayload(a, null) })
    a = withStatus(a, 'sent_1', { delivery: { send1: 'ok' } })
  }
  writeAttempt(a)
}

async function visit(at: string) {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[at]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <StudyProvider>
          <AppRoutes />
        </StudyProvider>
      </MemoryRouter>,
    )
  })
  // Long enough for an init, an exposure and its flush to reach the fake network if anything started one.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 150))
  })
}

const hide = (state: 'hidden' | 'visible') => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  localStorage.clear()
  __resetClient()
  __resetDeliveryMonitor()
  resetNet()
  vi.stubEnv('VITE_FLAGSMITH_ENV_KEY', 'test-client-env-key')
  vi.stubEnv('VITE_FLAGSMITH_ENV_NAME', 'development')
  vi.stubGlobal('fetch', vi.fn(fakeFetch))
})
afterEach(() => {
  cleanup()
  hide('visible')
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const AFTER_THE_RUN = ['/', '/readout', '/readout/3', '/readout/summary', '/rules', '/team', '/team/present', '/about', '/nope']

describe('exposure scope (28 §5)', () => {
  it.each(AFTER_THE_RUN)('a finished, delivered attempt: %s never contacts Flagsmith', async (at) => {
    seedAttempt(6, true)
    await visit(at)
    expect(net.requests).toEqual([])
  })

  it.each(['/', '/practice', '/rules', '/team/present', '/about'])('no attempt at all: %s never contacts Flagsmith', async (at) => {
    await visit(at)
    expect(net.requests).toEqual([])
  })

  it('a practice record: the practice readout never contacts Flagsmith', async () => {
    writePractice({
      order: MEASURED_ORDER,
      answers: Object.fromEntries(MEASURED_ORDER.map((id, i) => [id, CALLS6[i]!])),
      finishedAt: new Date().toISOString(),
      framing: 'chance_to_win',
    })
    for (const at of ['/practice/readout', '/practice/readout/2', '/practice/readout/summary']) {
      await visit(at)
      cleanup()
    }
    expect(net.requests).toEqual([])
  })

  it('positive control: resuming a live measured run on /challenge records exactly one exposure, for the stored arm', async () => {
    seedAttempt(2)
    await visit('/challenge')
    await until(() => events().some((e) => e.event === '$flag_exposure'))
    const exp = events().filter((e) => e.event === '$flag_exposure')
    expect(exp).toHaveLength(1)
    expect(exp[0]).toMatchObject({ identifier: UID, feature_name: 'readout_framing', value: 'chance_to_win' })
    expect(events().filter((e) => e.event !== '$flag_exposure')).toEqual([])
  })

  it.each(['/', '/rules', '/team', '/team/present', '/about'])(
    'a live measured run elsewhere (%s): the SDK resumes for the identity, but no exposure and no event is sent',
    async (at) => {
      seedAttempt(2)
      await visit(at)
      await until(() => net.requests.some((r) => r.includes('identities/')))
      await act(async () => {
        await flagsmith.flushEvents()
      })
      expect(net.batches).toEqual([])
    },
  )
})

describe('flush on hide (28 §8; wired in StudyContext)', () => {
  it('during a live measured run, hiding the page flushes; showing it again does not', async () => {
    seedAttempt(2)
    await visit('/challenge')
    await until(() => events().some((e) => e.event === '$flag_exposure'))
    const flush = vi.spyOn(flagsmith, 'flushEvents')
    hide('hidden')
    expect(flush).toHaveBeenCalledTimes(1)
    hide('visible')
    expect(flush).toHaveBeenCalledTimes(1)
  })

  it('practice: hiding the page never touches Flagsmith', async () => {
    await visit('/practice')
    const flush = vi.spyOn(flagsmith, 'flushEvents')
    hide('hidden')
    expect(flush).not.toHaveBeenCalled()
    expect(net.requests).toEqual([])
  })

  it('a finished, delivered attempt (Flagsmith never started on this page): hiding the page does nothing', async () => {
    seedAttempt(6, true)
    await visit('/readout/summary')
    const flush = vi.spyOn(flagsmith, 'flushEvents')
    hide('hidden')
    expect(flush).not.toHaveBeenCalled()
    expect(net.requests).toEqual([])
  })
})
