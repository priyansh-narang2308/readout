/**
 * Saved-attempt storage (29 §6, 34 §4.5): a typed localStorage store for the measured attempt, with strict schema
 * validation, a storage probe, guarded writes and one derived state for the rest of the app.
 *
 * Integrity rules:
 *  1. A measured attempt is created only when NO `readout.attempt` key exists. A corrupt value counts as existing
 *     and becomes `void` (practice only). It is never deleted: that would allow a second measured run.
 *  2. Persist before acting: attempt before Result 1, each answer before the next card, payload before tracking.
 *     Every write is read back; a write that did not stick is reported as a failure, never assumed.
 *  3. Re-read before writing: `updateAttempt` only writes if the stored attempt is still the one the caller expects
 *     (same id and status), so a second tab can never be overwritten or double-advanced.
 *  4. Nothing invalid is ever written: a record that would fail validation on the next read is refused.
 *  5. Practice never touches `readout.attempt`.
 */
import { CALLS, MEASURED_ORDER, type Call, type Framing, type ScenarioId } from '../content/scenarios.v1'

export const KEYS = {
  uid: 'readout.uid',
  ref: 'readout.ref',
  attempt: 'readout.attempt',
  practice: 'readout.practice',
  rulesCopied: 'readout.rulesCopied',
} as const

export type Variant = 'control' | 'chance_to_win'
export type AttemptStatus = 'in_progress' | 'scored_pending' | 'sent_1' | 'sent_2' | 'void'
export type EnvName = 'development' | 'production'

/** Observed HTTP outcome of an events batch (see flagsmith/deliveryMonitor.ts). */
export type Delivery = 'pending' | 'ok' | 'failed' | 'unknown'

export type Metadata = {
  scenarioSet: string
  attemptId: string
  answers: string
  totalSeconds: number
  ref: string | null
  variantMismatch: boolean
  send: 1 | 2
}

export type Payload = { score: number; lossCall: 0 | 1; nearMissCall: 0 | 1; metadata: Omit<Metadata, 'send'> }

export type Attempt = {
  v: 1
  id: string
  uid: string
  variant: Variant
  experimentId: number
  envName: EnvName
  order: ScenarioId[]
  answers: Partial<Record<ScenarioId, Call>>
  msPerResult: Partial<Record<ScenarioId, number>>
  /** The next result to show, 0–6. Equal to the number of locked calls. */
  index: number
  status: AttemptStatus
  startedAt: string
  scoredAt?: string
  payload?: Payload
  variantMismatch: boolean
  delivery: { send1?: Delivery; send2?: Delivery }
}

export function variantToFraming(v: Variant): Framing {
  return v === 'control' ? 'p_value' : 'chance_to_win'
}

// ---------- safe storage ----------

/**
 * Write/read/remove probe (29 §6.3 rule 5). False in private modes, with storage disabled, or when the quota is full.
 * Storage unavailable → the player is never enrolled: we never measure an identity we can't persist.
 */
export function storageAvailable(): boolean {
  try {
    const k = 'readout.__probe'
    const v = String(Date.now())
    window.localStorage.setItem(k, v)
    const ok = window.localStorage.getItem(k) === v
    window.localStorage.removeItem(k)
    return ok
  } catch {
    return false
  }
}

export function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

/** True only if the value was written AND reads back identically. */
export function write(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value)
    return window.localStorage.getItem(key) === value
  } catch {
    return false
  }
}

