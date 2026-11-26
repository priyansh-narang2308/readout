/**
 * The challenge (measured) and practice (never measured) runs (25 §4, 26 §8.2–8.3, 26 §8.10).
 *
 * Both use the same RunHeader and Player, so the two arms and practice see identical cards apart from the inference
 * line. Only ChallengeRoute mounts MeasuredSession, and only while a measured attempt is in_progress and a card is on
 * screen. Practice never touches Flagsmith or `readout.attempt` (AC-6).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { DecisionBar } from '../components/decision/DecisionBar'
import { ResultCard } from '../components/result/ResultCard'
import { FramingToggle, PracticeBadge, ProgressRule, usePageTitle, Wordmark } from '../components/site/Site'
import { btn, btnGhost, cx, notice, page, srOnly, type } from '../components/ui/classes'
import { MEASURED_ORDER, SCENARIOS, type Call, type Framing, type ScenarioId } from '../content/scenarios.v1'
import { shuffled } from '../content/scoring'
import { PRACTICE_COPY } from '../content/study'
import { MeasuredSession } from '../flagsmith/MeasuredSession'
import { variantToFraming } from '../run/attemptStore'
import { useStudy } from '../run/StudyContext'

/** Exit of the locked card (26 §7: 16 px up, fade, 180 ms) before the next one enters. */
const EXIT_MS = 180
/** Locking panel: six ticks, 80 ms each (26 §7). */
const TICK_MS = 80

// ---------------- header ----------------

