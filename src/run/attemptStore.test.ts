/**
 * Saved-attempt storage (29 §6, 34 §4.5): the probe, guarded writes, strict validation, the state machine,
 * the derived landing state, multi-tab safety and practice isolation. Covers AC-1, AC-3, AC-4, AC-6 and F-4, F-11,
 * F-12 at the storage layer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MEASURED_ORDER, type Call, type ScenarioId } from '../content/scenarios.v1'
import {
  KEYS,
  assertTransition,
  attemptProblem,
  attemptState,
  captureRef,
  createAttempt,
  ensureUid,
  getRef,
  getUid,
  IllegalTransition,
  landingAction,
  loadAttempt,
  lockCall,
  newAttempt,
  readAttempt,
  readPractice,
  sendWork,
  storageAvailable,
  subscribeAttempt,
  updateAttempt,
  withStatus,
  write,
  writeAttempt,
  writePractice,
  type Attempt,
  type AttemptStatus,
  type Payload,
} from './attemptStore'

const UID = '11111111-2222-4333-8444-555555555555'
const CALLS6: Call[] = ['ship', 'control', 'collecting', 'distrust', 'ship', 'control']

beforeEach(() => window.localStorage.clear())
afterEach(() => vi.restoreAllMocks())

const fresh = () => newAttempt({ uid: UID, variant: 'chance_to_win', experimentId: 42, envName: 'development' })

function lockedThrough(n: number, a = fresh()): Attempt {
  for (let i = 0; i < n; i++) a = lockCall(a, MEASURED_ORDER[i]!, CALLS6[i]!, 1000 + i)
  return a
}

function payloadFor(a: Attempt): Payload {
  return {
    score: 3 / 6,
    lossCall: 1,
    nearMissCall: 0,
    metadata: { scenarioSet: 'v1', attemptId: a.id, answers: 'x', totalSeconds: 6, ref: null, variantMismatch: false },
  }
}

/** A scored record that differs from a valid one ONLY in its score. */
function withScore(score: number) {
  const s = scored()
  return { ...s, payload: { ...s.payload!, score } }
}

const scored = (a = lockedThrough(6)) =>
  withStatus(a, 'scored_pending', { scoredAt: '2026-11-15T10:00:00.000Z', payload: payloadFor(a) })
const sent1 = (d: 'pending' | 'ok' | 'failed' | 'unknown' = 'pending') => withStatus(scored(), 'sent_1', { delivery: { send1: d } })
const sent2 = () => {
  const a = sent1('failed')
  return withStatus(a, 'sent_2', { delivery: { ...a.delivery, send2: 'pending' } })
}

const stored = () => window.localStorage.getItem(KEYS.attempt)
const breakSetItem = () =>
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('quota', 'QuotaExceededError')
  })

// ---------- probe and safe storage ----------

describe('storage probe (29 §6.3 rule 5, F-4)', () => {
  it('passes with working storage and leaves no probe key behind', () => {
    expect(storageAvailable()).toBe(true)
    expect(window.localStorage.length).toBe(0)
  })

  it('fails when setItem throws (private mode, quota, storage disabled)', () => {
    breakSetItem()
    expect(storageAvailable()).toBe(false)
  })

  it('fails when a write silently does not stick', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {})
    expect(storageAvailable()).toBe(false)
  })

  it('fails when localStorage itself throws on access', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    expect(storageAvailable()).toBe(false)
  })

  it('write() reports a write that does not read back as a failure', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {})
    expect(write('k', 'v')).toBe(false)
  })
})

// ---------- identity and ref ----------

describe('browser ID and first-touch ref', () => {
  it('creates one ID and keeps it', () => {
    const a = ensureUid()
    expect(a).toMatch(/^[0-9a-f-]{36}$/)
    expect(ensureUid()).toBe(a)
    expect(getUid()).toBe(a)
  })

  it('replaces a malformed stored ID instead of using it', () => {
    window.localStorage.setItem(KEYS.uid, 'not-a-uuid')
    expect(getUid()).toBeNull()
    expect(ensureUid()).not.toBe('not-a-uuid')
  })

  it('stores the first sanitised ?ref= only, lower-cased, and never overwrites it', () => {
    captureRef('?ref=DevTo')
    captureRef('?ref=reddit')
    expect(getRef()).toBe('devto')
  })

  it('ignores a ref that is not a plain channel name', () => {
    captureRef('?ref=' + encodeURIComponent('<script>'))
    captureRef('?ref=' + 'a'.repeat(25))
    expect(getRef()).toBeNull()
  })
})

