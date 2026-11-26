/**
 * Priority A: after the experiment, "ship the winner with the same flag" (12 §6). On the real routes, StudyProvider,
 * SDK and fake network:
 * - a consented Start that Flagsmith does not enrol (no running experiment) hands practice and the presenter the
 *   environment's current framing;
 * - that never records an exposure, and practice and the presenter never contact Flagsmith on their own;
 * - an unavailable or unknown flag falls back to the built-in default, never presented as Flagsmith's;
 * - a measured attempt keeps the arm it was assigned, whatever the flag says later.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate, type NavigateFunction } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../app/App'
import { MEASURED_ORDER } from '../content/scenarios.v1'
import { KEYS, newAttempt, writeAttempt } from '../run/attemptStore'
import { StudyProvider, useStudy } from '../run/StudyContext'
import { __resetClient, evaluateGate, rolloutFraming } from './client'
import { __resetDeliveryMonitor } from './deliveryMonitor'
import { events, fakeFetch, net, resetNet, until } from './fakeNetwork.testutil'

let path = ''
let nav: NavigateFunction
let source = ''
function Spy() {
  path = useLocation().pathname
  nav = useNavigate()
  source = useStudy().defaultFraming.source
  return null
}

async function visit(at: string) {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[at]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <StudyProvider>
          <Spy />
          <AppRoutes />
        </StudyProvider>
      </MemoryRouter>,
    )
  })
}
const wait = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)))
const shown = () => [...new Set([...document.querySelectorAll('[data-inference]')].map((e) => e.getAttribute('data-inference')))]
const identityCalls = () => net.requests.filter((r) => r.includes('identities/'))
const eventPosts = () => net.requests.filter((r) => r.includes('/v1/events'))

/** Landing → Start → refused → "Start practice". */
async function startRefusedThenPractise() {
  await visit('/')
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Start the challenge' }))
  })
  await until(() => !!screen.queryByRole('button', { name: 'Start practice' }))
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Start practice' }))
  })
  await until(() => path === '/practice')
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
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('the gate reports the rollout value only outside an experiment', () => {
  const fs = (flag: object | undefined, source = 'SERVER') => ({
    loadingState: { source } as never,
    getAllFlags: () => (flag ? { readout_framing: flag } : {}) as never,
  })

  it('accepts exactly the two framing values', () => {
    expect(rolloutFraming('p_value')).toBe('p_value')
    expect(rolloutFraming('chance_to_win')).toBe('chance_to_win')
    for (const v of ['control', 'CHANCE_TO_WIN', '', null, 1, undefined]) expect(rolloutFraming(v)).toBeUndefined()
  })

  it('no rollout from a cache, a missing or disabled flag, or an enrolled identity', () => {
    expect(evaluateGate(fs({ enabled: true, value: 'chance_to_win' }, 'CACHE'))).toEqual({ enrolled: false, reason: 'not-server' })
    expect(evaluateGate(fs(undefined))).toEqual({ enrolled: false, reason: 'flag-missing' })
    expect(evaluateGate(fs({ enabled: false, value: 'chance_to_win' }))).toEqual({ enrolled: false, reason: 'flag-disabled' })
    const enrolled = evaluateGate(fs({ enabled: true, value: 'chance_to_win', variant: 'chance_to_win', experiment: { id: 1, name: 'x', inExperiment: true } }))
    expect(enrolled).toMatchObject({ enrolled: true, variant: 'chance_to_win' })
    expect(enrolled).not.toHaveProperty('rollout')
    expect(evaluateGate(fs({ enabled: true, value: 'chance_to_win' }))).toEqual({ enrolled: false, reason: 'not-in-experiment', rollout: 'chance_to_win' })
    expect(evaluateGate(fs({ enabled: true, value: 'banana' }))).toEqual({ enrolled: false, reason: 'not-in-experiment' })
  })
})

describe('practice after the experiment, on the real stack', () => {
  it('environment value p_value → practice opens on the p-value line, from Flagsmith', async () => {
    Object.assign(net, { inExperiment: false, variant: 'p_value' })
    await startRefusedThenPractise()
    expect(shown()).toEqual(['p_value'])
    expect(source).toBe('flagsmith')
  })

  it('environment value chance_to_win → practice opens on the chance line (experiment ended, no metadata)', async () => {
    Object.assign(net, { experimentMetadata: false, variant: 'chance_to_win' })
    await startRefusedThenPractise()
    expect(shown()).toEqual(['chance_to_win'])
    expect(source).toBe('flagsmith')
  })

  it('the rollout read records no exposure and sends no event, in practice or on the presenter', async () => {
    Object.assign(net, { experimentMetadata: false, variant: 'chance_to_win' })
    await startRefusedThenPractise()
    const identity = identityCalls().length
    expect(identity).toBe(1) // the consented Start, nothing else
    await act(async () => nav('/team/present?r=3'))
    await wait(300)
    expect(shown()).toEqual(['chance_to_win'])
    await wait(1500)
    expect(eventPosts()).toEqual([])
    expect(events()).toEqual([])
    expect(identityCalls()).toHaveLength(identity)
  })

  it('Flagsmith unavailable → practice still works, on the built-in default, not labelled as Flagsmith’s', async () => {
    net.identityStatus = 500
    await startRefusedThenPractise()
    expect(shown()).toEqual(['p_value'])
    expect(source).toBe('default')
  })

  it('an unknown flag value → the built-in default', async () => {
    Object.assign(net, { inExperiment: false, variant: 'banana' })
    await startRefusedThenPractise()
    expect(shown()).toEqual(['p_value'])
    expect(source).toBe('default')
  })

  it('practice and the presenter opened directly never contact Flagsmith, and use the default', async () => {
    await visit('/practice')
    expect(shown()).toEqual(['p_value'])
    await act(async () => nav('/team/present?r=1'))
    await wait(1500)
    expect(shown()).toEqual(['p_value'])
    expect(net.requests).toEqual([])
    expect(source).toBe('default')
  })
})

describe('the measured run keeps its assigned arm', () => {
  it('a running experiment still decides the measured framing (enrolled in chance_to_win)', async () => {
    net.variant = 'chance_to_win'
    await visit('/')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start the challenge' }))
    })
    await until(() => path === '/challenge')
    expect(shown()).toEqual(['chance_to_win'])
    await until(() => events().some((e) => e.event === '$flag_exposure'))
  })

  it('a rollout after Start cannot change an attempt already running: it keeps its stored arm', async () => {
    const uid = '11111111-2222-4333-8444-555555555555'
    localStorage.setItem(KEYS.uid, uid)
    writeAttempt(newAttempt({ uid, variant: 'control', experimentId: 42, envName: 'development' }))
    // The flag now says chance_to_win for everyone and the experiment is over.
    Object.assign(net, { experimentMetadata: false, variant: 'chance_to_win' })
    await visit('/challenge')
    await wait(800)
    expect(shown()).toEqual(['p_value'])
    expect(MEASURED_ORDER[0]).toBe('S3')
  })
})
