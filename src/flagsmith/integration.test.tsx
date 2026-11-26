/**
 * The real @flagsmith/flagsmith 12.4.0 SDK, our real client / measurement / controller code and the real
 * MeasuredSession component, against a fake network. Only `fetch` is replaced: the Edge API answers like a running
 * experiment would, and every POST to the events API is captured as the SDK sent it.
 *
 * Proves, on the wire: nothing before Start (AC-7); Start enrols from the server (AC-8); `$flag_exposure` is sent
 * when MeasuredSession renders, through useExperiment inside a FlagsmithProvider; the four score events carry the
 * disclosed metadata; and a batch that fails on BOTH of the SDK's attempts is re-sent once as send 2 on the next
 * visit (AC-5), while one that fails once and succeeds on the SDK's retry is not (no duplicate).
 */
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DISCLOSED_EVENTS, DISCLOSED_METADATA, SDK_METADATA } from '../content/privacy'
import { MEASURED_ORDER, type Call } from '../content/scenarios.v1'
import { buildPayload } from '../run/controller'
import { KEYS, loadAttempt, withStatus, writeAttempt, type Attempt } from '../run/attemptStore'
import { finishChallenge, lockResult, onLoad, startChallenge } from '../run/controller'
import { realDeps } from '../run/StudyContext'
import { __resetClient } from './client'
import { __resetDeliveryMonitor } from './deliveryMonitor'
import { sendScores, trackRulesCopied } from './measurement'
import { MeasuredSession } from './MeasuredSession'
import { events, fakeFetch, net, resetNet, until } from './fakeNetwork.testutil'