// ---------- creation: one measured attempt per browser (AC-1) ----------

describe('createAttempt (rule 1, AC-1)', () => {
  it('creates the attempt when no key exists and reads it back', () => {
    const a = fresh()
    const r = createAttempt(a)
    expect(r).toEqual({ ok: true, attempt: a })
    expect(readAttempt()).toEqual({ kind: 'ok', attempt: a })
  })

  it.each([
    ['an in-progress attempt', () => JSON.stringify(lockedThrough(2))],
    ['a finished attempt', () => JSON.stringify(sent2())],
    ['a void marker', () => JSON.stringify({ v: 1, status: 'void' })],
    ['corrupt JSON', () => '{{'],
    ['an empty string', () => ''],
  ])('refuses when the key holds %s, and leaves it untouched', (_, value) => {
    const v = value()
    window.localStorage.setItem(KEYS.attempt, v)
    expect(createAttempt(fresh())).toEqual({ ok: false, reason: 'exists' })
    expect(stored()).toBe(v)
  })

  it('refuses a record that is not a fresh, valid attempt', () => {
    expect(createAttempt(lockedThrough(1))).toEqual({ ok: false, reason: 'invalid' })
    expect(createAttempt({ ...fresh(), uid: 'x' })).toEqual({ ok: false, reason: 'invalid' })
    expect(stored()).toBeNull()
  })

  it('reports a failed write instead of assuming success', () => {
    breakSetItem()
    expect(createAttempt(fresh())).toEqual({ ok: false, reason: 'write_failed' })
  })
})

// ---------- validation ----------

describe('validation: every record the state machine produces is valid', () => {
  const steps: [string, () => Attempt][] = [
    ...[0, 1, 2, 3, 4, 5, 6].map((n) => [`in_progress at index ${n}`, () => lockedThrough(n)] as [string, () => Attempt]),
    ['scored_pending', () => scored()],
    ...(['pending', 'ok', 'failed', 'unknown'] as const).map(
      (d) => [`sent_1 (${d})`, () => sent1(d)] as [string, () => Attempt],
    ),
    ['sent_2', () => sent2()],
    ['sent_2 with outcome', () => ({ ...sent2(), delivery: { send1: 'failed', send2: 'ok' } }) as Attempt],
    ['variant mismatch flagged', () => ({ ...lockedThrough(2), variantMismatch: true })],
  ]
  it.each(steps)('%s round-trips through storage', (_, make) => {
    const a = make()
    expect(attemptProblem(a)).toBeNull()
    expect(writeAttempt(a)).toBe(true)
    expect(readAttempt()).toEqual({ kind: 'ok', attempt: a })
  })
})

