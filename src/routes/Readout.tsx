/**
 * After measurement: the flip, the six debriefs and Your readout. Semantic colour (--good/--bad) appears only here,
 * always paired with ✓/✗ and words. Nothing here tracks, except M5 on a Rules copy via measurement.ts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { inferenceText, ResultCard } from '../components/result/ResultCard'
import { CopyButton, FramingToggle, usePageTitle } from '../components/site/Site'
import { btn, btnGhost, chip, cx, kbd, link, notice, page, srOnly, type } from '../components/ui/classes'
import { analyse } from '../content/analysis'
import { PATTERN_RULES, rulesMarkdown, RULES } from '../content/rules'
import { CALL_LABEL, CALL_STAMP, SCENARIOS, type Call, type Framing, type ScenarioId } from '../content/scenarios.v1'
import { ALL_DEFENSIBLE_TEXT, correctCount, isCorrect, patterns } from '../content/scoring'
import { trackRulesCopied } from '../flagsmith/measurement'
import { readPractice, variantToFraming, type Variant } from '../run/attemptStore'
import { useStudy } from '../run/StudyContext'
import { REF, tagged } from '../content/recruitment'
import { fmtChance, fmtP } from '../stats/format'

export type ReadoutRun = {
  kind: 'measured' | 'practice'
  order: ScenarioId[]
  answers: Partial<Record<ScenarioId, Call>>
  seen: Framing
  base: string
  /** The variant Flagsmith served at Start (measured only). */
  variant?: Variant
}

export function useReadoutRun(kind: 'measured' | 'practice'): ReadoutRun | null {
  const { state, practiceRun } = useStudy()
  return useMemo(() => {
    if (kind === 'measured') {
      if (state.kind !== 'finished') return null
      const a = state.attempt
      return { kind, order: a.order, answers: a.answers, seen: variantToFraming(a.variant), base: '/readout', variant: a.variant }
    }
    const p = readPractice() ?? practiceRun
    if (!p) return null
    return { kind, order: p.order, answers: p.answers, seen: p.framing, base: '/practice/readout' }
  }, [kind, state, practiceRun])
}

const other = (f: Framing): Framing => (f === 'p_value' ? 'chance_to_win' : 'p_value')
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** ✓/✗ with words for assistive tech, in the semantic colour (always paired with the glyph). */
function Mark({ ok, className }: { ok: boolean; className?: string }) {
  return (
    <span className={cx('inline-flex items-center', ok ? 'text-good' : 'text-bad', className)}>
      <span aria-hidden="true">{ok ? '✓' : '✗'}</span>
      <span className={srOnly}>{ok ? 'defensible' : 'not defensible'}</span>
    </span>
  )
}

// ---------------- The flip ----------------

/**
 * The reveal (25 §5, 26 §8.4), on a timeline. Every step is placed in the layout from the start and only fades in,
 * so nothing on the page moves except the six inference lines: the motion IS the point.
 */
export const FLIP_AT = {
  sub: 1000,
  flip: 1400,
  sentence: 2800,
  stamps: 3600,
  score: 4400,
  actions: 4800,
} as const
const FLIP_STAGGER_MS = 90
const STAMP_STAGGER_MS = 120
type FlipPhase = 'start' | keyof typeof FLIP_AT
const PHASES: FlipPhase[] = ['start', 'sub', 'flip', 'sentence', 'stamps', 'score', 'actions']
const reached = (p: FlipPhase, q: FlipPhase) => PHASES.indexOf(p) >= PHASES.indexOf(q)

const FRAMING_NAME: Record<Framing, string> = { p_value: 'p-values', chance_to_win: 'chance to beat control' }

/** Shown only once its moment arrives; keeps its space so nothing shifts (26 §8.4 item 6). */
function Reveal({ on, children, className }: { on: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={cx('transition-opacity duration-240 ease-out', on ? 'opacity-100' : 'opacity-0', className)} aria-hidden={!on || undefined}>
      {children}
    </div>
  )
}