export function RunHeader({
  index,
  done,
  practice,
  onLeave,
}: {
  /** 0-based index of the result on screen. */
  index: number
  done: number
  practice: boolean
  onLeave: () => void
}) {
  const [confirm, setConfirm] = useState(false)
  const leaveRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!confirm) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setConfirm(false)
      leaveRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirm])

  const stay = () => {
    setConfirm(false)
    leaveRef.current?.focus()
  }

  return (
    <header className="sticky top-0 z-20 border-b border-line-1 bg-bg-0/92 backdrop-blur-[8px]">
      <div className={cx(page, 'flex h-12 items-center gap-3 sm:gap-5')}>
        {/* Not a link during the run (25 §4.1). */}
        <Wordmark link={false} />
        <span className={cx(type.data, 'whitespace-nowrap text-ink-2 max-sm:text-[12px]')}>
          Result {Math.min(index + 1, 6)} of 6
        </span>
        <span className="max-sm:hidden">
          <ProgressRule current={index} done={done} />
        </span>
        {practice && (
          <span className="max-sm:hidden">
            <PracticeBadge />
          </span>
        )}
        <button
          ref={leaveRef}
          type="button"
          className={cx(btnGhost, 'ml-auto h-11 min-w-11 text-[14px]')}
          onClick={() => setConfirm((c) => !c)}
          aria-expanded={confirm}
          aria-controls="leave-confirm"
        >
          Leave
        </button>
      </div>
      {/* Phones: the rule and badge get their own row under the header line. */}
      <div className={cx(page, 'flex items-center justify-between gap-3 pb-2.5 sm:hidden')}>
        <ProgressRule current={index} done={done} />
        {practice && <PracticeBadge />}
      </div>
      {confirm && (
        <div id="leave-confirm" className="animate-drop-in border-t border-line-1 bg-bg-1" role="region" aria-label="Leave the run">
          <div className={cx(page, 'flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-3')}>
            <p className="text-[15px] text-ink-2">
              {practice
                ? 'This practice run isn’t saved. Leave anyway?'
                : 'Your challenge stays where you left it. You can continue later from this browser.'}
            </p>
            <div className="flex gap-3">
              {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
              <button type="button" className={btn('secondary')} onClick={onLeave} autoFocus>
                Leave
              </button>
              <button type="button" className={btn('secondary')} onClick={stay}>
                Stay
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}

// ---------------- player ----------------

type LockResult = 'next' | 'retry'
type LockFn = (call: Call, ms: number) => LockResult | Promise<LockResult>

/**
 * One result on screen. The answer is locked through `onLock` BEFORE the card leaves; on 'retry' (the call could not
 * be saved) the card stays and a fresh decision bar is mounted with the selection kept.
 */
function Player({
  id,
  index,
  framing,
  onLock,
  onFramingChange,
  topNotice,
  exiting = false,
}: {
  id: ScenarioId
  index: number
  framing: Framing
  onLock: LockFn
  onFramingChange?: (f: Framing) => void
  topNotice?: string | null
  /** The call is locked and saved: the card plays its exit, then the next result replaces it. */
  exiting?: boolean
}) {
  const [selected, setSelected] = useState<Call | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [saveFailed, setSaveFailed] = useState(false)
  const shownAt = useRef(performance.now())
  const titleRef = useRef<HTMLHeadingElement>(null)
  const s = SCENARIOS[id]

  // A new result: reset the clock, scroll to the top, focus the title (25 §4.3 step 5).
  useEffect(() => {
    shownAt.current = performance.now()
    window.scrollTo({ top: 0 })
    const t = requestAnimationFrame(() => titleRef.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(t)
  }, [])

  // One lock at a time: a second press while the cross-tab lock is held is ignored, never a second answer.
  const busy = useRef(false)
  const lock = useCallback(async () => {
    if (!selected || busy.current) return
    busy.current = true
    try {
      const r = await onLock(selected, performance.now() - shownAt.current)
      if (r === 'retry') {
        setSaveFailed(true)
        setAttempt((n) => n + 1)
      }
    } finally {
      busy.current = false
    }
  }, [selected, onLock])

  return (
    <div className={cx(page, 'pt-2 pb-10 sm:pt-2 sm:pb-16')}>
      {topNotice && (
        <p className={cx(notice(true), 'mx-auto mb-3 max-w-card')} role="status">
          {topNotice}
        </p>
      )}
      {saveFailed && (
        <p className={cx(notice(true), 'mx-auto mb-3 max-w-card')} role="alert">
          This browser couldn’t save that call. Lock it in again; nothing has moved on.
        </p>
      )}
      <p className={srOnly} aria-live="polite">
        Result {index + 1} of 6
      </p>
      <div className={cx('mx-auto max-w-card', exiting ? 'pointer-events-none animate-card-out' : 'animate-card-in')}>
        <ResultCard
          model={s}
          framing={framing}
          titleRef={titleRef}
          eyebrowRight={
            onFramingChange ? <FramingToggle value={framing} onChange={onFramingChange} compact label="Show this line as" /> : undefined
          }
          footer={<DecisionBar key={attempt} name={`d-${id}`} selected={selected} onSelect={setSelected} onLock={lock} locked={exiting} />}
        />
      </div>
    </div>
  )
}

// ---------------- locking ----------------

/** 25 §4.4, 26 §8.3: covers the save and the flush (≤ 3 s). The player never sees a delivery error. */
function LockingPanel({ run, onDone }: { run: () => Promise<unknown>; onDone: () => void }) {
  const [ticks, setTicks] = useState(0)
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    let cancelled = false
    let n = 0
    let doneTimer: ReturnType<typeof setTimeout> | undefined
    const iv = setInterval(() => {
      n = Math.min(n + 1, 6)
      setTicks(n)
      if (n >= 6) clearInterval(iv)
    }, TICK_MS)
    const ticksShown = new Promise<void>((r) => {
      doneTimer = setTimeout(r, TICK_MS * 6 + 120)
    })
    void Promise.all([run().catch(() => undefined), ticksShown]).then(() => {
      if (!cancelled) onDone()
    })
    return () => {
      cancelled = true
      clearInterval(iv)
      if (doneTimer !== undefined) clearTimeout(doneTimer)
    }
  }, [run, onDone])
  return (
    <div className={cx(page, 'grid min-h-[60vh] place-content-center justify-items-center gap-6 text-center')} role="status">
      <p className={type.titleM}>Locking in your six calls…</p>
      <div className="flex gap-2" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <span
            key={i}
            data-on={i < ticks || undefined}
            className="size-3 rounded-full border border-line-3 transition-colors duration-120 data-on:border-ink-2 data-on:bg-ink-2"
          />
        ))}
      </div>
    </div>
  )
}

// ---------------- measured ----------------