describe('validation: anything else reads as corrupt (F-12)', () => {
  const two = () => lockedThrough(2)
  const bad: [string, unknown][] = [
    ['broken JSON', '{{'],
    ['a JSON string', '"x"'],
    ['null', null],
    ['an array', []],
    ['wrong version', { ...fresh(), v: 2 }],
    ['malformed id', { ...fresh(), id: 'abc' }],
    ['malformed uid', { ...fresh(), uid: 'abc' }],
    ['unknown variant', { ...fresh(), variant: 'foo' }],
    ['non-integer experiment id', { ...fresh(), experimentId: 1.5 }],
    ['unknown env', { ...fresh(), envName: 'staging' }],
    ['reordered results', { ...fresh(), order: [...MEASURED_ORDER].reverse() }],
    ['unknown status', { ...fresh(), status: 'done' }],
    ['index out of range', { ...fresh(), index: 7 }],
    ['answers not matching index', { ...two(), index: 3 }],
    ['answers out of order (index 2 holds results 3 and 4)', { ...two(), answers: { S5: 'ship', S2: 'ship' } }],
    ['an unknown call', { ...two(), answers: { ...two().answers, [MEASURED_ORDER[0]!]: 'maybe' } }],
    ['a NaN timing saved as null', { ...two(), msPerResult: { ...two().msPerResult, [MEASURED_ORDER[0]!]: null } }],
    ['a timing for an unanswered result', { ...two(), msPerResult: { ...two().msPerResult, S4: 5 } }],
    ['a negative timing', { ...two(), msPerResult: { [MEASURED_ORDER[0]!]: -1, [MEASURED_ORDER[1]!]: 1 } }],
    ['unparseable start time', { ...fresh(), startedAt: 'yesterday' }],
    ['a payload before scoring', { ...lockedThrough(6), payload: payloadFor(fresh()) }],
    ['delivery before scoring', { ...two(), delivery: { send1: 'ok' } }],
    ['scored with five answers', { ...scored(), index: 5, answers: lockedThrough(5).answers, msPerResult: {} }],
    ['scored without a payload', { ...scored(), payload: undefined }],
    ['scored without a time', { ...scored(), scoredAt: undefined }],
    ['payload for another attempt', { ...scored(), payload: payloadFor(fresh()) }],
    ['score out of range', withScore(7 / 6)],
    ['negative score', withScore(-1 / 6)],
    ['score not on sixths', withScore(0.3)],
    ['score as a count, not a fraction', withScore(3)],
    ['sent_1 without a delivery record', { ...sent1(), delivery: {} }],
    ['an unknown delivery value', { ...sent1(), delivery: { send1: 'maybe' } }],
    ['sent_2 although send 1 did not fail', { ...sent2(), delivery: { send1: 'ok', send2: 'pending' } }],
    ['sent_1 with a second send recorded', { ...sent1('failed'), delivery: { send1: 'failed', send2: 'ok' } }],
  ]
  it.each(bad)('%s', (_, value) => {
    // Strings are stored raw; anything else is stored as JSON.
    window.localStorage.setItem(KEYS.attempt, typeof value === 'string' ? value : JSON.stringify(value))
    expect(readAttempt()).toEqual({ kind: 'corrupt' })
  })

  it('writeAttempt refuses to store an invalid record, leaving the old one', () => {
    const a = lockedThrough(2)
    writeAttempt(a)
    expect(writeAttempt({ ...a, index: 4 })).toBe(false)
    expect(readAttempt()).toEqual({ kind: 'ok', attempt: a })
  })
})

describe('loadAttempt: corrupt becomes void, never deleted (rule 1)', () => {
  it('voids a corrupt record, after which no measured attempt can be created', () => {
    window.localStorage.setItem(KEYS.attempt, '{{')
    expect(loadAttempt()).toEqual({ kind: 'void' })
    expect(stored()).not.toBeNull()
    expect(readAttempt()).toEqual({ kind: 'void' })
    expect(createAttempt(fresh())).toEqual({ ok: false, reason: 'exists' })
  })

  it('reads an attempt voided by the state machine as void', () => {
    writeAttempt(withStatus(lockedThrough(2), 'void'))
    expect(loadAttempt()).toEqual({ kind: 'void' })
  })

  it('passes none and ok through untouched', () => {
    expect(loadAttempt()).toEqual({ kind: 'none' })
    expect(stored()).toBeNull()
    const a = lockedThrough(1)
    writeAttempt(a)
    expect(loadAttempt()).toEqual({ kind: 'ok', attempt: a })
  })
})

// ---------- state machine ----------

describe('transitions (29 §6.2)', () => {
  const S: AttemptStatus[] = ['in_progress', 'scored_pending', 'sent_1', 'sent_2', 'void']
  const LEGAL = new Set([
    'in_progress>in_progress',
    'in_progress>scored_pending',
    'in_progress>void',
    'scored_pending>sent_1',
    'sent_1>sent_1',
    'sent_1>sent_2',
    'sent_2>sent_2',
  ])
  const pairs = S.flatMap((f) => S.map((t) => [f, t] as const))
  it.each(pairs)('%s → %s', (f, t) => {
    if (LEGAL.has(`${f}>${t}`)) expect(() => assertTransition(f, t)).not.toThrow()
    else expect(() => assertTransition(f, t)).toThrow(IllegalTransition)
  })
})

describe('lockCall', () => {
  it('locks in the fixed order only, once each', () => {
    const a = lockedThrough(1)
    expect(() => lockCall(a, MEASURED_ORDER[0]!, 'ship', 1)).toThrow(IllegalTransition)
    expect(() => lockCall(a, MEASURED_ORDER[2]!, 'ship', 1)).toThrow(IllegalTransition)
    expect(lockCall(a, MEASURED_ORDER[1]!, 'distrust', 1).index).toBe(2)
  })

  it('refuses a seventh call and calls on a scored attempt', () => {
    expect(() => lockCall(lockedThrough(6), 'S1', 'ship', 1)).toThrow(IllegalTransition)
    expect(() => lockCall(scored(), 'S1', 'ship', 1)).toThrow(IllegalTransition)
  })

  it.each([
    [NaN, 0],
    [Infinity, 0],
    [-50, 0],
    [1234.6, 1235],
  ])('stores timing %s as %s, so the record stays valid', (ms, want) => {
    const a = lockCall(fresh(), MEASURED_ORDER[0]!, 'ship', ms)
    expect(a.msPerResult[MEASURED_ORDER[0]!]).toBe(want)
    expect(attemptProblem(a)).toBeNull()
  })
})

