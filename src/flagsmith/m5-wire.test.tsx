/**
 * Task 32, M5 (U-11, 28 §6) through the real copy buttons: the real routes, StudyProvider, SDK and the shared fake
 * network. `readout_rules_copied` goes out once per measured identity, only after its scores were sent, only when the
 * clipboard really took the text, and never from practice. The integration tests cover the guard itself; this proves
 * every page that offers the Rules wires it the same way.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../app/App'
import { MEASURED_ORDER, type Call } from '../content/scenarios.v1'
import { rulesMarkdown } from '../content/rules'
import { KEYS, lockCall, newAttempt, withStatus, writeAttempt, writePractice } from '../run/attemptStore'
import { buildPayload } from '../run/controller'
import { StudyProvider } from '../run/StudyContext'
import { __resetClient } from './client'
import { __resetDeliveryMonitor } from './deliveryMonitor'
import { events, fakeFetch, net, resetNet, until } from './fakeNetwork.testutil'

const UID = '11111111-2222-4333-8444-555555555555'
const CALLS6: Call[] = ['ship', 'control', 'collecting', 'distrust', 'ship', 'control']
const clipboard = { text: '', fail: false }

function seed(status: 'in_progress' | 'scored_pending' | 'sent_1' | 'sent_2') {
  localStorage.setItem(KEYS.uid, UID)
  let a = newAttempt({ uid: UID, variant: 'control', experimentId: 42, envName: 'development' })
  const locked = status === 'in_progress' ? 3 : 6
  for (let i = 0; i < locked; i++) a = lockCall(a, MEASURED_ORDER[i]!, CALLS6[i]!, 1500)
  if (status !== 'in_progress') a = withStatus(a, 'scored_pending', { scoredAt: new Date().toISOString(), payload: buildPayload(a, null) })
  if (status === 'sent_1' || status === 'sent_2') a = withStatus(a, 'sent_1', { delivery: { send1: status === 'sent_2' ? 'failed' : 'ok' } })
  if (status === 'sent_2') a = withStatus(a, 'sent_2', { delivery: { send1: 'failed', send2: 'ok' } })
  writeAttempt(a)
  return a
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
}

const wait = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)))
const copy = async (name: string) => {
  await act(async () => {
    // For 1.6 s after a copy the button reads "Copied".
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^(${name}|Copied)$`) }))
  })
  await wait(100)
}
const m5 = () => events().filter((e) => e.event === 'readout_rules_copied')
const eventPosts = () => net.requests.filter((r) => r.includes('/v1/events'))

beforeEach(() => {
  localStorage.clear()
  __resetClient()
  __resetDeliveryMonitor()
  resetNet()
  Object.assign(clipboard, { text: '', fail: false })
  vi.stubEnv('VITE_FLAGSMITH_ENV_KEY', 'test-client-env-key')
  vi.stubEnv('VITE_FLAGSMITH_ENV_NAME', 'development')
  vi.stubGlobal('fetch', vi.fn(fakeFetch))
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (t: string) => {
        if (clipboard.fail) throw new Error('denied')
        clipboard.text = t
      },
    },
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const PAGES: [string, string][] = [
  ['/rules', 'Copy as Markdown'],
  ['/team', 'Copy the Rules'],
  ['/readout/summary', 'Copy as Markdown'],
]

describe('M5 on the wire, from every page that offers the Rules', () => {
  it.each(PAGES)('%s: a sent attempt → one event with the attempt metadata; later copies and visits send none', async (at, name) => {
    const a = seed('sent_1')
    await visit(at)
    expect(net.requests).toEqual([]) // the page itself never contacts Flagsmith (28 §5)
    await copy(name)
    expect(clipboard.text).toBe(rulesMarkdown())
    await until(() => m5().length > 0)
    expect(m5()).toHaveLength(1)
    expect(m5()[0]).toMatchObject({ identifier: UID, value: null, metadata: { attemptId: a.id, send: 1 } })
    expect(localStorage.getItem(KEYS.rulesCopied)).not.toBeNull()
    // Nothing else rides along: no exposure, no score events.
    expect(events().map((e) => e.event)).toEqual(['readout_rules_copied'])

    await copy(name)
    cleanup()
    __resetClient()
    // A later visit: the guard is already set, so a copy doesn't even start Flagsmith.
    const before = net.requests.length
    await visit(at)
    await copy(name)
    await wait(200)
    expect(m5()).toHaveLength(1)
    expect(net.requests.length).toBe(before)
  })

  it('a re-sent attempt (sent_2) counts too, for the same identity', async () => {
    seed('sent_2')
    await visit('/rules')
    await copy('Copy as Markdown')
    await until(() => m5().length > 0)
    expect(m5()).toEqual([expect.objectContaining({ identifier: UID })])
  })

  it('the clipboard refused the text: nothing is sent and the guard stays unset, so a real copy later counts', async () => {
    seed('sent_1')
    await visit('/rules')
    clipboard.fail = true
    await copy('Copy as Markdown')
    await wait(200)
    expect(net.requests).toEqual([])
    expect(localStorage.getItem(KEYS.rulesCopied)).toBeNull()
    clipboard.fail = false
    await copy('Copy as Markdown')
    await until(() => m5().length > 0)
    expect(m5()).toHaveLength(1)
  })

  it('a live run not finished yet: a copy sends no M5 event', async () => {
    seed('in_progress')
    await visit('/rules')
    await copy('Copy as Markdown')
    await wait(300)
    expect(clipboard.text).toBe(rulesMarkdown())
    expect(m5()).toEqual([])
    expect(localStorage.getItem(KEYS.rulesCopied)).toBeNull()
  })

  it('scores saved but not sent: the visit sends them first; only then does a copy count, after them', async () => {
    seed('scored_pending')
    await visit('/rules')
    await until(() => events().some((e) => e.event === 'readout_score'))
    await copy('Copy as Markdown')
    await until(() => m5().length > 0)
    expect(events().map((e) => e.event)).toEqual([
      'readout_score',
      'readout_completed',
      'readout_loss_call',
      'readout_near_miss_call',
      'readout_rules_copied',
    ])
    expect(new Set(events().map((e) => e.identifier))).toEqual(new Set([UID]))
  })

  it.each([
    ['/rules', 'Copy as Markdown'],
    ['/team', 'Copy the Rules'],
    ['/practice/readout/summary', 'Copy as Markdown'],
  ])('practice only (no measured attempt), %s: a copy works and never contacts Flagsmith', async (at, name) => {
    writePractice({
      order: MEASURED_ORDER,
      answers: Object.fromEntries(MEASURED_ORDER.map((id, i) => [id, CALLS6[i]!])),
      finishedAt: new Date().toISOString(),
      framing: 'p_value',
    })
    await visit(at)
    await copy(name)
    await wait(200)
    expect(clipboard.text).toBe(rulesMarkdown())
    expect(net.requests).toEqual([])
    expect(eventPosts()).toEqual([])
  })
})