export function ChallengeRoute() {
  usePageTitle('Challenge')
  const { state, lock, finish, markVariantMismatch, setPracticeReason } = useStudy()
  const navigate = useNavigate()
  const live = state.kind === 'in_progress' ? state.attempt : null
  // The index on screen lags the stored one by the exit animation; another tab moving on is followed at once.
  const [shown, setShown] = useState(() => live?.index ?? 0)
  const [leaving, setLeaving] = useState<ScenarioId | null>(null)
  const [locking, setLocking] = useState(false)
  const [movedOn, setMovedOn] = useState(false)
  const exitTimer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (exitTimer.current !== null) clearTimeout(exitTimer.current)
    },
    [],
  )

  useEffect(() => {
    if (live && !leaving && live.index !== shown) setShown(live.index)
  }, [live, leaving, shown])

  // Corrupt or blocked storage: the measured run can't continue; never start a second attempt (26 §8.2 item 10).
  useEffect(() => {
    if (state.kind === 'void' || state.kind === 'blocked') setPracticeReason(state.kind === 'void' ? 'void' : 'storage')
  }, [state.kind, setPracticeReason])

  const attemptId = live?.id ?? (state.kind === 'finished' ? state.attempt.id : null)
  const runFinish = useCallback(() => (attemptId ? finish(attemptId) : Promise.resolve()), [attemptId, finish])
  const toFlip = useCallback(() => navigate('/readout', { replace: true }), [navigate])
  const onMismatch = useCallback(() => {
    if (live) markVariantMismatch(live.id)
  }, [live, markVariantMismatch])

  if (state.kind === 'new') return <Navigate to="/" replace />
  if (state.kind === 'void' || state.kind === 'blocked') return <Navigate to="/practice" replace />
  if (state.kind === 'finished' && !locking) return <Navigate to="/readout" replace />

  const attempt = live ?? (state.kind === 'finished' ? state.attempt : null)
  if (!attempt) return <Navigate to="/" replace />
  const framing = variantToFraming(attempt.variant)
  const showLocking = locking || (live !== null && live.index >= 6)
  const id = attempt.order[Math.min(shown, 5)]!

  const onLock: LockFn = async (call, ms) => {
    const out = await lock(attempt.id, id, call, ms)
    if (!out.ok) {
      if (out.reason === 'save_failed') return 'retry'
      setMovedOn(true)
      return 'next'
    }
    setMovedOn(false)
    setLeaving(id)
    if (exitTimer.current !== null) clearTimeout(exitTimer.current)
    exitTimer.current = window.setTimeout(() => {
      exitTimer.current = null
      setLeaving(null)
      if (out.attempt.index >= 6) setLocking(true)
      else setShown(out.attempt.index)
    }, EXIT_MS)
    return 'next'
  }

  return (
    <>
      <RunHeader index={Math.min(shown, 5)} done={Math.min(showLocking ? 6 : shown, 6)} practice={false} onLeave={() => navigate('/')} />
      <main id="main" tabIndex={-1}>
        <h1 className={srOnly}>The challenge</h1>
        {/* The exposure: mounted once for the whole run while a card is on screen, never on the locking panel. */}
        {live && !showLocking && (
          <MeasuredSession persistedVariant={attempt.variant} onVariantMismatch={onMismatch} />
        )}
        {showLocking ? (
          <LockingPanel run={runFinish} onDone={toFlip} />
        ) : (
          <Player
            key={id}
            id={id}
            index={shown}
            framing={framing}
            onLock={onLock}
            exiting={leaving === id}
            topNotice={movedOn ? 'This challenge moved on in another tab, so you’re now on the next result.' : null}
          />
        )}
      </main>
    </>
  )
}

// ---------------- practice ----------------

export function PracticeRoute() {
  usePageTitle('Practice')
  const { practiceReason, defaultFraming, savePractice } = useStudy()
  const navigate = useNavigate()
  const [order] = useState<ScenarioId[]>(() => shuffled(MEASURED_ORDER))
  const [answers, setAnswers] = useState<Partial<Record<ScenarioId, Call>>>({})
  const [index, setIndex] = useState(0)
  const [leaving, setLeaving] = useState<ScenarioId | null>(null)
  const [framing, setFraming] = useState<Framing>(defaultFraming.framing)
  const exitTimer = useRef<number | null>(null)
  const id = order[index]!

  useEffect(
    () => () => {
      if (exitTimer.current !== null) clearTimeout(exitTimer.current)
    },
    [],
  )

  const onLock: LockFn = (call) => {
    const next = { ...answers, [id]: call }
    setAnswers(next)
    setLeaving(id)
    if (exitTimer.current !== null) clearTimeout(exitTimer.current)
    exitTimer.current = window.setTimeout(() => {
      exitTimer.current = null
      setLeaving(null)
      if (index + 1 < 6) setIndex(index + 1)
      else {
        // Practice keeps only its last run, with no identity, and never in readout.attempt.
        savePractice({ order, answers: next, finishedAt: new Date().toISOString(), framing })
        navigate('/practice/readout', { replace: true })
      }
    }, EXIT_MS)
    return 'next'
  }

  const reasonText = practiceReason ? PRACTICE_COPY[practiceReason] : null

  return (
    <>
      <RunHeader index={index} done={index} practice onLeave={() => navigate('/')} />
      <main id="main" tabIndex={-1}>
        <h1 className={srOnly}>Practice — not part of the study</h1>
        <Player
          key={id}
          id={id}
          index={index}
          framing={framing}
          onFramingChange={setFraming}
          onLock={onLock}
          exiting={leaving === id}
          topNotice={index === 0 ? reasonText : null}
        />
      </main>
    </>
  )
}