export function remove(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

// ---------- ids ----------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function uuid(): string {
  // randomUUID exists only in secure contexts (https/localhost); a LAN-IP dev URL lacks it.
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // RFC 4122 v4 fallback using getRandomValues (available in insecure contexts too)
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  b[6] = (b[6]! & 0x0f) | 0x40
  b[8] = (b[8]! & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** Created only when the player presses Start (34 §4.1). A malformed stored value is replaced. */
// ---------- cross-tab lock ----------

/** One Web Lock serialises every step that decides whether this browser starts or sends a measured attempt. */
export const ATTEMPT_LOCK = 'readout.attempt'

/**
 * The Web Locks API (secure contexts: HTTPS or localhost). localStorage alone has no atomic compare-and-set across
 * tabs, so without this lock two tabs could each start an attempt, even under two IDs. A browser without it gets
 * practice only (PracticeReason 'unsupported'); nothing is guessed.
 */
export function locksAvailable(): boolean {
  try {
    return typeof navigator !== 'undefined' && !!navigator.locks && typeof navigator.locks.request === 'function'
  } catch {
    return false
  }
}

/**
 * Runs `fn` while holding the exclusive attempt lock. The browser releases it if the tab closes. Callers check
 * locksAvailable() first where the absence must change behaviour; here, without locks, `fn` simply runs.
 */
export function withAttemptLock<T>(fn: () => Promise<T> | T): Promise<T> {
  if (!locksAvailable()) return Promise.resolve().then(fn)
  return navigator.locks.request(ATTEMPT_LOCK, { mode: 'exclusive' }, () => fn()) as Promise<T>
}

export function ensureUid(): string {
  const existing = read(KEYS.uid)
  if (existing && UUID_RE.test(existing)) return existing
  const id = uuid()
  write(KEYS.uid, id)
  return id
}

export function getUid(): string | null {
  const v = read(KEYS.uid)
  return v && UUID_RE.test(v) ? v : null
}

/** First-touch ?ref= tag: a channel name only, sanitised. Never overwritten. */
export function captureRef(search: string): void {
  if (read(KEYS.ref) !== null) return
  const ref = new URLSearchParams(search).get('ref')
  if (ref && /^[a-z0-9_-]{1,24}$/i.test(ref)) write(KEYS.ref, ref.toLowerCase())
}

export function getRef(): string | null {
  return read(KEYS.ref)
}

// ---------- validation ----------

const STATUSES: AttemptStatus[] = ['in_progress', 'scored_pending', 'sent_1', 'sent_2', 'void']
const FINISHED: AttemptStatus[] = ['scored_pending', 'sent_1', 'sent_2']
const CALL_SET = new Set<string>(CALLS)
const DELIVERIES = new Set<string>(['pending', 'ok', 'failed', 'unknown'])

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const isIso = (x: unknown) => typeof x === 'string' && !Number.isNaN(Date.parse(x))
const isBit = (x: unknown) => x === 0 || x === 1
const sameKeys = (o: object, keys: string[]) => {
  const k = Object.keys(o)
  return k.length === keys.length && keys.every((x) => k.includes(x))
}

function validPayload(p: unknown, attemptId: string): boolean {
  if (!isObj(p)) return false
  // readout_score is correct / 6 (28 §3): a fraction in [0, 1] on sixths.
  if (typeof p.score !== 'number' || p.score < 0 || p.score > 1 || !Number.isInteger(Math.round(p.score * 6 * 1e9) / 1e9))
    return false
  if (!isBit(p.lossCall) || !isBit(p.nearMissCall)) return false
  const m = p.metadata
  if (!isObj(m)) return false
  return (
    typeof m.scenarioSet === 'string' &&
    m.attemptId === attemptId &&
    typeof m.answers === 'string' &&
    typeof m.totalSeconds === 'number' &&
    Number.isFinite(m.totalSeconds) &&
    m.totalSeconds >= 0 &&
    (m.ref === null || typeof m.ref === 'string') &&
    typeof m.variantMismatch === 'boolean'
  )
}

/** Why a record is invalid, or null if it is a valid attempt. Exported for tests and the debug panel. */
export function attemptProblem(x: unknown): string | null {
  if (!isObj(x)) return 'not an object'
  const a = x
  if (a.v !== 1) return 'version'
  if (typeof a.id !== 'string' || !UUID_RE.test(a.id)) return 'id'
  if (typeof a.uid !== 'string' || !UUID_RE.test(a.uid)) return 'uid'
  if (a.variant !== 'control' && a.variant !== 'chance_to_win') return 'variant'
  if (!Number.isInteger(a.experimentId) || (a.experimentId as number) < 0) return 'experimentId'
  if (a.envName !== 'development' && a.envName !== 'production') return 'envName'
  if (!Array.isArray(a.order) || a.order.join() !== MEASURED_ORDER.join()) return 'order'
  if (!STATUSES.includes(a.status as AttemptStatus)) return 'status'
  const status = a.status as AttemptStatus
  if (!Number.isInteger(a.index) || (a.index as number) < 0 || (a.index as number) > 6) return 'index'
  const index = a.index as number
  // The answers are exactly the first `index` results of the fixed order, each a known call.
  if (!isObj(a.answers)) return 'answers'
  const answered = MEASURED_ORDER.slice(0, index)
  if (!sameKeys(a.answers, answered)) return 'answers'
  if (!Object.values(a.answers).every((c) => CALL_SET.has(c as string))) return 'answers'
  // Timings only for answered results, each a finite, non-negative number of milliseconds.
  if (!isObj(a.msPerResult)) return 'msPerResult'
  for (const [k, ms] of Object.entries(a.msPerResult)) {
    if (!answered.includes(k as ScenarioId)) return 'msPerResult'
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return 'msPerResult'
  }
  if (!isIso(a.startedAt)) return 'startedAt'
  if (typeof a.variantMismatch !== 'boolean') return 'variantMismatch'
  if (!isObj(a.delivery)) return 'delivery'
  const d = a.delivery
  for (const k of Object.keys(d)) {
    if ((k !== 'send1' && k !== 'send2') || !DELIVERIES.has(d[k] as string)) return 'delivery'
  }
  if (FINISHED.includes(status)) {
    // Scored only after all six calls; the payload is persisted with the score.
    if (index !== 6) return 'index'
    if (!isIso(a.scoredAt)) return 'scoredAt'
    if (!validPayload(a.payload, a.id)) return 'payload'
  } else if (status === 'in_progress') {
    if (a.payload !== undefined || a.scoredAt !== undefined) return 'payload'
    if (Object.keys(d).length) return 'delivery'
  }
  if (status === 'scored_pending' && Object.keys(d).length) return 'delivery'
  if ((status === 'sent_1' || status === 'sent_2') && d.send1 === undefined) return 'delivery'
  // The second send happens only after the first was OBSERVED to fail (33 C-18).
  if (status === 'sent_2' && (d.send1 !== 'failed' || d.send2 === undefined)) return 'delivery'
  if (status === 'sent_1' && d.send2 !== undefined) return 'delivery'
  return null
}

export function validateAttempt(x: unknown): x is Attempt {
  return attemptProblem(x) === null
}

// ---------- reading and writing the attempt ----------

export type AttemptRead =
  | { kind: 'none' }
  | { kind: 'ok'; attempt: Attempt }
  | { kind: 'void' }
  | { kind: 'corrupt' }

/** Pure read: never writes. Any `v: 1` record with status `void` reads as void. */
export function readAttempt(): AttemptRead {
  const raw = read(KEYS.attempt)
  if (raw === null) return { kind: 'none' }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (isObj(parsed) && parsed.v === 1 && parsed.status === 'void') return { kind: 'void' }
    return validateAttempt(parsed) ? { kind: 'ok', attempt: parsed } : { kind: 'corrupt' }
  } catch {
    return { kind: 'corrupt' }
  }
}

/**
 * Read for the app: a corrupt record is turned into `void` on the spot (rule 1), so callers only ever see
 * none / ok / void.
 */
export function loadAttempt(): Exclude<AttemptRead, { kind: 'corrupt' }> {
  const r = readAttempt()
  if (r.kind !== 'corrupt') return r
  voidCorruptAttempt()
  return { kind: 'void' }
}

/** Low-level write of a valid attempt. Refuses invalid records. Prefer createAttempt / updateAttempt. */
export function writeAttempt(a: Attempt): boolean {
  if (!validateAttempt(a)) return false
  return write(KEYS.attempt, JSON.stringify(a))
}

/** A corrupt attempt key becomes a minimal `void` record. Never deleted (that would allow a second measured run). */
export function voidCorruptAttempt(): void {
  write(KEYS.attempt, JSON.stringify({ v: 1, status: 'void', voidedAt: new Date().toISOString() }))
}

export type CreateResult = { ok: true; attempt: Attempt } | { ok: false; reason: 'exists' | 'invalid' | 'write_failed' }

/**
 * The only way to start a measured attempt (rule 1): writes only if no `readout.attempt` key exists at all,
 * then reads it back. Call it immediately before showing Result 1 (rule 2).
 */
export function createAttempt(a: Attempt): CreateResult {
  if (read(KEYS.attempt) !== null) return { ok: false, reason: 'exists' }
  if (a.status !== 'in_progress' || a.index !== 0 || !validateAttempt(a)) return { ok: false, reason: 'invalid' }
  if (!write(KEYS.attempt, JSON.stringify(a))) return { ok: false, reason: 'write_failed' }
  const back = readAttempt()
  if (back.kind !== 'ok' || back.attempt.id !== a.id) return { ok: false, reason: 'write_failed' }
  return { ok: true, attempt: back.attempt }
}

export type UpdateResult =
  | { ok: true; attempt: Attempt }
  | { ok: false; reason: 'changed' | 'illegal' | 'invalid' | 'write_failed'; current: AttemptRead }

/**
 * Guarded read-modify-write (rule 3). Re-reads storage; applies `change` only if the stored attempt still has the
 * expected id and status. `change` may throw IllegalTransition (e.g. from lockCall / withStatus).
 * The new record must validate and must read back identically.
 */
export function updateAttempt(
  expected: { id: string; status: AttemptStatus },
  change: (a: Attempt) => Attempt,
): UpdateResult {
  const cur = readAttempt()
  if (cur.kind !== 'ok' || cur.attempt.id !== expected.id || cur.attempt.status !== expected.status) {
    return { ok: false, reason: 'changed', current: cur }
  }
  let next: Attempt
  try {
    next = change(cur.attempt)
  } catch (e) {
    if (e instanceof IllegalTransition) return { ok: false, reason: 'illegal', current: cur }
    throw e
  }
  if (next.id !== cur.attempt.id || !validateAttempt(next)) return { ok: false, reason: 'invalid', current: cur }
  if (!write(KEYS.attempt, JSON.stringify(next))) return { ok: false, reason: 'write_failed', current: readAttempt() }
  return { ok: true, attempt: next }
}

/**
 * Multi-tab (rule 4): calls `onChange` when another tab changes the attempt (or clears storage).
 * The browser fires `storage` events only in OTHER tabs, never the one that wrote. Returns an unsubscribe.
 */
export function subscribeAttempt(onChange: () => void): () => void {
  const h = (e: StorageEvent) => {
    if (e.key === KEYS.attempt || e.key === null) onChange()
  }
  window.addEventListener('storage', h)
  return () => window.removeEventListener('storage', h)
}

// ---------- state machine ----------

const LEGAL: Record<AttemptStatus, AttemptStatus[]> = {
  in_progress: ['in_progress', 'scored_pending', 'void'],
  scored_pending: ['sent_1'],
  sent_1: ['sent_1', 'sent_2'],
  sent_2: ['sent_2'],
  void: [],
}

export class IllegalTransition extends Error {}

export function assertTransition(from: AttemptStatus, to: AttemptStatus): void {
  if (!LEGAL[from].includes(to)) throw new IllegalTransition(`${from} → ${to}`)
}

export function newAttempt(args: {
  uid: string
  variant: Variant
  experimentId: number
  envName: EnvName
  now?: Date
}): Attempt {
  return {
    v: 1,
    id: uuid(),
    uid: args.uid,
    variant: args.variant,
    experimentId: args.experimentId,
    envName: args.envName,
    order: [...MEASURED_ORDER],
    answers: {},
    msPerResult: {},
    index: 0,
    status: 'in_progress',
    startedAt: (args.now ?? new Date()).toISOString(),
    variantMismatch: false,
    delivery: {},
  }
}

/** Lock one call. Returns the new attempt, or throws IllegalTransition. A bad timing is stored as 0, never NaN. */
export function lockCall(a: Attempt, id: ScenarioId, call: Call, ms: number): Attempt {
  assertTransition(a.status, 'in_progress')
  if (a.order[a.index] !== id) throw new IllegalTransition(`expected ${a.order[a.index]}, got ${id}`)
  if (a.answers[id]) throw new IllegalTransition(`${id} already locked`)
  if (!CALL_SET.has(call)) throw new IllegalTransition(`unknown call ${String(call)}`)
  return {
    ...a,
    answers: { ...a.answers, [id]: call },
    msPerResult: { ...a.msPerResult, [id]: Number.isFinite(ms) ? Math.max(0, Math.round(ms)) : 0 },
    index: a.index + 1,
  }
}

export function withStatus(a: Attempt, to: AttemptStatus, patch: Partial<Attempt> = {}): Attempt {
  assertTransition(a.status, to)
  return { ...a, ...patch, status: to }
}

// ---------- derived state (one answer for the landing page and the study controller) ----------

/**
 * What this browser can do, derived from the probe and the stored attempt (29 §6.2, 25 §3, 34 §4.5).
 *  - blocked:     storage unusable → practice only.
 *  - new:         no attempt key → Start may create the one measured attempt.
 *  - in_progress: Continue at Result `index + 1` (never "start over"). index 6 = all calls locked, not yet scored.
 *  - finished:    scored; `send` says what delivery work remains on load. Practice only for any later play.
 *  - void:        unreadable attempt → practice only.
 */
export type AttemptState =
  | { kind: 'blocked' }
  | { kind: 'new' }
  | { kind: 'in_progress'; attempt: Attempt }
  | { kind: 'finished'; attempt: Attempt; send: SendWork }
  | { kind: 'void' }

/**
 * Delivery work for a finished attempt on load (28 §8, 33 C-18):
 *  - send_1:       scored but the tab closed before tracking → send the payload (send: 1).
 *  - send_2:       the first send was OBSERVED to fail → re-send once (send: 2).
 *  - mark_unknown: the first send never reported an outcome → record it as unknown; never re-sent.
 *  - none:         nothing left to do.
 */
export type SendWork = 'send_1' | 'send_2' | 'mark_unknown' | 'none'

export function sendWork(a: Attempt): SendWork {
  if (a.status === 'scored_pending') return 'send_1'
  if (a.status === 'sent_1' && a.delivery.send1 === 'failed') return 'send_2'
  if (a.status === 'sent_1' && a.delivery.send1 === 'pending') return 'mark_unknown'
  return 'none'
}

export function attemptState(storageOk: boolean, r: AttemptRead): AttemptState {
  if (!storageOk) return { kind: 'blocked' }
  if (r.kind === 'none') return { kind: 'new' }
  if (r.kind !== 'ok') return { kind: 'void' }
  const a = r.attempt
  if (a.status === 'in_progress') return { kind: 'in_progress', attempt: a }
  return { kind: 'finished', attempt: a, send: sendWork(a) }
}

/** The landing call to action for a state (25 §3 table: Start / Continue (Result n of 6) / practice only). */
export type LandingAction =
  | { kind: 'start' }
  | { kind: 'continue'; result: number }
  | { kind: 'practice_only'; reason: 'storage' | 'done' | 'void' }

export function landingAction(s: AttemptState): LandingAction {
  switch (s.kind) {
    case 'new':
      return { kind: 'start' }
    case 'in_progress':
      return { kind: 'continue', result: Math.min(s.attempt.index + 1, 6) }
    case 'blocked':
      return { kind: 'practice_only', reason: 'storage' }
    case 'finished':
      return { kind: 'practice_only', reason: 'done' }
    case 'void':
      return { kind: 'practice_only', reason: 'void' }
  }
}

// ---------- practice ----------

export type PracticeRecord = {
  order: ScenarioId[]
  answers: Partial<Record<ScenarioId, Call>>
  finishedAt: string
  framing: Framing
}

function validPractice(x: unknown): x is PracticeRecord {
  if (!isObj(x)) return false
  if (!Array.isArray(x.order) || [...x.order].sort().join() !== [...MEASURED_ORDER].sort().join()) return false
  if (!isObj(x.answers) || !sameKeys(x.answers, MEASURED_ORDER)) return false
  if (!Object.values(x.answers).every((c) => CALL_SET.has(c as string))) return false
  return isIso(x.finishedAt) && (x.framing === 'p_value' || x.framing === 'chance_to_win')
}

/** Last practice run only (answers, no identity). Writes `readout.practice`, never `readout.attempt` (rule 5). */
export function writePractice(p: PracticeRecord): boolean {
  if (!validPractice(p)) return false
  return write(KEYS.practice, JSON.stringify(p))
}

export function readPractice(): PracticeRecord | null {
  const raw = read(KEYS.practice)
  if (!raw) return null
  try {
    const p: unknown = JSON.parse(raw)
    return validPractice(p) ? p : null
  } catch {
    return null
  }
}
