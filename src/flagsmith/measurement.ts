/**
 * measurement.ts — the ONLY module allowed to call trackEvent / flushEvents (29 §3; checked by
 * scripts/check-isolation.mjs). FROZEN at tag measured-v1.
 *
 * Event names and metadata here MUST equal the disclosed list in src/content/privacy.ts (34 §4.3);
 * a unit test enforces it.
 */
import { envName, flagsmith, initFlagsmith, isReady } from './client'
import { outcome, waitForOutcome } from './deliveryMonitor'
import {
  KEYS,
  read,
  readAttempt,
  sendWork,
  updateAttempt,
  withAttemptLock,
  withStatus,
  write,
  type Attempt,
  type Delivery,
  type Metadata,
} from '../run/attemptStore'

export const EVENT = {
  score: 'readout_score',
  completed: 'readout_completed',
  lossCall: 'readout_loss_call',
  nearMissCall: 'readout_near_miss_call',
  rulesCopied: 'readout_rules_copied',
} as const

export const FLUSH_CAP_MS = 3000

export function scoreBatchKey(attemptId: string, send: 1 | 2) {
  return `score:${attemptId}:${send}`
}

export function exposureKey(uid: string) {
  return `exposure:${uid}`
}

/** Build the exact four events for a scored attempt. Pure; used by tests. */
export function buildScoreEvents(a: Attempt, send: 1 | 2) {
  if (!a.payload) throw new Error('no payload')
  const metadata: Metadata = { ...a.payload.metadata, send }
  return [
    { event: EVENT.score, value: a.payload.score, metadata },
    { event: EVENT.completed, value: undefined, metadata },
    { event: EVENT.lossCall, value: a.payload.lossCall, metadata },
    { event: EVENT.nearMissCall, value: a.payload.nearMissCall, metadata },
  ]
}

// ---------- Development-only connection check (28 §10, before V-1…V-9) ----------

/**
 * Not a study event and not in the disclosed list: it can only be sent from a non-production build, by the team,
 * to the Development environment. It proves the SDK → events API → warehouse path with one clearly named event.
 */
export const DEV_CHECK_EVENT = 'readout_dev_check'

export function devCheckKey(id: string) {
  return `devcheck:${id}`
}

export async function sendDevConnectionCheck(
  identity: string,
  id: string,
  timeoutMs = 15000,
): Promise<{ key: string; outcome: ReturnType<typeof outcome> }> {
  if (envName() === 'production') throw new Error('The dev connection check is disabled in production builds.')
  if (!identity.startsWith('dev-check-')) throw new Error('Dev check identities must start with "dev-check-".')
  flagsmith.trackEvent(DEV_CHECK_EVENT, {
    identifier: identity,
    value: 1,
    metadata: { devCheckId: id, purpose: 'development connection check, not study data' },
  })
  await flagsmith.flushEvents()
  const key = devCheckKey(id)
  // flushEvents() resolving proves nothing (C-18): report only what the monitor observed on the wire.
  return { key, outcome: await waitForOutcome(key, timeoutMs) }
}

/** After the exposure is buffered by useExperiment: flush at once so early abandoners still count (28 §5). */
export function flushExposure(): void {
  void flagsmith.flushEvents()
}

/** Page hidden during a run: best-effort flush. */
export function flushOnHide(): void {
  void flagsmith.flushEvents()
}

function sendBatch(a: Attempt, send: 1 | 2) {
  for (const e of buildScoreEvents(a, send)) {
    flagsmith.trackEvent(e.event, {
      identifier: a.uid,
      ...(e.value !== undefined ? { value: e.value } : {}),
      metadata: e.metadata as unknown as Record<string, unknown>,
    })
  }
}

function toDelivery(o: ReturnType<typeof outcome>): Delivery {
  return o === 'ok' ? 'ok' : o === 'failed' ? 'failed' : o === 'pending' ? 'pending' : 'unknown'
}

/** Record the observed outcome of send 1 or 2, only if this attempt is still the stored one (guarded write). */
function recordDelivery(attemptId: string, send: 1 | 2, d: Delivery): Promise<void> {
  // Under the cross-tab lock: a delivery record only ever touches `delivery`, never answers or payload.
  return withAttemptLock(() => {
    const cur = readAttempt()
    if (cur.kind !== 'ok' || cur.attempt.id !== attemptId) return
    const field = send === 1 ? 'send1' : 'send2'
    const prev = cur.attempt.delivery[field]
    // 'ok' is final, and a send-1 failure that already triggered send 2 must stay 'failed'.
    if (prev === 'ok' || (send === 1 && cur.attempt.status === 'sent_2')) return
    updateAttempt({ id: attemptId, status: cur.attempt.status }, (a) => ({
      ...a,
      delivery: { ...a.delivery, [field]: d },
    }))
  })
}

