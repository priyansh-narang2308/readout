/**
 * ResultCard family (25 §4.2, 26 §6). FROZEN at tag measured-v1.
 *
 * The two arms differ in ONE place only: the text inside [data-inference]. Same box, type, colour, position.
 * No semantic colour anywhere in the measured card (26 §1 rule 1). Tested by T-INVARIANT.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { analyse, type MetricAnalysis } from '../../content/analysis'
import type { EvidenceTarget, Framing, MetricSpec } from '../../content/scenarios.v1'
import {
  fmtChance,
  fmtCount,
  fmtInterval,
  fmtLift,
  fmtP,
  fmtPp,
  fmtRate,
  fmtSplit,
} from '../../stats/format'
import { cx, evidence, type } from '../ui/classes'

type Density = 'full' | 'compact'

/** Eyebrow inside the card: 11 px on the compact card. */
const eyebrowFor = (d: Density) => (d === 'compact' ? cx(type.eyebrowBase, 'text-[11px] leading-4') : type.eyebrow)

export type CardModel = {
  id?: string
  title: string
  hypothesis: string
  primary: MetricSpec
  guardrail?: MetricSpec & { rule: string }
  checks: { daysRun: number; daysPlanned: number; usersPlanned: number; configured: [number, number] }
}

type Annotation = { target: EvidenceTarget; callout: string }

export function inferenceText(framing: Framing, m: MetricAnalysis): { label: string; value: string } {
  return framing === 'p_value'
    ? { label: 'p-value', value: fmtP(m.inference.pValue) }
    : { label: 'Chance to beat control', value: fmtChance(m.inference.chanceToWin) }
}

/** How long the accent outline marks a flipped line: the 280 ms rotation plus a beat (26 §7: shown 600 ms). */
export const FLASH_MS = 600

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * InferenceLine — the only arm-dependent element.
 * When `animate` is set and the framing prop changes, the line rotates on its X axis (out 140 ms, in 140 ms).
 */
export function InferenceLine({
  framing,
  metric,
  animate = false,
  delayMs = 0,
  density = 'full',
}: {
  framing: Framing
  metric: MetricAnalysis
  animate?: boolean
  delayMs?: number
  density?: Density
}) {
  const [shown, setShown] = useState(framing)
  const [flash, setFlash] = useState(false)
  const ref = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    if (framing === shown) return
    const el = ref.current
    if (!animate || !el || prefersReducedMotion() || typeof el.animate !== 'function') {
      setShown(framing)
      if (animate) setFlash(true)
      return
    }
    let cancelled = false
    const timers: ReturnType<typeof setTimeout>[] = []
    timers.push(
      setTimeout(() => {
        setFlash(true)
        const out = el.animate([{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(90deg)' }], {
          duration: 140,
          easing: 'cubic-bezier(.4,0,1,1)',
          fill: 'forwards',
        })
        let swapped = false
        const swapIn = () => {
          if (cancelled || swapped) return
          swapped = true
          setShown(framing)
          el.animate([{ transform: 'rotateX(-90deg)' }, { transform: 'rotateX(0deg)' }], {
            duration: 140,
            easing: 'cubic-bezier(.2,.8,.2,1)',
            fill: 'forwards',
          })
        }
        out.onfinish = swapIn
        // A hidden tab renders no frames, so `finish` may never fire: never leave the old line on screen.
        timers.push(setTimeout(swapIn, 400))
      }, delayMs),
    )
    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
    }
  }, [framing, shown, animate, delayMs])

  // The outline marks the row briefly. Its own effect: the swap above re-runs that effect, and its cleanup must not
  // cancel the timer that clears the outline (it did, and the outline stayed on).
  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(false), FLASH_MS)
    return () => clearTimeout(t)
  }, [flash])

  const t = inferenceText(shown, metric)
  return (
    <div
      className={cx(
        'mt-3 inline-block rounded-[4px] transition-shadow duration-240 ease-out perspective-[400px]',
        flash && 'shadow-[0_0_0_1px_var(--color-accent)]',
      )}
    >
      <p
        className={cx(
          'inline-flex h-6 origin-center items-center gap-2 whitespace-nowrap text-ink-1 backface-hidden',
          density === 'compact' ? 'min-w-0 font-mono text-[13px] leading-5 tabular-nums' : cx(type.data, 'min-w-[30ch]'),
        )}
        data-inference={shown}
        ref={ref}
      >
        <span className="text-ink-2">{t.label}</span>
        <span aria-hidden="true" className="text-line-3">
          ·
        </span>
        <span className="font-medium">{t.value}</span>
      </p>
    </div>
  )
}