/** The player's call as a chip. Neutral until the stamps resolve; then ✓/✗ with words, and colour (always paired). */
function CallStamp({ call, ok, resolved, delayMs }: { call: Call | undefined; ok: boolean; resolved: boolean; delayMs: number }) {
  return (
    <span
      className={cx(chip, 'transition-colors duration-120 ease-out', resolved ? (ok ? 'text-good' : 'text-bad') : 'text-ink-2')}
      style={{ transitionDelay: resolved ? `${delayMs}ms` : undefined }}
      data-stamp={resolved ? (ok ? 'good' : 'bad') : 'neutral'}
    >
      {resolved && <span aria-hidden="true">{ok ? '✓' : '✗'}</span>}
      {call ? CALL_STAMP[call] : '—'}
    </span>
  )
}

export function FlipRoute({ kind }: { kind: 'measured' | 'practice' }) {
  usePageTitle('The flip')
  const run = useReadoutRun(kind)
  const navigate = useNavigate()
  const [phase, setPhase] = useState<FlipPhase>('start')
  const [framing, setFraming] = useState<Framing | null>(null)
  const [animateLines, setAnimateLines] = useState(true)
  const headRef = useRef<HTMLHeadingElement>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const seen = run?.seen

  // Run the timeline once per run. Reduced motion: straight to the end state (25 §5: instant).
  useEffect(() => {
    if (!seen) return
    setFraming(seen)
    if (reduced()) {
      setAnimateLines(false)
      setFraming(other(seen))
      setPhase('actions')
      return
    }
    const list = timers.current
    for (const p of PHASES.slice(1) as (keyof typeof FLIP_AT)[]) {
      list.push(
        setTimeout(() => {
          setPhase(p)
          if (p === 'flip') setFraming(other(seen))
        }, FLIP_AT[p]),
      )
    }
    return () => {
      list.forEach(clearTimeout)
      list.length = 0
    }
  }, [seen])

  // Focus the headline once it exists (the first render has no framing yet, so no heading to focus).
  const hasFraming = framing !== null
  useEffect(() => {
    if (hasFraming) headRef.current?.focus()
  }, [hasFraming])

  const done = phase === 'actions'

  const skip = useCallback(() => {
    if (!seen) return
    timers.current.forEach(clearTimeout)
    timers.current.length = 0
    setAnimateLines(false)
    setFraming(other(seen))
    setPhase('actions')
    // The skipped lines swap instantly; the toggle afterwards rotates them again.
    timers.current.push(setTimeout(() => setAnimateLines(true), 50))
  }, [seen])

  // Space or Enter skips to the end state (26 §8.4 item 7). Only while running, so Enter works on the buttons after.
  useEffect(() => {
    if (done) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'Enter') return
      e.preventDefault()
      skip()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [done, skip])

  if (!run || !framing) {
    if (!run) return <Navigate to={kind === 'measured' ? '/' : '/practice'} replace />
    return null
  }

  const correct = correctCount(run.answers)
  const practice = run.kind === 'practice'
  const headline = practice ? 'This was a practice run.' : `You saw ${FRAMING_NAME[run.seen]}.`
  const sub = practice ? 'Here’s the line that changes between the two versions.' : 'Half of everyone who plays saw this instead.'
  const stampsOn = reached(phase, 'stamps')

  return (
    <div className={cx(page, 'pt-10 pb-4 sm:pt-14')}>
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
        <div>
          <h1 className={cx(type.displayL, 'focus:outline-none')} ref={headRef} tabIndex={-1}>
            {headline}
          </h1>
          <Reveal on={reached(phase, 'sub')} className="mt-2">
            <p className={type.bodyL}>{sub}</p>
          </Reveal>
        </div>
        {/* One slot: Skip while the flip runs, then the toggle that flips all six lines on demand. */}
        <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-2">
          {done ? (
            <>
              <span className={cx(type.eyebrow, 'whitespace-nowrap')} id="flip-toggle-label">
                Show the line as
              </span>
              <FramingToggle value={framing} onChange={setFraming} label="Show the inference line as" />
            </>
          ) : (
            <button type="button" className={cx(btnGhost, 'inline-flex h-11 items-center gap-2 text-[14px]')} onClick={skip}>
              Skip to the end <span className={kbd}>Space</span>
            </button>
          )}
        </div>
      </div>

      <Reveal on={reached(phase, 'sentence')} className="mt-8">
        <p className="max-w-[62ch] text-[17px] leading-7 text-ink-1 sm:text-[19px] sm:leading-8">
          Same results. Same numbers. One line different. That line is a Flagsmith feature flag, and which version leads to
          better calls is what this study measures.
        </p>
        {/* The real flag and, for a measured run, the real variant Flagsmith served this browser at Start. */}
        <p className={cx(type.data, 'mt-3 flex flex-wrap gap-x-3 gap-y-1 text-ink-3')} data-flag-line>
          <span>
            flag <span className="text-ink-2">readout_framing</span>
          </span>
          {run.variant && (
            <span>
              · your variant <span className="text-ink-2">{run.variant}</span>
            </span>
          )}
          <span>· served by Flagsmith</span>
        </p>
      </Reveal>

      <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Your six results">
        {run.order.map((id, i) => {
          const s = SCENARIOS[id]
          const call = run.answers[id]
          const ok = isCorrect(id, call)
          return (
            <li
              key={id}
              className="flex"
              aria-label={`Result ${i + 1}, ${s.shortTitle}: your call ${call ? CALL_LABEL[call] : 'none'}${
                stampsOn ? `, defensible call ${CALL_LABEL[s.key]}` : ''
              }`}
            >
              <ResultCard
                model={s}
                framing={framing}
                density="compact"
                headingLevel={2}
                animate={animateLines}
                animateDelay={i * FLIP_STAGGER_MS}
                eyebrowRight={<CallStamp call={call} ok={ok} resolved={stampsOn} delayMs={i * STAMP_STAGGER_MS} />}
                footer={
                  !ok && (
                    <Reveal on={stampsOn} className="mt-3">
                      <p
                        className={cx(type.data, 'text-ink-2 transition-opacity')}
                        style={{ transitionDelay: stampsOn ? `${i * STAMP_STAGGER_MS}ms` : undefined }}
                      >
                        → {CALL_STAMP[s.key]}
                      </p>
                    </Reveal>
                  )
                }
              />
            </li>
          )
        })}
      </ol>

      <Reveal on={reached(phase, 'score')} className="mt-10 sm:mt-12">
        <p className={type.displayL} data-score={correct}>
          {correct} of 6 defensible calls.
        </p>
      </Reveal>
      <Reveal on={done} className="mt-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 max-sm:flex-col max-sm:items-stretch">
          <button
            type="button"
            className={btn('primary', { blockMobile: true })}
            onClick={() => navigate(`${run.base}/1`)}
            tabIndex={done ? undefined : -1}
          >
            Walk through your six calls
          </button>
          <Link to={`${run.base}/summary`} className={cx(btnGhost, 'text-[15px] max-sm:self-center')} tabIndex={done ? undefined : -1}>
            Skip to your readout
          </Link>
        </div>
      </Reveal>
      <p className={srOnly} aria-live="polite">
        {done
          ? `${headline} ${practice ? 'The other version shows' : 'The other version showed'} ${FRAMING_NAME[other(run.seen)]}. ${correct} of 6 defensible calls.`
          : ''}
      </p>
    </div>
  )
}