// ---------- guarded update (rule 3) and two tabs (F-11) ----------

describe('updateAttempt', () => {
  const lockNext = (call: Call) => (a: Attempt) => lockCall(a, a.order[a.index]!, call, 500)

  it('persists each answer before returning it (rule 2)', () => {
    let a = (createAttempt(fresh()) as { attempt: Attempt }).attempt
    for (let i = 0; i < 6; i++) {
      const r = updateAttempt({ id: a.id, status: 'in_progress' }, lockNext(CALLS6[i]!))
      expect(r.ok).toBe(true)
      a = (r as { attempt: Attempt }).attempt
      expect(readAttempt()).toEqual({ kind: 'ok', attempt: a })
    }
    expect(a.index).toBe(6)
  })

  it('two tabs: the second lock of the same result is refused, not applied twice', () => {
    const a = (createAttempt(fresh()) as { attempt: Attempt }).attempt
    // Both tabs show result 1 and lock it.
    const tabA = updateAttempt({ id: a.id, status: 'in_progress' }, (x) => lockCall(x, 'S3', 'ship', 1))
    const tabB = updateAttempt({ id: a.id, status: 'in_progress' }, (x) => lockCall(x, 'S3', 'distrust', 1))
    expect(tabA.ok).toBe(true)
    expect(tabB).toMatchObject({ ok: false, reason: 'illegal' })
    const now = readAttempt() as { attempt: Attempt }
    expect(now.attempt.answers).toEqual({ S3: 'ship' })
  })

  it('two tabs: a tab that still thinks the run is in progress cannot touch a scored attempt', () => {
    writeAttempt(scored())
    const r = updateAttempt({ id: scored().id, status: 'in_progress' }, (x) => x)
    expect(r).toMatchObject({ ok: false, reason: 'changed' })
  })

  it('never writes over a different attempt id', () => {
    const a = lockedThrough(1)
    writeAttempt(a)
    expect(updateAttempt({ id: fresh().id, status: 'in_progress' }, (x) => x)).toMatchObject({ reason: 'changed' })
    expect(readAttempt()).toEqual({ kind: 'ok', attempt: a })
  })

  it('refuses a change that would produce an invalid record and leaves storage as it was', () => {
    const a = lockedThrough(2)
    writeAttempt(a)
    const r = updateAttempt({ id: a.id, status: 'in_progress' }, (x) => ({ ...x, index: 5 }))
    expect(r).toMatchObject({ ok: false, reason: 'invalid' })
    expect(readAttempt()).toEqual({ kind: 'ok', attempt: a })
  })

  it('reports a failed write', () => {
    const a = lockedThrough(2)
    writeAttempt(a)
    breakSetItem()
    expect(updateAttempt({ id: a.id, status: 'in_progress' }, lockNext('ship'))).toMatchObject({
      ok: false,
      reason: 'write_failed',
    })
  })

  it('reports none when there is no attempt at all', () => {
    expect(updateAttempt({ id: fresh().id, status: 'in_progress' }, (x) => x)).toMatchObject({
      reason: 'changed',
      current: { kind: 'none' },
    })
  })
})

describe('subscribeAttempt (rule 4)', () => {
  const fire = (key: string | null) => window.dispatchEvent(new StorageEvent('storage', { key }))

  it('notifies on another tab changing the attempt or clearing storage, not on other keys', () => {
    const cb = vi.fn()
    const off = subscribeAttempt(cb)
    fire(KEYS.attempt)
    fire(null)
    fire(KEYS.ref)
    expect(cb).toHaveBeenCalledTimes(2)
    off()
    fire(KEYS.attempt)
    expect(cb).toHaveBeenCalledTimes(2)
  })
})

// ---------- derived state and landing action ----------