export function IntervalBar({
  metric,
  evidence: isEvidence,
  density = 'full',
}: {
  metric: MetricAnalysis
  evidence?: boolean
  density?: Density
}) {
  const { ciLow: lo, ciHigh: hi, lift } = metric.inference
  const min = Math.min(lo, 0)
  const max = Math.max(hi, 0)
  const pad = (max - min) * 0.08 || 0.01
  const a = min - pad
  const b = max + pad
  const pos = (x: number) => ((x - a) / (b - a)) * 100
  const label = `95% interval for the lift from ${fmtLift(lo)} to ${fmtLift(hi)}; point estimate ${fmtLift(lift)}`
  return (
    <div className={isEvidence ? evidence() : undefined} data-evidence-el="interval">
      <p
        className={cx(
          'flex flex-wrap gap-x-2 text-ink-1',
          density === 'compact' ? 'font-mono text-[12px] leading-4 tabular-nums' : type.data,
        )}
      >
        <span className="text-ink-3">95% interval for the lift</span> {fmtInterval(lo, hi)}
      </p>
      <div className="relative mt-1.5 h-8" role="img" aria-label={label}>
        <div className="absolute inset-x-0 top-[11px] h-px bg-line-2" />
        <div
          className="absolute top-[7px] h-[9px] bg-viz-bar opacity-55"
          style={{ left: `${pos(lo)}%`, width: `${pos(hi) - pos(lo)}%` }}
        />
        <div className="absolute top-0 h-[23px] w-px bg-viz-zero" style={{ left: `${pos(0)}%` }}>
          <span className="absolute top-[22px] left-1/2 -translate-x-1/2 font-mono text-[11px] leading-3 tabular-nums text-ink-3">
            0
          </span>
        </div>
        <div
          className="absolute top-[5px] -ml-[6.5px] size-[13px] rounded-full border-2 border-bg-1 bg-viz-point"
          style={{ left: `${pos(lift)}%` }}
        />
      </div>
    </div>
  )
}

const HEAD_CELL = 'border-b border-line-1 pt-0 pr-0 pb-[5px] text-[12px] leading-4 font-normal'
const BODY_CELL = 'border-b border-line-1 py-[5px] pr-0 font-normal'

