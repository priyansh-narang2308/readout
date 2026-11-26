/**
 * Study controller (29 §6.2, 34 §4.1, 34 §4.5): the measured challenge's lifecycle, as plain functions over the
 * attempt store and an injected Flagsmith layer. React (StudyContext) only holds the resulting state.
 *
 *   load ─▶ nothing sent to Flagsmith unless an attempt this browser consented to exists (resume or deliver)
 *   Start ─▶ ID → Flagsmith identify + experiment gate (≤ 4 s) ─▶ enrolled: create the attempt ─▶ /challenge
 *                                                                └▶ not enrolled: practice, with the reason
 *   lock ─▶ guarded write of the answer BEFORE the next card renders
 *   finish ─▶ payload saved as scored_pending BEFORE any trackEvent ─▶ claim sent_1 ─▶ four events ─▶ flush (≤ 3 s)
 *
 * Deps are injected so tests can run the same code against fakes and against the real SDK on a fake network.
 */
import { answersString, lossCall, nearMissCall, score } from '../content/scoring'
import { SCENARIO_SET, type Call, type ScenarioId } from '../content/scenarios.v1'
import type { PracticeReason } from '../content/study'
import type { GateResult } from '../flagsmith/client'
import type { SendResult } from '../flagsmith/measurement'
import {
  attemptState,
  createAttempt,
  ensureUid,
  getRef,
  loadAttempt,
  locksAvailable,
  lockCall,
  newAttempt,
  updateAttempt,
  withAttemptLock,
  withStatus,
  type Attempt,
  type EnvName,
  type AttemptState,
  type Payload,
} from './attemptStore'

export type StudyDeps = {
  /** Identify with Flagsmith and evaluate the experiment gate (client.enrol). Capped at 4 s. */
  enrol: (uid: string) => Promise<GateResult>
  /** Initialise the SDK for an identity that already consented (client.initFlagsmith). */
  init: (uid: string) => Promise<void>
  /** Claim and send the four score events (measurement.sendScores). */
  sendScores: (attemptId: string) => Promise<SendResult>
  /** On-load delivery work (measurement.resendIfNeeded). */
  resend: () => Promise<'sent' | 'resent' | 'none'>
  envName: () => EnvName
  storageOk: () => boolean
  /** True when a Rules-copied event (M5) from an earlier visit failed or was never confirmed. Optional in tests. */
  m5Pending?: () => boolean
}

export const currentState = (deps: Pick<StudyDeps, 'storageOk'>): AttemptState =>
  attemptState(deps.storageOk(), loadAttempt())

// ---------- load ----------

/**
 * What the app does on load (34 §4.1). Returns the state at once and the background work as a promise.
 * A new visitor, a blocked browser and a void attempt cause NO Flagsmith request at all (AC-7).
 */
export function onLoad(deps: StudyDeps): { state: AttemptState; work: Promise<void> } {
  const state = currentState(deps)
  if (state.kind === 'in_progress') {
    // Resume: the exposure is re-fired by MeasuredSession once flags arrive (28 §5).
    return { state, work: deps.init(state.attempt.uid) }
  }
  if (state.kind === 'finished') {
    if (state.send === 'send_1' || state.send === 'send_2') {
      return { state, work: deps.init(state.attempt.uid).then(() => deps.resend().then(() => undefined)) }
    }
    if (state.send === 'mark_unknown') return { state, work: deps.resend().then(() => undefined) }
    // Scores done; only an unconfirmed M5 remains. Same consented identity, same one-off delivery work.
    if (deps.m5Pending?.()) return { state, work: deps.init(state.attempt.uid).then(() => deps.resend().then(() => undefined)) }
  }
  return { state, work: Promise.resolve() }
}

// ---------- start ----------

export type StartOutcome =
  | { to: 'challenge'; attempt: Attempt; resumed: boolean }
  | { to: 'practice'; reason: PracticeReason; gate?: GateResult }

/** Where a non-new state sends a Start press (AC-1: never a second measured attempt, never a restart). */
function routeExisting(state: AttemptState): StartOutcome | null {
  switch (state.kind) {
    case 'blocked':
      return { to: 'practice', reason: 'storage' }
    case 'in_progress':
      return { to: 'challenge', attempt: state.attempt, resumed: true }
    case 'finished':
      return { to: 'practice', reason: 'done' }
    case 'void':
      return { to: 'practice', reason: 'void' }
    case 'new':
      return null
  }
}

/**
 * Start (34 §4.1). The browser ID is created only now, the SDK is initialised only now, and the attempt is created
 * only if Flagsmith enrolled this identity in the running experiment with flags from the server (AC-8).
 */
