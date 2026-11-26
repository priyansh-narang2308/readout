/**
 * StudyProvider: holds the study state for the app and wires the controller (controller.ts) to the real Flagsmith
 * layer. Nothing is sent to Flagsmith before the player presses Start, except to continue or finish an attempt the
 * player already consented to (34 §4.1).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Call, Framing, ScenarioId } from '../content/scenarios.v1'
import type { PracticeReason } from '../content/study'
import { enrol, envName, initFlagsmith, isInitialised, type GateResult } from '../flagsmith/client'
import { flushOnHide, resendIfNeeded, rulesCopiedNeedsResend, sendScores } from '../flagsmith/measurement'
import { captureRef, storageAvailable, subscribeAttempt, type AttemptState } from './attemptStore'
import {
  currentState,
  finishChallenge,
  lockResult,
  markVariantMismatch,
  onLoad,
  startChallenge,
  type FinishOutcome,
  type LockOutcome,
  type StartOutcome,
  type StudyDeps,
} from './controller'

export type Study = {
  state: AttemptState
  /** The last gate result from Flagsmith in this page load (null before Start). */
  gate: GateResult | null
  /**
   * The framing practice and the presenter open with. It is Flagsmith's environment value only when a consented Start
   * in this page load got flags from the server with no running experiment for this identity (gate `rollout`);
   * otherwise the built-in default, `p_value`. Never an experiment arm, and never fetched just for this.
   */
  defaultFraming: { framing: Framing; source: 'flagsmith' | 'default' }
  /** Why the current practice run is practice; null = the player chose it. */
  practiceReason: PracticeReason | null
  setPracticeReason: (r: PracticeReason | null) => void
  /** True while Start waits on Flagsmith (≤ 4 s): the CTA shows "Preparing your challenge…". */
  preparing: boolean
  start: () => Promise<StartOutcome>
  lock: (attemptId: string, id: ScenarioId, call: Call, ms: number) => Promise<LockOutcome>
  finish: (attemptId: string) => Promise<FinishOutcome>
  markVariantMismatch: (attemptId: string) => void
  refresh: () => void
}

const Ctx = createContext<Study | null>(null)

export function useStudy(): Study {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStudy outside StudyProvider')
  return s
}

/** The real Flagsmith layer. Tests pass their own deps to StudyProvider. */
export function realDeps(storageOk: boolean): StudyDeps {
  return {
    enrol,
    init: initFlagsmith,
    sendScores,
    resend: resendIfNeeded,
    envName,
    storageOk: () => storageOk,
    m5Pending: rulesCopiedNeedsResend,
  }
}

export function StudyProvider({ children, deps: given }: { children: ReactNode; deps?: StudyDeps }) {
  // The storage probe runs once per page load.
  const [deps] = useState<StudyDeps>(() => given ?? realDeps(storageAvailable()))
  const [state, setState] = useState<AttemptState>(() => currentState(deps))
  const [gate, setGate] = useState<GateResult | null>(null)
  const [practiceReason, setPracticeReason] = useState<PracticeReason | null>(null)
  const [preparing, setPreparing] = useState(false)
  const loaded = useRef(false)
  const starting = useRef<Promise<StartOutcome> | null>(null)

  const refresh = useCallback(() => setState(currentState(deps)), [deps])

  // App load: first-touch ref, void a corrupt attempt, resume or finish delivery for a consented attempt.
  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    if (deps.storageOk()) captureRef(window.location.search)
    const { state: s, work } = onLoad(deps)
    setState(s)
    void work.then(refresh)
  }, [deps, refresh])

  // Multi-tab (29 §6.3 rule 4): follow another tab's progress.
  useEffect(() => subscribeAttempt(refresh), [refresh])

  // Best-effort flush when the page is hidden mid-run, so an exposure is not lost on close.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden' && isInitialised()) flushOnHide()
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [])

  const start = useCallback((): Promise<StartOutcome> => {
    // A double click or Enter-repeat shares the one Start in flight.
    if (starting.current) return starting.current
    setPreparing(true)
    const p = startChallenge(deps)
      .then((out) => {
        if (out.to === 'practice') {
          setPracticeReason(out.reason)
          if (out.gate) setGate(out.gate)
        } else {
          setPracticeReason(null)
        }
        return out
      })
      .finally(() => {
        starting.current = null
        setPreparing(false)
        refresh()
      })
    starting.current = p
    return p
  }, [deps, refresh])

  const lock = useCallback(
    async (attemptId: string, id: ScenarioId, call: Call, ms: number) => {
      const out = await lockResult(deps, attemptId, id, call, ms)
      setState(out.ok ? currentState(deps) : out.state)
      return out
    },
    [deps],
  )

  const finish = useCallback(
    async (attemptId: string) => {
      const out = await finishChallenge(deps, attemptId)
      setState(out.state)
      return out
    },
    [deps],
  )

  const onMismatch = useCallback(
    (attemptId: string) => {
      void markVariantMismatch(attemptId).then(refresh)
    },
    [refresh],
  )

  const defaultFraming = useMemo<Study['defaultFraming']>(
    () =>
      gate && !gate.enrolled && gate.rollout ? { framing: gate.rollout, source: 'flagsmith' } : { framing: 'p_value', source: 'default' },
    [gate],
  )

  const value = useMemo<Study>(
    () => ({
      state,
      gate,
      defaultFraming,
      practiceReason,
      setPracticeReason,
      preparing,
      start,
      lock,
      finish,
      markVariantMismatch: onMismatch,
      refresh,
    }),
    [state, gate, defaultFraming, practiceReason, preparing, start, lock, finish, onMismatch, refresh],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
