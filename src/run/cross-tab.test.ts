/**
 * Priority C: two tabs of one browser share localStorage and the Web Lock manager. These run two Starts (and two
 * sends) concurrently in one realm, with the gate held open so the windows overlap, which is exactly the race a
 * localStorage read-then-write cannot close on its own.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MEASURED_ORDER } from '../content/scenarios.v1'
import type { GateResult } from '../flagsmith/client'
import { __resetClient, initFlagsmith } from '../flagsmith/client'
import { __resetDeliveryMonitor } from '../flagsmith/deliveryMonitor'
import { events, fakeFetch, resetNet, until } from '../flagsmith/fakeNetwork.testutil'
import { sendScores } from '../flagsmith/measurement'
import { KEYS, getUid, lockCall, newAttempt, readAttempt, withAttemptLock, withStatus, writeAttempt } from './attemptStore'
import { buildPayload, finishChallenge, lockResult, markVariantMismatch, startChallenge, type StudyDeps } from './controller'

const ENROLLED: GateResult = { enrolled: true, variant: 'chance_to_win', experimentId: 42, experimentName: 'x', value: 'chance_to_win' }

function deps(enrol: StudyDeps['enrol']): StudyDeps {
  return {
    enrol,
    init: async () => undefined,
    sendScores: async () => 'sent',
    resend: async () => 'none',
    envName: () => 'development',
    storageOk: () => true,
  }
}

/** A gate that answers only when released, so both tabs are inside Start at once. */
function heldGate() {
  let release!: () => void
  const open = new Promise<void>((r) => (release = r))
  const calls: string[] = []
  const enrol = vi.fn(async (uid: string) => {
    calls.push(uid)
    await open
    return ENROLLED
  })
  return { enrol, calls, release }
}

let savedLocks: PropertyDescriptor | undefined
beforeEach(() => {
  localStorage.clear()
  savedLocks = Object.getOwnPropertyDescriptor(navigator, 'locks')
})
afterEach(() => {
  if (savedLocks) Object.defineProperty(navigator, 'locks', savedLocks)
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('simultaneous Start in two tabs', () => {
  it('creates one ID and one attempt; the second tab waits, then follows the first tab’s attempt', async () => {
    const g = heldGate()
    const tabA = startChallenge(deps(g.enrol))
    const tabB = startChallenge(deps(g.enrol))
    await new Promise((r) => setTimeout(r, 20))
    expect(g.enrol).toHaveBeenCalledTimes(1) // B is queued behind the lock, not racing the gate
    g.release()
    const [a, b] = await Promise.all([tabA, tabB])
    expect(a).toMatchObject({ to: 'challenge', resumed: false })
    expect(b).toMatchObject({ to: 'challenge', resumed: true })
    if (a.to !== 'challenge' || b.to !== 'challenge') throw new Error('unreachable')
    expect(b.attempt.id).toBe(a.attempt.id)
    expect(new Set(g.calls).size).toBe(1)
    expect(getUid()).toBe(g.calls[0])
    expect(g.enrol).toHaveBeenCalledTimes(1)
  })

  it('a browser without the Web Locks API gets practice: no ID, no Flagsmith contact, no attempt', async () => {
    Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true })
    const g = heldGate()
    const out = await startChallenge(deps(g.enrol))
    expect(out).toEqual({ to: 'practice', reason: 'unsupported' })
    expect(g.enrol).not.toHaveBeenCalled()
    expect(localStorage.getItem(KEYS.uid)).toBeNull()
    expect(localStorage.getItem(KEYS.attempt)).toBeNull()
  })

  it('a failed save in the first tab leaves no attempt; the second tab then tries cleanly, and only one exists', async () => {
    const g = heldGate()
    const setItem = Storage.prototype.setItem
    let failOnce = true
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === KEYS.attempt && failOnce) {
        failOnce = false
        throw new Error('QuotaExceededError')
      }
      return setItem.call(this, k, v)
    })
    const tabA = startChallenge(deps(g.enrol))
    const tabB = startChallenge(deps(g.enrol))
    g.release()
    const [a, b] = await Promise.all([tabA, tabB])
    expect(a).toMatchObject({ to: 'practice', reason: 'save_failed' })
    expect(b).toMatchObject({ to: 'challenge', resumed: false })
    const stored = readAttempt()
    expect(stored.kind === 'ok' && b.to === 'challenge' && stored.attempt.id === b.attempt.id).toBe(true)
  })

  it('an attempt that appears while a tab waits for the lock is followed, never overwritten', async () => {
    const g = heldGate()
    const tabA = startChallenge(deps(g.enrol))
    const tabB = startChallenge(deps(g.enrol))
    g.release()
    const [a] = await Promise.all([tabA, tabB])
    const third = await startChallenge(deps(g.enrol))
    expect(third).toMatchObject({ to: 'challenge', resumed: true })
    if (a.to !== 'challenge' || third.to !== 'challenge') throw new Error('unreachable')
    expect(third.attempt.id).toBe(a.attempt.id)
  })
})