// ---------------- Debrief ----------------

/** True when an arrow key belongs to the focused control, not to page navigation. */
function arrowOwnedByTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false
  return !!t.closest('[role="radiogroup"], input, textarea, select, [contenteditable="true"]')
}

/**
 * Desktop: a left rail with number, short title and ✓/✗. Phones: the same list as seven segments across the top.
 * One <nav>, restyled per width, so assistive tech meets it once (26 §8.5 items 3, 12).
 */
function DebriefIndex({ run, n }: { run: ReadoutRun; n: number | null }) {
  const seg =
    'flex min-h-11 items-center gap-3 rounded-control px-3 no-underline text-ink-2 transition-colors duration-120 hover:bg-bg-2 hover:text-ink-1 aria-[current=page]:bg-bg-2 aria-[current=page]:text-ink-1 max-lg:flex-1 max-lg:justify-center max-lg:gap-1 max-lg:px-0'
  return (
    <nav aria-label="Your six results" className="lg:sticky lg:top-20 lg:self-start">
      <p className={cx(type.eyebrow, 'mb-3 max-lg:sr-only')}>Your six calls</p>
      {/* Below 360 px seven 44 px segments cannot fit in one row (29 §12.4), so they wrap into two rows of four. */}
      <ol className="flex gap-1 max-lg:rounded-control max-lg:border max-lg:border-line-2 max-lg:p-1 max-[359px]:grid max-[359px]:grid-cols-4 lg:flex-col">
        {run.order.map((id, i) => {
          const ok = isCorrect(id, run.answers[id])
          const here = i + 1 === n
          return (
            <li key={id} className="max-lg:flex max-lg:flex-1">
              <Link to={`${run.base}/${i + 1}`} aria-current={here ? 'page' : undefined} className={seg}>
                <span className={cx(type.data, here ? 'text-accent' : 'text-ink-3', 'w-4 lg:text-right')}>{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-[14px] leading-5 max-lg:sr-only">{SCENARIOS[id].shortTitle}</span>
                <Mark ok={ok} className="text-[13px]" />
              </Link>
            </li>
          )
        })}
        <li className="max-lg:flex max-lg:flex-1 lg:mt-2 lg:border-t lg:border-line-1 lg:pt-2">
          <Link to={`${run.base}/summary`} aria-current={n === null ? 'page' : undefined} className={seg}>
            <span className={cx(type.data, 'w-4 text-ink-3 lg:text-right')} aria-hidden="true">
              →
            </span>
            <span className="text-[14px] leading-5 max-lg:sr-only">Your readout</span>
          </Link>
        </li>
      </ol>
    </nav>
  )
}

function TrapPart({ title, children, quiet }: { title: string; children: React.ReactNode; quiet?: boolean }) {
  return (
    <div>
      <h3 className={type.eyebrow}>{title}</h3>
      <p className={cx(type.body, 'mt-1.5', quiet ? 'text-ink-2' : 'text-ink-1')}>{children}</p>
    </div>
  )
}

/** The formulas and the p / chance relationship for this card (27 §4). Closed by default; for the statistician. */
function NumbersDisclosure({ id }: { id: ScenarioId }) {
  const s = SCENARIOS[id]
  const a = analyse(s)
  const m = a.primary
  const z = m.inference.z
  return (
    <details className="group mt-10 max-w-card rounded-card border border-line-2 bg-bg-1">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-5 text-[15px] font-medium text-ink-1 [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="text-ink-3 transition-transform duration-180 ease-out group-open:rotate-90 motion-reduce:transition-none">
          ›
        </span>
        About these numbers
        <span className={cx(type.bodyS, 'ml-auto max-sm:hidden')}>formulas · for statisticians</span>
      </summary>
      <div className={cx(type.body, 'grid gap-4 border-t border-line-1 px-5 py-5 text-ink-2')}>
        <p>
          Every figure on this card is computed from the raw counts with the same formulas as Flagsmith’s experiment
          statistics (a port of its <code className="font-mono text-[0.92em] text-ink-1">stats.py</code>), and tests check it.
          Relative lift is (variant − control) / control. Its standard error uses the delta method, and the 95% interval
          is lift ± 1.96 × SE.
        </p>
        <p className={cx(type.data, 'rounded-control bg-bg-0 px-4 py-3 text-ink-1')} data-numbers-figs>
          z = {Number.isFinite(z) ? z.toFixed(3) : '—'} · two-sided p = {fmtP(m.inference.pValue)} · chance to beat control
          = Φ(z) = {fmtChance(m.inference.chanceToWin)}
        </p>
        <p>
          <strong className="font-semibold text-ink-1">Both come from the same z.</strong>{' '}
          {z > 0
            ? 'With z > 0 on a higher-is-better metric, chance = 1 − p/2.'
            : 'With z < 0 on a higher-is-better metric, chance = p/2.'}{' '}
          They answer different questions: p is the probability of a difference at least this large, in either direction,
          if there were truly no difference. Chance to beat control is the model’s probability that the variant is truly
          better. p has no direction; chance does.
        </p>
        {a.guardrail && (
          <p>
            For the lower-is-better guardrail, Flagsmith reports chance to beat control as 1 − Φ(z), so a large increase in
            refunds shows as {inferenceText('chance_to_win', a.guardrail).value}. Its p-value (
            {fmtP(a.guardrail.inference.pValue)}) is unchanged by direction.
          </p>
        )}
        <p>
          Thresholds aren’t the same bar: 95% chance to beat control (Flagsmith’s “winning”) is roughly a two-sided p &lt;
          0.10; p &lt; 0.05 is roughly 97.5%.
        </p>
        {s.id === 'S5' && (
          <p>
            Sample-ratio check: χ² = {a.srm.chiSquare.toFixed(1)}, df = 1, p ≈ {a.srm.pValue.toExponential(0)}. These counts
            are the ones Flagsmith uses in its own statistics glossary SRM example.
          </p>
        )}
      </div>
    </details>
  )
}

/** One page per result, in play order (25 §6, 26 §8.5). */
export function DebriefRoute({ kind }: { kind: 'measured' | 'practice' }) {
  const run = useReadoutRun(kind)
  const params = useParams()
  const navigate = useNavigate()
  const n = Number(params.n)
  const valid = Number.isInteger(n) && n >= 1 && n <= 6
  const id = run && valid ? run.order[n - 1] : undefined
  const [framingState, setFramingState] = useState<{ n: number; framing: Framing } | null>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  usePageTitle(id ? `Result ${n} · ${SCENARIOS[id].shortTitle}` : 'Debrief')

  const framing = run ? (framingState?.n === n ? framingState.framing : run.seen) : null
  const setFraming = useCallback((f: Framing) => setFramingState({ n, framing: f }), [n])

  // Each page opens on the framing this player saw, at the top, with focus on its title.
  useEffect(() => {
    if (!run) return
    window.scrollTo({ top: 0 })
    titleRef.current?.focus({ preventScroll: true })
  }, [n, run?.seen]) // eslint-disable-line react-hooks/exhaustive-deps

  // ← and → move between results (25 §6), unless the focused control uses the arrows itself.
  useEffect(() => {
    if (!run || !valid) return
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.metaKey || e.ctrlKey || e.shiftKey || arrowOwnedByTarget(e.target)) return
      if (e.key === 'ArrowLeft' && n > 1) navigate(`${run.base}/${n - 1}`)
      else if (e.key === 'ArrowRight') navigate(n < 6 ? `${run.base}/${n + 1}` : `${run.base}/summary`)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [n, valid, run, navigate])

  if (!run) return <Navigate to={kind === 'measured' ? '/' : '/practice'} replace />
  if (!id) return <Navigate to={`${run.base}/1`} replace />
  const s = SCENARIOS[id]
  const call = run.answers[id]
  const ok = isCorrect(id, call)
  const prev = n > 1 ? `${run.base}/${n - 1}` : null
  const next = n < 6 ? `${run.base}/${n + 1}` : `${run.base}/summary`
  // Phones share the bottom bar with Previous: the long label would not fit at 320 px.
  const nextLabel =
    n < 6 ? (
      'Next result'
    ) : (
      <>
        <span className="max-sm:hidden">See your readout</span>
        <span className="sm:hidden">Your readout</span>
      </>
    )

  return (
    <div className={cx(page, 'pt-6 pb-28 sm:pt-10 lg:grid lg:grid-cols-12 lg:gap-x-6 lg:pb-16')}>
      <div className="lg:col-span-3">
        <DebriefIndex run={run} n={n} />
      </div>

      <article key={n} className="min-w-0 animate-fade-in max-lg:mt-6 lg:col-span-9" aria-labelledby="debrief-title">
        <p className={type.eyebrow}>
          Debrief · Result {n} of 6{run.kind === 'practice' ? ' · Practice' : ''}
        </p>
        <h1 className={cx(type.titleL, 'mt-2 focus:outline-none')} id="debrief-title" ref={titleRef} tabIndex={-1}>
          Result {n} · {s.shortTitle}
        </h1>
        <p className={cx(type.body, 'mt-2 text-ink-2')}>{s.context}</p>

        <div className="mt-6">
          <ResultCard
            key={id}
            model={s}
            framing={framing ?? run.seen}
            annotations={s.evidence}
            animate
            label={`${s.title}, as you saw it, with the evidence marked`}
            eyebrowRight={
              <FramingToggle value={framing ?? run.seen} onChange={setFraming} compact label="Show this line as" />
            }
          />
        </div>

        {/* 26 §8.5 item 12: the calls row is plain text, not only colour. */}
        <dl className="mt-6 grid max-w-card gap-x-6 gap-y-4 border-y border-line-1 py-5 sm:grid-cols-2" data-calls>
          <div>
            <dt className={type.eyebrow}>You chose</dt>
            <dd className="mt-1.5 flex items-center gap-2 text-[18px] leading-7 font-semibold text-ink-1">
              {call ? CALL_LABEL[call] : 'No call'}
              <Mark ok={ok} />
            </dd>
          </div>
          {!ok && (
            <div>
              <dt className={type.eyebrow}>Defensible call</dt>
              <dd className="mt-1.5 text-[18px] leading-7 font-semibold text-ink-1">{CALL_LABEL[s.key]}</dd>
            </div>
          )}
        </dl>

        <section className="mt-10 max-w-[68ch]" aria-labelledby="trap-name">
          <p className={type.eyebrow}>The trap</p>
          <h2 className={cx(type.titleM, 'mt-2 text-[22px] leading-8 sm:text-[24px]')} id="trap-name">
            {s.trap.name}
          </h2>
          <p className={cx(type.bodyL, 'mt-2')}>{s.trap.oneLiner}</p>
          <div className="mt-7 grid gap-6">
            <TrapPart title={`Why ${CALL_LABEL[s.key].toLowerCase()}`}>{s.why}</TrapPart>
            <TrapPart title="Why not the others" quiet>
              {s.whyNot}
            </TrapPart>
            <TrapPart title="The misconception" quiet>
              {s.misconception}
            </TrapPart>
            <TrapPart title="Why it matters">{s.cost}</TrapPart>
          </div>
          <p className={cx(notice(true), 'mt-7')} data-next-time>
            <span>
              <span className="font-semibold text-ink-1">Next time, check </span>
              {s.rules.map((r, i) => (
                <span key={r}>
                  {i > 0 && ' and '}
                  <Link to={`/rules#rule-${r}`} className={link}>
                    Rule {r}: {RULES[r - 1]!.title}
                  </Link>
                </span>
              ))}
            </span>
          </p>
        </section>

        <NumbersDisclosure id={id} />

        {/* Desktop: at the end of the page. Phones: pinned to the bottom of the screen. */}
        <nav
          aria-label="Previous and next result"
          className="mt-10 flex items-center justify-between gap-3 lg:max-w-card max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-20 max-lg:mt-0 max-lg:border-t max-lg:border-line-1 max-lg:bg-bg-0/92 max-lg:px-4 max-lg:py-3 max-lg:backdrop-blur-[8px]"
        >
          {prev ? (
            <Link to={prev} className={cx(btn('secondary'), 'max-lg:flex-1')}>
              ← Previous
            </Link>
          ) : (
            <span className="max-lg:flex-1" />
          )}
          <span className={cx(type.bodyS, 'max-lg:hidden')}>
            <span className={kbd}>←</span> <span className={kbd}>→</span> to move
          </span>
          <Link to={next} className={cx(btn('primary'), 'max-lg:flex-1')}>
            {nextLabel} →
          </Link>
        </nav>
      </article>
    </div>
  )
}

// ---------------- Your readout ----------------

const SECTION_H = cx(type.titleM, 'mb-4')

/** Six cells in play order, each a link to its debrief (25 §7 item 1). */
function ScoreStrip({ run }: { run: ReadoutRun }) {
  return (
    <ol className="mt-6 grid grid-cols-6 gap-1.5" aria-label="Your calls in play order">
      {run.order.map((id, i) => {
        const ok = isCorrect(id, run.answers[id])
        return (
          <li key={id}>
            <Link
              to={`${run.base}/${i + 1}`}
              className={cx(
                'flex h-14 flex-col items-center justify-center gap-0.5 rounded-control border no-underline transition-colors duration-120 hover:bg-bg-2',
                ok ? 'border-good/45 text-good' : 'border-bad/45 text-bad',
              )}
              data-cell={ok ? 'good' : 'bad'}
            >
              <span className="font-mono text-[11px] leading-4 text-ink-3">{i + 1}</span>
              <span aria-hidden="true" className="text-[17px] leading-5">
                {ok ? '✓' : '✗'}
              </span>
              <span className={srOnly}>
                Result {i + 1}, {SCENARIOS[id].shortTitle}: {ok ? 'defensible' : 'not defensible'}
              </span>
            </Link>
          </li>
        )
      })}
    </ol>
  )
}

/** Desktop: a table. Phones: stacked rows (26 §8.6 item 11). Only one is displayed at a time. */
function CallsTable({ run }: { run: ReadoutRun }) {
  const rows = run.order.map((id, i) => {
    const s = SCENARIOS[id]
    const c = run.answers[id]
    return { id, i, s, c, ok: isCorrect(id, c) }
  })
  return (
    <>
      <table className="w-full border-collapse text-left text-[14px] leading-5 max-sm:hidden">
        <thead>
          <tr className={cx(type.eyebrow, 'border-b border-line-2')}>
            <th scope="col" className="py-2 pr-3 font-medium">Result</th>
            <th scope="col" className="py-2 pr-3 font-medium">Trap</th>
            <th scope="col" className="py-2 pr-3 font-medium">Your call</th>
            <th scope="col" className="py-2 pr-3 font-medium">Defensible call</th>
            <th scope="col" className="py-2 font-medium">
              <span className={srOnly}>Defensible?</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ id, i, s, c, ok }) => (
            <tr key={id} className="border-b border-line-1 align-top">
              <th scope="row" className="py-3 pr-4 font-normal whitespace-nowrap">
                <Link to={`${run.base}/${i + 1}`} className={link}>
                  {i + 1} · {s.shortTitle}
                </Link>
              </th>
              <td className="py-3 pr-4 text-ink-2">{s.trap.name}</td>
              <td className="py-3 pr-4 text-ink-1 whitespace-nowrap">{c ? CALL_LABEL[c] : '—'}</td>
              <td className="py-3 pr-4 text-ink-2 whitespace-nowrap">{CALL_LABEL[s.key]}</td>
              <td className="py-3">
                <Mark ok={ok} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ol className="border-t border-line-1 sm:hidden">
        {rows.map(({ id, i, s, c, ok }) => (
          <li key={id} className="border-b border-line-1 py-3">
            <Link to={`${run.base}/${i + 1}`} className={cx(link, 'text-[15px] font-medium')}>
              Result {i + 1} · {s.shortTitle}
            </Link>
            <p className={cx(type.data, 'mt-1 text-ink-2')}>
              you: <span className="text-ink-1">{c ? CALL_LABEL[c] : '—'}</span> <Mark ok={ok} />
              {!ok && (
                <>
                  {' '}
                  · defensible: <span className="text-ink-1">{CALL_LABEL[s.key]}</span>
                </>
              )}
            </p>
          </li>
        ))}
      </ol>
    </>
  )
}

function NextRow({ title, text, action }: { title: string; text: string; action: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-x-6 gap-y-3 border-b border-line-1 py-5 max-sm:flex-col max-sm:items-stretch">
      <div>
        <p className="text-[16px] leading-6 font-semibold text-ink-1">{title}</p>
        <p className={cx(type.bodyS, 'mt-0.5')}>{text}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </li>
  )
}

/** Your readout (25 §7, 26 §8.6). It labels the calls, never the person. */
export function SummaryRoute({ kind }: { kind: 'measured' | 'practice' }) {
  usePageTitle('Your readout')
  const run = useReadoutRun(kind)
  const headRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    window.scrollTo({ top: 0 })
    headRef.current?.focus({ preventScroll: true })
  }, [])
  if (!run) return <Navigate to={kind === 'measured' ? '/' : '/practice'} replace />
  const correct = correctCount(run.answers)
  const pats = patterns(run.answers).slice(0, 3)
  const shareText = `I made ${correct} of 6 defensible calls on six A/B test results. Would you ship it? ${tagged(window.location.origin, REF.share)}`

  return (
    <div className={cx(page, 'pt-6 pb-16 sm:pt-10 lg:grid lg:grid-cols-12 lg:gap-x-6')}>
      <div className="lg:col-span-3">
        <DebriefIndex run={run} n={null} />
      </div>
      <div className="min-w-0 max-w-read animate-fade-in max-lg:mt-6 lg:col-span-9">
        <p className={type.eyebrow}>Your readout{run.kind === 'practice' ? ' · Practice' : ''}</p>
        <h1 className={cx(type.displayL, 'mt-2 focus:outline-none')} ref={headRef} tabIndex={-1} data-score={correct}>
          {correct} of 6 defensible calls
        </h1>
        <ScoreStrip run={run} />

        <section className="mt-12" aria-labelledby="pat-h">
          <h2 className={SECTION_H} id="pat-h">
            What your calls suggest
          </h2>
          {pats.length === 0 ? (
            <p className={cx(type.body, 'text-ink-1')}>{ALL_DEFENSIBLE_TEXT}</p>
          ) : (
            <ol className="grid gap-3" data-patterns>
              {pats.map((p, i) => (
                <li
                  key={p.id}
                  className={cx('rounded-card border bg-bg-1 px-5 py-4', i === 0 ? 'border-line-3' : 'border-line-1')}
                >
                  <p className="text-[16px] leading-6 font-semibold text-ink-1">{p.title}</p>
                  <p className={cx(type.body, 'mt-1 text-ink-2')}>{p.text}</p>
                  {PATTERN_RULES[p.id] && (
                    <p className={cx(type.bodyS, 'mt-2')} data-pattern-rule={PATTERN_RULES[p.id]}>
                      <span className="font-semibold text-ink-1">Next time: </span>
                      <Link to={`/rules#rule-${PATTERN_RULES[p.id]}`} className={link}>
                        Rule {PATTERN_RULES[p.id]}, {RULES[PATTERN_RULES[p.id]! - 1]!.title}
                      </Link>
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="mt-12" aria-labelledby="calls-h">
          <h2 className={SECTION_H} id="calls-h">
            Your calls
          </h2>
          <CallsTable run={run} />
        </section>

        <section className="mt-12" aria-labelledby="next-h">
          <h2 className={cx(SECTION_H, 'mb-0')} id="next-h">
            Next steps
          </h2>
          <ul>
            <NextRow
              title="Copy the Readout Rules"
              text="Six checks, in order, before anyone says “ship”. Pastes as a Markdown checklist."
              action={<CopyButton text={rulesMarkdown()} label="Copy as Markdown" primary onCopied={() => void trackRulesCopied()} />}
            />
            <NextRow
              title="Run it with your team"
              text="A 30-minute drill. No accounts."
              action={
                <Link to="/team" className={btn('secondary', { blockMobile: true })}>
                  Team guide
                </Link>
              }
            />
            <NextRow
              title="Practice again"
              text="A fresh order, with the inference line switchable. Never measured."
              action={
                <Link to="/practice" className={btn('secondary', { blockMobile: true })}>
                  Practice
                </Link>
              }
            />
          </ul>
        </section>

        <section className="mt-12" aria-labelledby="share-h">
          <h2 className={SECTION_H} id="share-h">
            Share
          </h2>
          <p className={cx(type.bodyS)}>The text never mentions what’s being tested or the answers.</p>
          <p className={cx(type.data, 'mt-3 rounded-control border border-line-2 bg-bg-1 px-4 py-3 break-words text-ink-1')} data-share>
            {shareText}
          </p>
          <CopyButton text={shareText} label="Copy share text" className="mt-4" />
        </section>
      </div>
    </div>
  )
}