/** Why a send did not happen. The attempt is left as it was, so the next visit can try again. */
export type SendResult = 'sent' | 'not_ready' | 'skipped' | 'save_failed'

/**
 * Claim, then send (29 §6.3 rules 2–3). The status moves first (guarded write: only the tab that moves it sends),
 * then the four events are tracked and flushed. If the claim can't be saved, nothing is sent: an unsaved send could
 * not be told apart from a lost one, and would be sent again.
 */
function claimAndSend(attemptId: string, from: 'scored_pending' | 'sent_1'): { sent: Attempt; send: 1 | 2 } | SendResult {
  const send = from === 'scored_pending' ? 1 : 2
  const claim = updateAttempt({ id: attemptId, status: from }, (a) =>
    send === 1
      ? withStatus(a, 'sent_1', { delivery: { send1: 'pending' } })
      : withStatus(a, 'sent_2', { delivery: { ...a.delivery, send2: 'pending' } }),
  )
  if (!claim.ok) return claim.reason === 'write_failed' ? 'save_failed' : 'skipped'
  sendBatch(claim.attempt, send)
  return { sent: claim.attempt, send }
}

function observe(attemptId: string, send: 1 | 2): Promise<ReturnType<typeof outcome>> {
  const key = scoreBatchKey(attemptId, send)
  void flagsmith.flushEvents()
  // The SDK retries a failed batch once after ~1 s; keep observing well past the UI cap.
  void waitForOutcome(key, 15000).then((o) => recordDelivery(attemptId, send, toDelivery(o)))
  return waitForOutcome(key, FLUSH_CAP_MS)
}

/**
 * scored_pending → claim sent_1 → track ×4 → flush, capped at FLUSH_CAP_MS for the UI (25 §4.4).
 * The caller must have persisted the payload (status scored_pending) first. Sends only if the SDK is really ready
 * for this identity; otherwise the attempt stays scored_pending and the next visit sends it.
 */
export async function sendScores(attemptId: string): Promise<SendResult> {
  // Check, claim and track under the cross-tab lock: only one tab can move scored_pending → sent_1.
  const r = await withAttemptLock((): ReturnType<typeof claimAndSend> => {
    const cur = readAttempt()
    if (cur.kind !== 'ok' || cur.attempt.id !== attemptId || cur.attempt.status !== 'scored_pending') return 'skipped'
    if (!isReady(cur.attempt.uid)) return 'not_ready'
    return claimAndSend(attemptId, 'scored_pending')
  })
  if (typeof r === 'string') return r
  await observe(attemptId, 1)
  return 'sent'
}

/**
 * On app load (28 §8, 33 C-18), after the SDK is initialised for the attempt's identity:
 *  - scored_pending (tab closed before tracking, or SDK wasn't ready) → send 1;
 *  - sent_1 whose delivery was OBSERVED to fail on every SDK attempt → re-send once with send: 2;
 *  - sent_1 still 'pending' (tab closed mid-flush) → recorded as 'unknown' and never re-sent: a duplicate may
 *    inflate Mean metrics, and we can't know it was lost.
 */
export async function resendIfNeeded(): Promise<'sent' | 'resent' | 'none'> {
  const r = await resendScoresIfNeeded()
  // M5 comes after the scores, as on the first send; never before them.
  await resendRulesCopiedIfNeeded()
  return r
}

async function resendScoresIfNeeded(): Promise<'sent' | 'resent' | 'none'> {
  const cur = readAttempt()
  if (cur.kind !== 'ok') return 'none'
  const a = cur.attempt
  const work = sendWork(a)
  if (work === 'send_1') return (await sendScores(a.id)) === 'sent' ? 'sent' : 'none'
  if (work === 'send_2') {
    if (!isReady(a.uid)) return 'none'
    const r = await withAttemptLock(() => claimAndSend(a.id, 'sent_1'))
    if (typeof r === 'string') return 'none'
    await observe(a.id, 2)
    return 'resent'
  }
  if (work === 'mark_unknown') {
    await withAttemptLock(() =>
      updateAttempt({ id: a.id, status: 'sent_1' }, (x) =>
        x.delivery.send1 === 'pending' ? { ...x, delivery: { ...x.delivery, send1: 'unknown' } } : x,
      ),
    )
  }
  return 'none'
}

/** How long a Rules copy waits for Flagsmith to start on a page that had not started it (a later visit). */
export const M5_INIT_CAP_MS = 4000
/** How long the outcome of an M5 POST is watched (the SDK retries a failed batch once after ~1 s). */
export const M5_OBSERVE_MS = 15000

/**
 * The M5 record in `readout.rulesCopied`. `send` and `delivery` work like the score batch's, with one difference:
 * M5 is an **Occurrence** metric (1 if the identity has any `readout_rules_copied` event), so a duplicate cannot
 * change it. A batch observed to fail, or whose outcome was never seen (tab closed mid-send), is therefore re-sent
 * once on a later visit. For the Mean score events that would not be safe, and they are never re-sent on "unknown".
 */