describe('simultaneous score send in two tabs (real SDK, fake network)', () => {
  it('only one tab claims scored_pending → sent_1; the four score events go out once', async () => {
    vi.stubEnv('VITE_FLAGSMITH_ENV_KEY', 'test-client-env-key')
    vi.stubEnv('VITE_FLAGSMITH_ENV_NAME', 'development')
    vi.stubGlobal('fetch', vi.fn(fakeFetch))
    __resetClient()
    __resetDeliveryMonitor()
    resetNet()
    const uid = '11111111-2222-4333-8444-555555555555'
    localStorage.setItem(KEYS.uid, uid)
    let a = newAttempt({ uid, variant: 'control', experimentId: 42, envName: 'development' })
    for (const id of MEASURED_ORDER) a = lockCall(a, id, 'control', 1000)
    a = withStatus(a, 'scored_pending', { scoredAt: new Date().toISOString(), payload: buildPayload(a, null) })
    writeAttempt(a)
    await initFlagsmith(uid)
    const results = await Promise.all([sendScores(a.id), sendScores(a.id)])
    expect(results.sort()).toEqual(['sent', 'skipped'])
    await until(() => events().some((e) => e.event === 'readout_score'))
    await new Promise((r) => setTimeout(r, 300))
    expect(events().filter((e) => e.event === 'readout_score')).toHaveLength(1)
  })
})

const UID = '11111111-2222-4333-8444-555555555555'
function fresh() {
  localStorage.setItem(KEYS.uid, UID)
  return newAttempt({ uid: UID, variant: 'control', experimentId: 42, envName: 'development' })
}

describe('every other attempt write is serialised too', () => {
  it('two tabs answering the same card at once: one answer is stored, the other tab is told it moved on', async () => {
    const a = fresh()
    writeAttempt(a)
    const d = deps(async () => ENROLLED)
    const [x, y] = await Promise.all([
      lockResult(d, a.id, MEASURED_ORDER[0]!, 'ship', 900),
      lockResult(d, a.id, MEASURED_ORDER[0]!, 'distrust', 1100),
    ])
    expect([x.ok, y.ok]).toEqual([true, false])
    if (y.ok) throw new Error('unreachable')
    expect(y.reason).toBe('moved_on')
    const s = readAttempt()
    if (s.kind !== 'ok') throw new Error('no attempt')
    expect(s.attempt.answers[MEASURED_ORDER[0]!]).toBe('ship')
    expect(s.attempt.index).toBe(1)
  })

  it('two tabs finishing at once score the attempt once; both see the same scored attempt', async () => {
    let a = fresh()
    for (const id of MEASURED_ORDER) a = lockCall(a, id, 'control', 1000)
    writeAttempt(a)
    const sends = vi.fn(async () => 'sent' as const)
    const d = { ...deps(async () => ENROLLED), sendScores: sends }
    const [x, y] = await Promise.all([finishChallenge(d, a.id, new Date(1000)), finishChallenge(d, a.id, new Date(2000))])
    expect(x.state.kind).toBe('finished')
    expect(y.state.kind).toBe('finished')
    const s = readAttempt()
    if (s.kind !== 'ok') throw new Error('no attempt')
    expect(s.attempt.scoredAt).toBe(new Date(1000).toISOString()) // the second tab did not re-score
  })

  it('a variant-mismatch flag written while another tab answers keeps both changes', async () => {
    const a = fresh()
    writeAttempt(a)
    const d = deps(async () => ENROLLED)
    await Promise.all([markVariantMismatch(a.id), lockResult(d, a.id, MEASURED_ORDER[0]!, 'ship', 900)])
    const s = readAttempt()
    if (s.kind !== 'ok') throw new Error('no attempt')
    expect(s.attempt.variantMismatch).toBe(true)
    expect(s.attempt.answers[MEASURED_ORDER[0]!]).toBe('ship')
  })

  it('the attempt write path holds the lock: nothing writes the attempt while another holder is inside it', async () => {
    const a = fresh()
    writeAttempt(a)
    let release!: () => void
    const held = withAttemptLock(() => new Promise<void>((r) => (release = r)))
    const answer = lockResult(deps(async () => ENROLLED), a.id, MEASURED_ORDER[0]!, 'ship', 900)
    await new Promise((r) => setTimeout(r, 20))
    const mid = readAttempt()
    expect(mid.kind === 'ok' && mid.attempt.index).toBe(0) // still waiting for the lock
    release()
    await held
    expect((await answer).ok).toBe(true)
  })
})
