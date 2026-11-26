/**
 * Priority B: M5 (`readout_rules_copied`) delivery is observed and recoverable, on the real routes, SDK and fake
 * network. M5 is an Occurrence metric, so one re-send of an unconfirmed copy cannot change it; the Mean score events
 * keep their stricter rule (re-sent only when observed to fail, always with identical values).
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../app/App'
import { MEASURED_ORDER, type Call } from '../content/scenarios.v1'
import { KEYS, lockCall, newAttempt, withStatus, writeAttempt } from '../run/attemptStore'
import { buildPayload } from '../run/controller'
import { StudyProvider } from '../run/StudyContext'
import { __resetClient } from './client'
import { __resetDeliveryMonitor } from './deliveryMonitor'
import { events, fakeFetch, net, resetNet, until } from './fakeNetwork.testutil'
import { readRulesCopied, rulesCopiedNeedsResend } from './measurement'

const UID = '11111111-2222-4333-8444-555555555555'
const CALLS6: Call[] = ['ship', 'control', 'collecting', 'distrust', 'ship', 'control']

function seed(send1: 'ok' | 'failed' = 'ok') {
  localStorage.setItem(KEYS.uid, UID)
  let a = newAttempt({ uid: UID, variant: 'control', experimentId: 42, envName: 'development' })
  for (let i = 0; i < 6; i++) a = lockCall(a, MEASURED_ORDER[i]!, CALLS6[i]!, 1500)
  a = withStatus(a, 'scored_pending', { scoredAt: new Date().toISOString(), payload: buildPayload(a, null) })
  a = withStatus(a, 'sent_1', { delivery: { send1 } })
  writeAttempt(a)
  return a
}

async function visit(at: string) {
  cleanup()
  __resetClient()
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
const copy = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /^(Copy as Markdown|Copied)$/ }))
  })
}
const m5 = () => events().filter((e) => e.event === 'readout_rules_copied')

beforeEach(() => {
  localStorage.clear()
  __resetDeliveryMonitor()
  resetNet()
  vi.stubEnv('VITE_FLAGSMITH_ENV_KEY', 'test-client-env-key')
  vi.stubEnv('VITE_FLAGSMITH_ENV_NAME', 'development')
  vi.stubGlobal('fetch', vi.fn(fakeFetch))
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => undefined } })
})
afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('M5 delivery', () => {
  it('a delivered copy is recorded as ok, and a later visit sends nothing at all', async () => {
    const a = seed()
    await visit('/rules')
    await copy()
    await until(() => readRulesCopied()?.delivery === 'ok')
    expect(readRulesCopied()).toMatchObject({ attemptId: a.id, send: 1, delivery: 'ok' })
    expect(rulesCopiedNeedsResend()).toBe(false)
    const before = net.requests.length
    await visit('/about')
    await wait(500)
    expect(net.requests).toHaveLength(before)
  })

  it('a copy whose POST failed on both SDK attempts is re-sent once on the next visit, with send: 2', async () => {
    const a = seed()
    net.eventStatuses = [500]
    await visit('/rules')
    await copy()
    await until(() => readRulesCopied()?.delivery === 'failed', 10000)
    expect(rulesCopiedNeedsResend()).toBe(true)
    expect(m5().every((e) => e.metadata?.send === 1)).toBe(true)

    net.eventStatuses = [202]
    await visit('/about') // any page: the on-load delivery work
    await until(() => readRulesCopied()?.delivery === 'ok')
    const resent = m5().filter((e) => e.metadata?.send === 2)
    expect(resent).toHaveLength(1)
    expect(resent[0]).toMatchObject({ identifier: UID, metadata: { attemptId: a.id } })

    // Never a third send.
    const count = m5().length
    await visit('/about')
    await wait(800)
    expect(m5()).toHaveLength(count)
  }, 20000)

  it('if the one re-send also fails, it is not sent a third time', async () => {
    const a = seed()
    net.eventStatuses = [500]
    localStorage.setItem(KEYS.rulesCopied, JSON.stringify({ attemptId: a.id, send: 1, delivery: 'failed', at: new Date().toISOString() }))
    await visit('/')
    await until(() => readRulesCopied()?.delivery === 'failed' && readRulesCopied()?.send === 2, 10000)
    const count = m5().length
    await visit('/')
    await wait(2500)
    expect(m5()).toHaveLength(count)
    expect(rulesCopiedNeedsResend()).toBe(false)
  }, 20000)

  it('a copy left pending (tab closed mid-send) is re-sent once: harmless for an Occurrence metric', async () => {
    const a = seed()
    localStorage.setItem(KEYS.rulesCopied, JSON.stringify({ attemptId: a.id, send: 1, delivery: 'pending', at: new Date().toISOString() }))
    await visit('/')
    await until(() => readRulesCopied()?.delivery === 'ok')
    expect(m5().map((e) => e.metadata?.send)).toEqual([2])
    expect(events().map((e) => e.event)).toEqual(['readout_rules_copied']) // no exposure, no scores
  })

  it('an older plain-timestamp record counts as sent with unknown outcome, never as a fresh copy', () => {
    seed()
    localStorage.setItem(KEYS.rulesCopied, new Date().toISOString())
    expect(readRulesCopied()).toMatchObject({ send: 1, delivery: 'unknown' })
    expect(rulesCopiedNeedsResend()).toBe(false) // it can't be tied to this attempt, so it isn't re-sent
  })

  it('when both the scores and M5 need re-sending, the scores go first', async () => {
    const a = seed('failed')
    localStorage.setItem(KEYS.rulesCopied, JSON.stringify({ attemptId: a.id, send: 1, delivery: 'failed', at: new Date().toISOString() }))
    await visit('/')
    await until(() => readRulesCopied()?.delivery === 'ok')
    const order = events().map((e) => e.event)
    expect(order.indexOf('readout_score')).toBeGreaterThanOrEqual(0)
    expect(order.indexOf('readout_score')).toBeLessThan(order.indexOf('readout_rules_copied'))
  })
})

describe('Mean score events across a re-send', () => {
  it('send 1 and send 2 carry identical values and metadata apart from send, so a per-identity mean cannot move', async () => {
    seed('failed')
    await visit('/')
    await until(() => events().filter((e) => e.event === 'readout_score').length === 1)
    const strip = (e: (typeof net.batches)[number][number]) => ({ ...e, metadata: { ...e.metadata, send: undefined } })
    const s2 = events().filter((e) => e.metadata?.send === 2)
    expect(s2.map((e) => e.event).sort()).toEqual(['readout_completed', 'readout_loss_call', 'readout_near_miss_call', 'readout_score'])
    // The same stored payload drives both sends (the SDK sends values as strings, IEvent.value).
    const a = JSON.parse(localStorage.getItem(KEYS.attempt)!) as { payload: { score: number; lossCall: number; nearMissCall: number } }
    const byEvent = Object.fromEntries(s2.map((e) => [e.event, strip(e)]))
    expect(byEvent.readout_score!.value).toBe(String(a.payload.score))
    expect(byEvent.readout_loss_call!.value).toBe(String(a.payload.lossCall))
    expect(byEvent.readout_near_miss_call!.value).toBe(String(a.payload.nearMissCall))
  })
})