const CALLS6: Call[] = ['ship', 'control', 'collecting', 'distrust', 'ship', 'control']
const stored = (): Attempt => {
  const s = loadAttempt()
  if (s.kind !== 'ok') throw new Error(`no attempt: ${s.kind}`)
  return s.attempt
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
  // Whatever a test did, nothing left this "browser" that the privacy page does not disclose (34 §4.3).
  const allowed = new Set<string>([...DISCLOSED_METADATA, ...SDK_METADATA])
  for (const e of events()) {
    expect(DISCLOSED_EVENTS).toContain(e.event)
    for (const k of Object.keys(e.metadata ?? {})) expect(allowed).toContain(k)
  }
  cleanup()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

async function playMeasured() {
  const deps = realDeps(true)
  const start = await startChallenge(deps)
  if (start.to !== 'challenge') throw new Error(`not enrolled: ${JSON.stringify(start)}`)
  const a = start.attempt
  const mismatch = vi.fn()
  await act(async () => {
    render(<MeasuredSession persistedVariant={a.variant} onVariantMismatch={mismatch} />)
  })
  await until(() => events().some((e) => e.event === '$flag_exposure'))
  for (const [i, id] of MEASURED_ORDER.entries()) expect((await lockResult(deps, a.id, id, CALLS6[i]!, 2000)).ok).toBe(true)
  return { deps, a, mismatch }
}

describe('real SDK on a fake network', () => {
  it('sends nothing at all before Start (AC-7)', async () => {
    await onLoad(realDeps(true)).work
    expect(net.requests).toEqual([])
  })

  it('Start enrols from the server, MeasuredSession records $flag_exposure, finishing sends the four score events', async () => {
    const { deps, a, mismatch } = await playMeasured()
    expect(a.variant).toBe('chance_to_win')
    expect(a.experimentId).toBe(42)
    expect(net.requests[0]).toMatch(/^GET https:\/\/edge\.api\.flagsmith\.com\/api\/v1\/identities\/\?identifier=/)

    const exposure = events().find((e) => e.event === '$flag_exposure')!
    expect(exposure).toMatchObject({ identifier: a.uid, value: 'chance_to_win', metadata: { experiment_id: 42 } })
    expect(mismatch).not.toHaveBeenCalled()

    const out = await finishChallenge(deps, a.id)
    expect(out.send).toBe('sent')
    const scores = events().filter((e) => e.event.startsWith('readout_'))
    expect(scores.map((e) => e.event)).toEqual(['readout_score', 'readout_completed', 'readout_loss_call', 'readout_near_miss_call'])
    for (const e of scores) {
      expect(e.identifier).toBe(a.uid)
      expect(e.metadata).toEqual({
        scenarioSet: 'v1',
        attemptId: a.id,
        answers: 'S3:ship,S1:control,S5:collecting,S2:distrust,S4:ship,S6:control',
        totalSeconds: 12,
        ref: null,
        variantMismatch: false,
        send: 1,
        sdk_version: '12.4.0',
      })
    }
    // The SDK's wire format sends `value` as a string (IEvent.value: string | null); null when there is none.
    expect(scores.map((e) => e.value)).toEqual([String(stored().payload!.score), null, String(stored().payload!.lossCall), String(stored().payload!.nearMissCall)])
    await until(() => stored().delivery.send1 === 'ok')
    expect(stored().status).toBe('sent_1')
  })

  it('one failure then the SDK retry succeeds: recorded ok, never re-sent (no duplicate)', async () => {
    const { deps, a } = await playMeasured()
    net.eventStatuses = [500, 202]
    await finishChallenge(deps, a.id)
    await until(() => stored().delivery.send1 === 'ok')
    __resetClient()
    await onLoad(realDeps(true)).work
    expect(events().filter((e) => e.event === 'readout_score')).toHaveLength(2) // the SDK's post and its retry
    expect(events().some((e) => e.metadata?.send === 2)).toBe(false)
    expect(stored().status).toBe('sent_1')
  }, 15000)

  it('AC-5: both SDK attempts fail → failed → next visit re-sends once as send 2', async () => {
    const { deps, a } = await playMeasured()
    net.eventStatuses = [500]
    await finishChallenge(deps, a.id)
    await until(() => stored().delivery.send1 === 'failed')
    expect(stored().status).toBe('sent_1')

    // Next visit: a fresh page load with the network back.
    net.eventStatuses = [202]
    __resetClient()
    __resetDeliveryMonitor()
    await onLoad(realDeps(true)).work
    const resent = events().filter((e) => e.metadata?.send === 2)
    expect(resent.map((e) => e.event)).toEqual(['readout_score', 'readout_completed', 'readout_loss_call', 'readout_near_miss_call'])
    await until(() => stored().delivery.send2 === 'ok')
    expect(stored().status).toBe('sent_2')

    // And never a third time.
    __resetClient()
    const before = net.batches.length
    await onLoad(realDeps(true)).work
    expect(net.batches.length).toBe(before)
  }, 15000)

  it('SDK not ready (a new page whose Flagsmith init failed): nothing is sent, the payload waits as scored_pending', async () => {
    const { a } = await playMeasured()
    // A reload before finishing, where the Edge API is down.
    __resetClient()
    net.identityStatus = 500
    await onLoad(realDeps(true)).work
    const before = events().length
    const out = await finishChallenge(realDeps(true), a.id)
    expect(out.send).toBe('not_ready')
    expect(stored().status).toBe('scored_pending')
    await new Promise((r) => setTimeout(r, 50))
    expect(events().length).toBe(before)
    // The next visit, with Flagsmith reachable, sends it once.
    __resetClient()
    net.identityStatus = 200
    await onLoad(realDeps(true)).work
    expect(events().filter((e) => e.event === 'readout_score')).toHaveLength(1)
    expect(stored().status).toBe('sent_1')
  })

  it('the claim cannot be saved: nothing is sent (an unsaved send could not be told from a lost one)', async () => {
    const { a } = await playMeasured()
    const s = stored()
    expect(writeAttempt(withStatus(s, 'scored_pending', { scoredAt: new Date().toISOString(), payload: buildPayload(s, null) }))).toBe(true)
    const real = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === KEYS.attempt) throw new Error('quota')
      return real.call(this, k, v)
    })
    expect(await sendScores(a.id)).toBe('save_failed')
    vi.restoreAllMocks()
    await new Promise((r) => setTimeout(r, 50))
    expect(events().some((e) => e.event === 'readout_score')).toBe(false)
    expect(stored().status).toBe('scored_pending')
  })

  it('not in the experiment: practice, no attempt, no exposure, no events', async () => {
    net.inExperiment = false
    const out = await startChallenge(realDeps(true))
    expect(out).toMatchObject({ to: 'practice', reason: 'not-in-experiment' })
    expect(localStorage.getItem('readout.attempt')).toBeNull()
    await new Promise((r) => setTimeout(r, 50))
    expect(net.batches).toEqual([])
  })

  it('a variant change after Start is flagged, never switched', async () => {
    const deps = realDeps(true)
    const start = await startChallenge(deps)
    if (start.to !== 'challenge') throw new Error('not enrolled')
    const mismatch = vi.fn()
    await act(async () => {
      render(<MeasuredSession persistedVariant="control" onVariantMismatch={mismatch} />)
    })
    await until(() => mismatch.mock.calls.length > 0)
  })

  it('M5: the first Rules copy after a sent attempt is sent once, with the attempt metadata; never again', async () => {
    const { deps, a } = await playMeasured()
    expect(await trackRulesCopied()).toBe(false) // still in progress: not measured yet
    await finishChallenge(deps, a.id)
    await until(() => stored().status === 'sent_1')
    const [first, same] = [trackRulesCopied(), trackRulesCopied()] // a double click shares one send
    expect(await first).toBe(true)
    expect(await same).toBe(true)
    expect(await trackRulesCopied()).toBe(false)
    await until(() => events().some((e) => e.event === 'readout_rules_copied'))
    const m5 = events().filter((e) => e.event === 'readout_rules_copied')
    expect(m5).toHaveLength(1)
    expect(m5[0]).toMatchObject({ identifier: a.uid, value: null, metadata: { attemptId: a.id, send: 1 } })
  })

  it('M5: an SDK that is not ready sends nothing and leaves the guard unset, so a later copy still counts', async () => {
    const { deps, a } = await playMeasured()
    await finishChallenge(deps, a.id)
    await until(() => stored().status === 'sent_1')
    // A later visit straight to the Rules page: nothing started the SDK, and the Edge API is down.
    __resetClient()
    net.identityStatus = 500
    await onLoad(realDeps(true)).work
    expect(await trackRulesCopied()).toBe(false)
    expect(localStorage.getItem(KEYS.rulesCopied)).toBeNull()
    // The next visit, Flagsmith reachable: the copy starts the SDK for the same identity and counts.
    __resetClient()
    net.identityStatus = 200
    await onLoad(realDeps(true)).work
    expect(await trackRulesCopied()).toBe(true)
    await until(() => events().some((e) => e.event === 'readout_rules_copied'))
  })

  it('M5: retries SDK init in the same session when a second copy happens after a transient Edge failure', async () => {
    const { deps, a } = await playMeasured()
    await finishChallenge(deps, a.id)
    await until(() => stored().status === 'sent_1')
    // Later visit straight to /rules: first copy hits Edge 500, second copy in the same page load recovers.
    __resetClient()
    net.identityStatus = 500
    await onLoad(realDeps(true)).work
    expect(await trackRulesCopied()).toBe(false)
    expect(localStorage.getItem(KEYS.rulesCopied)).toBeNull()
    net.identityStatus = 200
    expect(await trackRulesCopied()).toBe(true)
    await until(() => events().some((e) => e.event === 'readout_rules_copied'))
  })

  it('M5: never for a scored attempt whose scores were not sent yet (not measured), even with the SDK ready', async () => {
    const { a } = await playMeasured()
    const s = stored()
    expect(writeAttempt(withStatus(s, 'scored_pending', { scoredAt: new Date().toISOString(), payload: buildPayload(s, null) }))).toBe(true)
    expect(await trackRulesCopied()).toBe(false)
    expect(localStorage.getItem(KEYS.rulesCopied)).toBeNull()
    await new Promise((r) => setTimeout(r, 50))
    expect(events().some((e) => e.event === 'readout_rules_copied')).toBe(false)
    expect(a.uid).toBeTruthy()
  })

  it('M5: never from practice (no attempt)', async () => {
    expect(await trackRulesCopied()).toBe(false)
    await new Promise((r) => setTimeout(r, 50))
    expect(net.requests).toEqual([])
  })
})