function ArmTable({ m, evidence: isEvidence }: { m: MetricAnalysis; evidence?: boolean }) {
  const rows = [
    { arm: 'Control', ...m.spec.control, rate: m.controlRate },
    { arm: 'Variant', ...m.spec.variant, rate: m.variantRate },
  ]
  return (
    <table
      className={cx(type.data, 'mt-3 w-full border-collapse text-ink-1', isEvidence && evidence('outline-offset-4'))}
      data-evidence-el="arms"
    >
      <thead>
        <tr>
          <th scope="col" className={cx(HEAD_CELL, 'pl-0 text-left font-sans text-ink-2')}>
            <span className="sr-only">Arm</span>
          </th>
          <th scope="col" className={cx(HEAD_CELL, 'pl-3 text-right text-ink-3')}>
            Users
          </th>
          <th scope="col" className={cx(HEAD_CELL, 'pl-3 text-right text-ink-3')}>
            {capitalise(m.spec.unit)}
          </th>
          <th scope="col" className={cx(HEAD_CELL, 'pl-3 text-right text-ink-3')}>
            Rate
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.arm} className="[&:last-child>*]:border-b-0">
            <th scope="row" className={cx(BODY_CELL, 'pl-0 text-left font-sans text-ink-2')}>
              {r.arm}
            </th>
            <td className={cx(BODY_CELL, 'pl-3 text-right')}>{fmtCount(r.users)}</td>
            <td className={cx(BODY_CELL, 'pl-3 text-right')}>{fmtCount(r.conversions)}</td>
            <td className={cx(BODY_CELL, 'pl-3 text-right font-medium')}>{fmtRate(r.rate)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Separator glued to the item before it, so it never wraps onto a line of its own. */
function Sep() {
  return (
    <span aria-hidden="true" className="text-line-3">
      {' ·'}
    </span>
  )
}

/** Lets the split wrap only before "(configured …)", never inside a number pair. */
function SplitText({ text }: { text: string }) {
  const i = text.indexOf(' (')
  if (i < 0) return <>{text}</>
  return (
    <>
      <span className="whitespace-nowrap">{text.slice(0, i)}</span>{' '}
      <span className="whitespace-nowrap">{text.slice(i + 1)}</span>
    </>
  )
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function directionWords(d: 'up' | 'down') {
  return d === 'up' ? 'higher is better' : 'lower is better'
}

function Callout({ id, text }: { id: string; text: string }) {
  return (
    <span
      className="mt-3 mr-3 inline-flex animate-evidence-in items-center gap-1.5 rounded-chip bg-accent px-2 py-0.5 font-mono text-[12px] leading-[18px] font-medium text-accent-ink [animation-delay:120ms]"
      id={id}
      role="note"
    >
      {text}
    </span>
  )
}

function MetricBlock({
  m,
  kind,
  framing,
  density,
  rule,
  annotations,
  animate,
  animateDelay,
  idBase,
}: {
  m: MetricAnalysis
  kind: 'Primary metric' | 'Guardrail'
  framing: Framing | null
  density: Density
  rule?: string
  annotations: Annotation[]
  animate?: boolean
  animateDelay?: number
  idBase: string
}) {
  const liftEvidence = annotations.find((x) => x.target === (kind === 'Guardrail' ? 'guardrail' : 'lift'))
  const intervalEvidence = kind === 'Primary metric' ? annotations.find((x) => x.target === 'interval') : undefined
  const armsEvidence = kind === 'Primary metric' ? annotations.find((x) => x.target === 'arms') : undefined
  const diff = m.variantRate - m.controlRate
  const full = density === 'full'
  return (
    <div
      className={cx('border-t border-line-1', full ? 'mt-5 pt-5' : 'mt-3 pt-3')}
      data-metric={kind === 'Guardrail' ? 'guardrail' : 'primary'}
    >
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className={eyebrowFor(density)}>{kind}</span>
        <span className={cx('font-medium', full ? 'text-[15px] leading-[22px]' : 'text-[13px] leading-[18px]')}>
          {m.spec.name} <span className="text-ink-3">· {directionWords(m.spec.direction)}</span>
        </span>
      </p>
      {rule && <p className="mt-1 text-body-s text-ink-2">{rule}</p>}
      {density === 'full' && (
        <>
          <ArmTable m={m} evidence={!!armsEvidence} />
          {armsEvidence && <Callout id={`${idBase}-arms`} text={armsEvidence.callout} />}
        </>
      )}
      {/* Figure and label stacked on the left, interval on the right; one column on phones and compact cards. */}
      <div
        className={cx(
          'grid items-end gap-x-8',
          full ? 'mt-3 grid-cols-[auto_1fr] max-sm:grid-cols-1' : 'mt-2 grid-cols-1',
          liftEvidence ? evidence('outline-offset-6') : 'rounded-control',
        )}
        aria-describedby={liftEvidence ? `${idBase}-lift-${kind}` : undefined}
      >
        <p
          className={cx(
            'col-start-1 row-start-1 font-mono font-medium tracking-[-0.02em] tabular-nums',
            full ? 'text-[34px] leading-10 sm:text-[44px] sm:leading-12' : 'text-[26px] leading-[30px]',
          )}
        >
          {fmtLift(m.inference.lift)}
        </p>
        <p className={cx('col-start-1 row-start-2', type.bodyS)}>
          relative lift{full && <> · {fmtPp(diff)} absolute</>}
        </p>
        <div
          className={cx(
            'min-w-0',
            full
              ? 'col-start-2 row-span-2 row-start-1 max-sm:col-start-1 max-sm:row-span-1 max-sm:row-start-3 max-sm:mt-3'
              : 'col-start-1 row-start-3 mt-2',
          )}
        >
          <IntervalBar metric={m} evidence={!!liftEvidence || !!intervalEvidence} density={density} />
        </div>
      </div>
      {liftEvidence && <Callout id={`${idBase}-lift-${kind}`} text={liftEvidence.callout} />}
      {intervalEvidence && !liftEvidence && <Callout id={`${idBase}-interval`} text={intervalEvidence.callout} />}
      {framing && (
        <InferenceLine framing={framing} metric={m} animate={animate} delayMs={animateDelay} density={density} />
      )}
    </div>
  )
}

export function ResultCard({
  model,
  framing,
  density = 'full',
  annotations = [],
  eyebrowRight,
  footer,
  animate,
  animateDelay,
  titleId,
  titleRef,
  headingLevel = 2,
  label,
}: {
  model: CardModel
  /** null = no inference row at all (landing preview card). */
  framing: Framing | null
  density?: Density
  annotations?: Annotation[]
  eyebrowRight?: ReactNode
  footer?: ReactNode
  animate?: boolean
  animateDelay?: number
  titleId?: string
  titleRef?: React.Ref<HTMLHeadingElement>
  headingLevel?: 2 | 3
  label?: string
}) {
  const autoId = useId().replace(/:/g, '')
  const tid = titleId ?? `rc-title-${autoId}`
  const a = analyse(model)
  const total = a.totalUsers
  const checksEvidence = annotations.find((x) => x.target === 'checks')
  const splitEvidence = annotations.find((x) => x.target === 'split')
  const H = headingLevel === 2 ? 'h2' : 'h3'
  return (
    <section
      className={cx(
        'relative w-full max-w-card rounded-card border border-line-2 bg-bg-1',
        density === 'full' ? 'p-6 sm:px-7 sm:py-5' : 'p-4',
      )}
      data-density={density}
      aria-labelledby={label ? undefined : tid}
      aria-label={label}
      data-scenario={model.id}
    >
      <header className="flex min-h-[22px] items-center justify-between gap-3">
        <p className={eyebrowFor(density)}>Fictional test</p>
        {eyebrowRight}
      </header>
      <H
        className={cx(
          'mt-1.5 font-semibold tracking-[-0.01em] focus:outline-none',
          density === 'full' ? 'text-[26px] leading-8' : 'text-[17px] leading-6',
        )}
        id={tid}
        tabIndex={-1}
        ref={titleRef}
      >
        {model.title}
      </H>
      {density === 'full' && <p className="mt-2 max-w-[60ch] text-[16px] leading-6 text-ink-2">“{model.hypothesis}”</p>}
      {density === 'full' && (
        <>
          {/* Each item is one unit; the strip wraps between items (26 §8.2 item 11). */}
          <p className={cx(type.data, 'mt-3 flex flex-wrap gap-x-2 gap-y-0.5 text-ink-2')}>
            <span className={cx('whitespace-nowrap', checksEvidence && evidence())}>
              Ran {model.checks.daysRun} of {model.checks.daysPlanned} days
              <Sep />
            </span>
            <span className={cx('whitespace-nowrap', checksEvidence && evidence())}>
              {fmtCount(total)} of {fmtCount(model.checks.usersPlanned)} planned users
              <Sep />
            </span>
            <span className={splitEvidence ? evidence() : undefined}>
              <SplitText text={`Split ${fmtSplit(a.srm.observedShares, model.checks.configured)}`} />
            </span>
          </p>
          {checksEvidence && <Callout id={`${tid}-checks`} text={checksEvidence.callout} />}
          {splitEvidence && <Callout id={`${tid}-split`} text={splitEvidence.callout} />}
        </>
      )}
      <MetricBlock
        m={a.primary}
        kind="Primary metric"
        framing={framing}
        density={density}
        annotations={annotations}
        animate={animate}
        animateDelay={animateDelay}
        idBase={tid}
      />
      {a.guardrail ? (
        <MetricBlock
          m={a.guardrail}
          kind="Guardrail"
          framing={framing}
          density={density}
          rule={density === 'full' ? model.guardrail?.rule : undefined}
          annotations={annotations}
          animate={animate}
          animateDelay={animateDelay}
          idBase={tid}
        />
      ) : (
        density === 'full' && (
          <p className={cx(type.bodyS, 'mt-3 border-t border-line-1 pt-3')}>Guardrails · none set for this test</p>
        )
      )}
      {footer}
    </section>
  )
}