export async function startChallenge(deps: StudyDeps): Promise<StartOutcome> {
  const before = routeExisting(currentState(deps))
  if (before) return before
  // No atomic cross-tab lock → no measured attempt (before any ID is created or Flagsmith is contacted).
  if (!locksAvailable()) return { to: 'practice', reason: 'unsupported' }
  // ID → gate → create run as one step across tabs: a second tab waits, then follows the first tab's attempt.
  return withAttemptLock(() => startLocked(deps))
}

async function startLocked(deps: StudyDeps): Promise<StartOutcome> {
  const before = routeExisting(currentState(deps))
  if (before) return before
  const uid = ensureUid()
  const gate = await deps.enrol(uid)
  if (!gate.enrolled) return { to: 'practice', reason: gate.reason, gate }
  // createAttempt refuses if another tab created an attempt while we waited for Flagsmith: follow that one.
  const created = createAttempt(
    newAttempt({ uid, variant: gate.variant, experimentId: gate.experimentId, envName: deps.envName() }),
  )
  if (created.ok) return { to: 'challenge', attempt: created.attempt, resumed: false }
  if (created.reason === 'exists') return routeExisting(currentState(deps)) ?? { to: 'practice', reason: 'done' }
  return { to: 'practice', reason: 'save_failed', gate }
}

// ---------- lock ----------

export type LockOutcome =
  | { ok: true; attempt: Attempt }
  /** Another tab already moved on: follow the stored state. */
  | { ok: false; reason: 'moved_on'; state: AttemptState }
  /** The answer could not be saved: stay on this card, nothing advanced. */
  | { ok: false; reason: 'save_failed'; state: AttemptState }

/**
 * Lock one call (25 §4.3). The answer is saved before this resolves; the next card renders only on ok. The guarded
 * read-modify-write runs under the cross-tab lock, so a second tab's answer for the same card sees this one and is
 * refused (lockCall only accepts the card at the stored index); it can never replace it.
 */
export function lockResult(
  deps: Pick<StudyDeps, 'storageOk'>,
  attemptId: string,
  id: ScenarioId,
  call: Call,
  ms: number,
): Promise<LockOutcome> {
  return withAttemptLock((): LockOutcome => {
    const r = updateAttempt({ id: attemptId, status: 'in_progress' }, (a) => lockCall(a, id, call, ms))
    if (r.ok) return { ok: true, attempt: r.attempt }
    const state = currentState(deps)
    return { ok: false, reason: r.reason === 'write_failed' ? 'save_failed' : 'moved_on', state }
  })
}

// ---------- finish ----------

export function buildPayload(a: Attempt, ref: string | null): Payload {
  const totalMs = Object.values(a.msPerResult).reduce<number>((s, x) => s + (x ?? 0), 0)
  return {
    score: score(a.answers),
    lossCall: lossCall(a.answers),
    nearMissCall: nearMissCall(a.answers),
    metadata: {
      scenarioSet: SCENARIO_SET,
      attemptId: a.id,
      answers: answersString(a.answers, a.order),
      totalSeconds: Math.round(totalMs / 1000),
      ref,
      variantMismatch: a.variantMismatch,
    },
  }
}

export type FinishOutcome = { state: AttemptState; send: SendResult | 'already_sent' }

/**
 * After the sixth call (25 §4.4): save the payload as scored_pending FIRST, then claim and send.
 * Delivery problems never reach the player: an unsent payload stays saved and goes out on the next visit.
 */
export async function finishChallenge(deps: StudyDeps, attemptId: string, now = new Date()): Promise<FinishOutcome> {
  // Scoring is one guarded write under the cross-tab lock: a second tab finishing at the same moment finds the attempt
  // already scored_pending and does not score it again. The payload is built from the stored answers, never the UI's.
  const state = await withAttemptLock(() => {
    const s = currentState(deps)
    if (s.kind === 'in_progress' && s.attempt.id === attemptId && s.attempt.index === 6) {
      updateAttempt({ id: attemptId, status: 'in_progress' }, (a) =>
        withStatus(a, 'scored_pending', { scoredAt: now.toISOString(), payload: buildPayload(a, getRef()) }),
      )
      return currentState(deps)
    }
    return s
  })
  if (state.kind !== 'finished' || state.attempt.id !== attemptId) return { state, send: 'skipped' }
  if (state.attempt.status !== 'scored_pending') return { state, send: 'already_sent' }
  const send = await deps.sendScores(attemptId)
  return { state: currentState(deps), send }
}

/** MeasuredSession saw a different variant from the one saved at Start (28 §5): flag it in the payload metadata. */
export function markVariantMismatch(attemptId: string): Promise<void> {
  return withAttemptLock(() => {
    updateAttempt({ id: attemptId, status: 'in_progress' }, (a) => ({ ...a, variantMismatch: true }))
  })
}