export type RulesCopiedRecord = { attemptId: string; send: 1 | 2; delivery: Delivery; at: string }

export function readRulesCopied(): RulesCopiedRecord | null {
  const raw = read(KEYS.rulesCopied)
  if (raw === null) return null
  try {
    const r = JSON.parse(raw) as Partial<RulesCopiedRecord>
    if (
      typeof r.attemptId === 'string' &&
      (r.send === 1 || r.send === 2) &&
      ['pending', 'ok', 'failed', 'unknown'].includes(r.delivery as string) &&
      typeof r.at === 'string'
    )
      return r as RulesCopiedRecord
  } catch {
    // fall through
  }
  // Anything else (an older plain timestamp, or a damaged value): counted as sent once, outcome unknown.
  return { attemptId: '', send: 1, delivery: 'unknown', at: raw }
}

const writeRulesCopied = (r: RulesCopiedRecord) => write(KEYS.rulesCopied, JSON.stringify(r))

/** True when a later visit should re-send M5 once: send 1 failed, or its outcome was never observed. */
export function rulesCopiedNeedsResend(): boolean {
  const r = readRulesCopied()
  const cur = readAttempt()
  return (
    !!r &&
    r.send === 1 &&
    r.delivery !== 'ok' &&
    cur.kind === 'ok' &&
    cur.attempt.id === r.attemptId &&
    (cur.attempt.status === 'sent_1' || cur.attempt.status === 'sent_2')
  )
}

function sendM5(a: Attempt, send: 1 | 2): Promise<Delivery> {
  flagsmith.trackEvent(EVENT.rulesCopied, {
    identifier: a.uid,
    metadata: { ...a.payload!.metadata, send } as unknown as Record<string, unknown>,
  })
  void flagsmith.flushEvents()
  return waitForOutcome(`rules:${a.id}:${send}`, M5_OBSERVE_MS).then((o) => {
    const d: Delivery = o === 'ok' ? 'ok' : o === 'failed' ? 'failed' : 'unknown'
    // Under the cross-tab lock, like every other M5 record write. Only this send's own record is updated; 'ok' is final.
    return withAttemptLock(() => {
      const cur = readRulesCopied()
      if (cur && cur.attemptId === a.id && cur.send === send && cur.delivery !== 'ok') writeRulesCopied({ ...cur, delivery: d })
      return d
    })
  })
}

let m5InFlight: Promise<boolean> | null = null

/**
 * M5: once per measured identity, only after its score events were sent (28 §6, U-11). Resolves true if an event
 * was tracked. A later visit (e.g. straight to /rules) has not started the SDK, so it is started here, for the same
 * identity, and only for a measured attempt; practice never touches Flagsmith.
 */
export function trackRulesCopied(): Promise<boolean> {
  m5InFlight ??= sendRulesCopied().finally(() => {
    m5InFlight = null
  })
  return m5InFlight
}

async function sendRulesCopied(): Promise<boolean> {
  if (read(KEYS.rulesCopied) !== null) return false
  const cur = readAttempt()
  if (cur.kind !== 'ok') return false
  const a = cur.attempt
  if (a.status !== 'sent_1' && a.status !== 'sent_2') return false
  if (!a.payload) return false
  if (!isReady(a.uid)) {
    await Promise.race([initFlagsmith(a.uid), new Promise((r) => setTimeout(r, M5_INIT_CAP_MS))])
  }
  // Still not ready (Flagsmith unreachable): send nothing and leave the record unset, so a later copy can still count.
  if (!isReady(a.uid)) return false
  return withAttemptLock(() => {
    if (read(KEYS.rulesCopied) !== null) return false // another tab sent it while this one waited
    // Recorded as pending BEFORE tracking: an unsaved record could not be told apart from a lost send.
    if (!writeRulesCopied({ attemptId: a.id, send: 1, delivery: 'pending', at: new Date().toISOString() })) return false
    void sendM5(a, 1)
    return true
  })
}

/**
 * On a later visit, after the SDK is initialised for the attempt's identity: re-send M5 once (send: 2) if send 1
 * failed or was never confirmed. Safe only because M5 is an Occurrence metric (see RulesCopiedRecord).
 */
export async function resendRulesCopiedIfNeeded(): Promise<'resent' | 'none'> {
  const claimed = await withAttemptLock(() => {
    if (!rulesCopiedNeedsResend()) return null
    const cur = readAttempt()
    if (cur.kind !== 'ok' || !cur.attempt.payload || !isReady(cur.attempt.uid)) return null
    if (!writeRulesCopied({ ...readRulesCopied()!, send: 2, delivery: 'pending' })) return null
    return cur.attempt
  })
  if (!claimed) return 'none'
  await sendM5(claimed, 2)
  return 'resent'
}