describe('attemptState and landingAction (25 §3, 34 §4.5)', () => {
  it('storage blocked → practice only, whatever is stored', () => {
    const s = attemptState(false, { kind: 'ok', attempt: lockedThrough(2) })
    expect(s).toEqual({ kind: 'blocked' })
    expect(landingAction(s)).toEqual({ kind: 'practice_only', reason: 'storage' })
  })

  it('no attempt → Start', () => {
    expect(landingAction(attemptState(true, { kind: 'none' }))).toEqual({ kind: 'start' })
  })

  it.each([0, 1, 3, 5, 6])('in progress at index %i → Continue, never start over (AC-3, AC-4)', (n) => {
    writeAttempt(lockedThrough(n))
    const s = attemptState(true, loadAttempt())
    expect(s.kind).toBe('in_progress')
    expect(landingAction(s)).toEqual({ kind: 'continue', result: Math.min(n + 1, 6) })
  })

  it('reload at index 3 resumes the same attempt with answers 1–3 intact (AC-3)', () => {
    const a = (createAttempt(fresh()) as { attempt: Attempt }).attempt
    let cur = a
    for (let i = 0; i < 3; i++) {
      cur = (updateAttempt({ id: cur.id, status: 'in_progress' }, (x) => lockCall(x, x.order[x.index]!, CALLS6[i]!, 1)) as {
        attempt: Attempt
      }).attempt
    }
    const after = loadAttempt() as { kind: 'ok'; attempt: Attempt }
    expect(after.attempt.id).toBe(a.id)
    expect(Object.keys(after.attempt.answers)).toEqual(MEASURED_ORDER.slice(0, 3))
    expect(landingAction(attemptState(true, after))).toEqual({ kind: 'continue', result: 4 })
    expect(createAttempt(fresh())).toEqual({ ok: false, reason: 'exists' })
  })

  it.each([
    ['scored, tab closed before tracking', () => scored(), 'send_1'],
    ['send 1 observed to fail', () => sent1('failed'), 'send_2'],
    ['send 1 never reported', () => sent1('pending'), 'mark_unknown'],
    ['send 1 ok', () => sent1('ok'), 'none'],
    ['send 1 unknown: never re-sent', () => sent1('unknown'), 'none'],
    ['sent twice: no further sends', () => sent2(), 'none'],
  ] as const)('finished, %s → practice only, delivery work %s', (_, make, work) => {
    const a = make()
    const s = attemptState(true, { kind: 'ok', attempt: a })
    expect(s).toEqual({ kind: 'finished', attempt: a, send: work })
    expect(sendWork(a)).toBe(work)
    expect(landingAction(s)).toEqual({ kind: 'practice_only', reason: 'done' })
  })

  it('void or corrupt → practice only', () => {
    expect(landingAction(attemptState(true, { kind: 'void' }))).toEqual({ kind: 'practice_only', reason: 'void' })
    expect(landingAction(attemptState(true, { kind: 'corrupt' }))).toEqual({ kind: 'practice_only', reason: 'void' })
  })
})

// ---------- practice (rule 5, AC-6) ----------

describe('practice record', () => {
  const answers = Object.fromEntries(MEASURED_ORDER.map((id, i) => [id, CALLS6[i]!])) as Record<ScenarioId, Call>
  const rec = () => ({
    order: [...MEASURED_ORDER].reverse(),
    answers,
    finishedAt: '2026-11-15T10:00:00.000Z',
    framing: 'p_value' as const,
  })

  it('round-trips and never touches the measured attempt (AC-6)', () => {
    const a = lockedThrough(2)
    writeAttempt(a)
    const before = stored()
    expect(writePractice(rec())).toBe(true)
    expect(readPractice()).toEqual(rec())
    expect(stored()).toBe(before)
  })

  it.each([
    ['five results', { ...rec(), order: MEASURED_ORDER.slice(0, 5) }],
    ['a repeated result', { ...rec(), order: ['S1', 'S1', 'S2', 'S3', 'S4', 'S5'] }],
    ['a missing answer', { ...rec(), answers: { ...answers, S4: undefined } }],
    ['an unknown call', { ...rec(), answers: { ...answers, S4: 'maybe' } }],
    ['an unknown framing', { ...rec(), framing: 'odds' }],
  ])('rejects %s', (_, bad) => {
    expect(writePractice(bad as never)).toBe(false)
    window.localStorage.setItem(KEYS.practice, JSON.stringify(bad))
    expect(readPractice()).toBeNull()
  })

  it('reads broken JSON as no practice record', () => {
    window.localStorage.setItem(KEYS.practice, '{{')
    expect(readPractice()).toBeNull()
  })
})
