/**
 * Study controller with a fake Flagsmith layer: what is sent when, and what happens on every failed write.
 * The same functions run against the real SDK in flagsmith/integration.test.tsx.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MEASURED_ORDER, type Call } from '../content/scenarios.v1'
import type { GateResult } from '../flagsmith/client'
import type { SendResult } from '../flagsmith/measurement'
import { KEYS, createAttempt, getUid, loadAttempt, newAttempt, readAttempt, withStatus, writeAttempt } from './attemptStore'
import { buildPayload, finishChallenge, lockResult, markVariantMismatch, onLoad, startChallenge, type StudyDeps } from './controller'

const UID = '11111111-2222-4333-8444-555555555555'
const ENROLLED: GateResult = {
  enrolled: true,
  variant: 'chance_to_win',
  experimentId: 42,
  experimentName: 'readout framing',
  value: 'chance_to_win',
}
const CALLS6: Call[] = ['ship', 'control', 'collecting', 'distrust', 'ship', 'control']

function fakeDeps(over: Partial<StudyDeps> = {}) {
  const calls: string[] = []
  const deps: StudyDeps = {
    enrol: vi.fn(async (uid: string) => {
      calls.push(`enrol:${uid}`)
      return ENROLLED
    }),
    init: vi.fn(async (uid: string) => {
      calls.push(`init:${uid}`)
    }),
    sendScores: vi.fn(async (id: string): Promise<SendResult> => {
      calls.push(`send:${id}:${loadAttempt().kind === 'ok' ? (readAttempt() as { attempt: { status: string } }).attempt.status : '-'}`)
      return 'sent'
    }),
    resend: vi.fn(async () => {
      calls.push('resend')
      return 'none' as const
    }),
    envName: () => 'development',
    storageOk: () => true,
    ...over,
  }
  return { deps, calls }
}

function storedAttempt(status: 'in_progress' | 'scored_pending' | 'sent_1' = 'in_progress', index = 0) {
  let a = newAttempt({ uid: UID, variant: 'control', experimentId: 42, envName: 'development' })
  for (let i = 0; i < index; i++) {
    a = { ...a, answers: { ...a.answers, [MEASURED_ORDER[i]!]: CALLS6[i] }, msPerResult: { ...a.msPerResult, [MEASURED_ORDER[i]!]: 1000 }, index: i + 1 }
  }
  if (status !== 'in_progress') {
    a = withStatus(a, 'scored_pending', { scoredAt: new Date().toISOString(), payload: buildPayload(a, null) })
    if (status === 'sent_1') a = withStatus(a, 'sent_1', { delivery: { send1: 'ok' } })
  }
  expect(writeAttempt(a)).toBe(true)
  localStorage.setItem(KEYS.uid, UID)
  return a
}

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('on load (34 §4.1, AC-7)', () => {
  it('a new visitor causes no Flagsmith call', async () => {
    const { deps, calls } = fakeDeps()
    const { state, work } = onLoad(deps)
    await work
    expect(state.kind).toBe('new')
    expect(calls).toEqual([])
    expect(getUid()).toBeNull() // no browser ID before Start
  })

  it('blocked storage causes no Flagsmith call', async () => {
    const { deps, calls } = fakeDeps({ storageOk: () => false })
    const { state, work } = onLoad(deps)
    await work
    expect(state.kind).toBe('blocked')
    expect(calls).toEqual([])
  })

  it('a corrupt attempt is voided, kept, and causes no Flagsmith call', async () => {
    localStorage.setItem(KEYS.attempt, '{"nope":1}')
    const { deps, calls } = fakeDeps()
    const { state, work } = onLoad(deps)
    await work
    expect(state.kind).toBe('void')
    expect(localStorage.getItem(KEYS.attempt)).not.toBeNull()
    expect(calls).toEqual([])
  })

  it('an in-progress attempt re-initialises the SDK for its own identity (resume)', async () => {
    storedAttempt('in_progress', 2)
    const { deps, calls } = fakeDeps()
    const { state, work } = onLoad(deps)
    await work
    expect(state.kind).toBe('in_progress')
    expect(calls).toEqual([`init:${UID}`])
  })

  it('a scored_pending attempt initialises, then delivers', async () => {
    storedAttempt('scored_pending', 6)
    const { deps, calls } = fakeDeps()
    await onLoad(deps).work
    expect(calls).toEqual([`init:${UID}`, 'resend'])
  })

  it('a delivered attempt causes no Flagsmith call', async () => {
    storedAttempt('sent_1', 6)
    const { deps, calls } = fakeDeps()
    await onLoad(deps).work
    expect(calls).toEqual([])
  })
})

describe('Start (34 §4.1, AC-1, AC-8)', () => {
  it('enrolled: creates the ID, then enrols, then saves the attempt with the served variant', async () => {
    const { deps, calls } = fakeDeps()
    const out = await startChallenge(deps)
    expect(out.to).toBe('challenge')
    const uid = getUid()!
    expect(calls).toEqual([`enrol:${uid}`])
    const a = loadAttempt()
    expect(a.kind === 'ok' && a.attempt).toMatchObject({ uid, variant: 'chance_to_win', experimentId: 42, status: 'in_progress', index: 0 })
  })

  it('not enrolled: practice with the gate reason, and no attempt is created', async () => {
    const gate: GateResult = { enrolled: false, reason: 'not-in-experiment' }
    const { deps } = fakeDeps({ enrol: vi.fn(async () => gate) })
    expect(await startChallenge(deps)).toEqual({ to: 'practice', reason: 'not-in-experiment', gate })
    expect(localStorage.getItem(KEYS.attempt)).toBeNull()
  })

  it('an in-progress attempt resumes without asking Flagsmith again (never a second attempt)', async () => {
    const a = storedAttempt('in_progress', 3)
    const { deps, calls } = fakeDeps()
    const out = await startChallenge(deps)
    expect(out).toMatchObject({ to: 'challenge', resumed: true, attempt: { id: a.id, index: 3 } })
    expect(calls).toEqual([])
  })

  it('a finished attempt: practice, done', async () => {
    storedAttempt('sent_1', 6)
    const { deps, calls } = fakeDeps()
    expect(await startChallenge(deps)).toEqual({ to: 'practice', reason: 'done' })
    expect(calls).toEqual([])
  })

  it('blocked storage: practice, no ID, no Flagsmith call', async () => {
    const { deps, calls } = fakeDeps({ storageOk: () => false })
    expect(await startChallenge(deps)).toEqual({ to: 'practice', reason: 'storage' })
    expect(calls).toEqual([])
    expect(getUid()).toBeNull()
  })

  it('another tab created the attempt while Flagsmith answered: follow it, do not overwrite it', async () => {
    let other: ReturnType<typeof newAttempt> | null = null
    const { deps } = fakeDeps({
      enrol: vi.fn(async (uid: string) => {
        other = newAttempt({ uid, variant: 'control', experimentId: 42, envName: 'development' })
        expect(createAttempt(other).ok).toBe(true)
        return ENROLLED
      }),
    })
    const out = await startChallenge(deps)
    expect(out).toMatchObject({ to: 'challenge', resumed: true, attempt: { id: other!.id, variant: 'control' } })
  })

  it('the attempt cannot be saved: practice, save_failed', async () => {
    const { deps } = fakeDeps()
    const real = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === KEYS.attempt) throw new Error('quota')
      return real.call(this, k, v)
    })
    expect(await startChallenge(deps)).toMatchObject({ to: 'practice', reason: 'save_failed' })
  })
})

describe('lock (25 §4.3)', async () => {
  it('saves the answer before returning', async () => {
    const a = storedAttempt('in_progress', 0)
    const { deps } = fakeDeps()
    const out = await lockResult(deps, a.id, MEASURED_ORDER[0]!, 'ship', 1234)
    expect(out.ok).toBe(true)
    const s = loadAttempt()
    expect(s.kind === 'ok' && s.attempt.answers[MEASURED_ORDER[0]!]).toBe('ship')
    expect(s.kind === 'ok' && s.attempt.index).toBe(1)
  })

  it('a write failure is save_failed and nothing advances', async () => {
    const a = storedAttempt('in_progress', 0)
    const { deps } = fakeDeps()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    const out = await lockResult(deps, a.id, MEASURED_ORDER[0]!, 'ship', 1)
    expect(out).toMatchObject({ ok: false, reason: 'save_failed' })
    vi.restoreAllMocks()
    const s = loadAttempt()
    expect(s.kind === 'ok' && s.attempt.index).toBe(0)
  })

  it('another tab already locked this card: moved_on with the stored state', async () => {
    const a = storedAttempt('in_progress', 1)
    const { deps } = fakeDeps()
    const out = await lockResult(deps, a.id, MEASURED_ORDER[0]!, 'distrust', 1)
    expect(out).toMatchObject({ ok: false, reason: 'moved_on' })
    const s = loadAttempt()
    expect(s.kind === 'ok' && s.attempt.answers[MEASURED_ORDER[0]!]).toBe(CALLS6[0])
  })
})

describe('finish (25 §4.4, AC-3)', () => {
  it('saves the payload as scored_pending BEFORE asking to send', async () => {
    const a = storedAttempt('in_progress', 6)
    const { deps, calls } = fakeDeps()
    const out = await finishChallenge(deps, a.id)
    expect(calls).toEqual([`send:${a.id}:scored_pending`])
    expect(out.send).toBe('sent')
    const s = loadAttempt()
    expect(s.kind === 'ok' && s.attempt.payload?.metadata).toMatchObject({ attemptId: a.id, totalSeconds: 6 })
  })

  it('not_ready leaves the payload saved as scored_pending for the next visit', async () => {
    const a = storedAttempt('in_progress', 6)
    const { deps } = fakeDeps({ sendScores: vi.fn(async () => 'not_ready' as const) })
    const out = await finishChallenge(deps, a.id)
    expect(out.send).toBe('not_ready')
    expect(out.state).toMatchObject({ kind: 'finished', send: 'send_1' })
  })

  it('does not finish an attempt that has not answered all six', async () => {
    const a = storedAttempt('in_progress', 5)
    const { deps, calls } = fakeDeps()
    expect((await finishChallenge(deps, a.id)).send).toBe('skipped')
    expect(calls).toEqual([])
  })

  it('an already-sent attempt is never sent again', async () => {
    const a = storedAttempt('sent_1', 6)
    const { deps, calls } = fakeDeps()
    expect((await finishChallenge(deps, a.id)).send).toBe('already_sent')
    expect(calls).toEqual([])
  })
})

describe('variant mismatch (28 §5)', () => {
  it('flags the attempt and carries into the payload metadata', async () => {
    const a = storedAttempt('in_progress', 2)
    await markVariantMismatch(a.id)
    const s = loadAttempt()
    expect(s.kind === 'ok' && s.attempt.variantMismatch).toBe(true)
  })
})
