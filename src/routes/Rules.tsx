/**
 * The Readout Rules (25 §8, 26 §8.7): a stable, linkable reference for real experiment reviews. Everything a team
 * needs to paste into a review doc or pull request: the rules as a Markdown checklist and the review template.
 * The only Flagsmith call is M5, through measurement.ts, and only for a measured, already-sent attempt.
 */
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CopyButton, usePageTitle } from '../components/site/Site'
import { cx, link, page, type } from '../components/ui/classes'
import { CALLS_LINE, REVIEW_TEMPLATE, RULES, TRAPS, rulesMarkdown } from '../content/rules'
import { trackRulesCopied } from '../flagsmith/measurement'

/**
 * The ladder (25 §8): rules 1→6 top to bottom; each exit is the Calls line. `exit` is where a result leaves the
 * ladder, `on` the condition that sends it there. Same content as CALLS_LINE (a test keeps them in step).
 */
export const LADDER: { n: number; ask: string; on: string; exit: string }[] = [
  { n: 1, ask: 'Split matches the configuration?', on: 'no', exit: 'Don’t trust these results' },
  { n: 2, ask: 'Reached the planned sample?', on: 'no', exit: 'Keep collecting' },
  { n: 3, ask: 'Moved the right way?', on: 'no', exit: 'Keep the control' },
  { n: 4, ask: 'Interval clear of zero?', on: 'crosses zero', exit: 'Keep the control' },
  { n: 5, ask: 'Guardrails not clearly worse?', on: 'clearly worse', exit: 'Keep the control' },
  { n: 6, ask: 'Clears the bar you wrote down?', on: 'yes', exit: 'Ship' },
]

const ROW = 64
const BOX_H = 44
const BOX_W = 330
const EXIT_X = 430

/** Inline SVG, not decoration (26 §8.7): same content as the Calls line. Hidden on phones, where the list replaces it. */
function DecisionLadder() {
  const h = (LADDER.length - 1) * ROW + BOX_H + 8
  return (
    <svg
      viewBox={`0 0 640 ${h}`}
      className="w-full max-sm:hidden"
      role="img"
      aria-labelledby="ladder-title ladder-desc"
      data-ladder
    >
      <title id="ladder-title">Decision ladder</title>
      <desc id="ladder-desc">
        {LADDER.map((r) => `Rule ${r.n}, ${r.ask} If ${r.on}: ${r.exit.toLowerCase()}.`).join(' ')} Otherwise go to the
        next rule.
      </desc>
      <defs>
        <marker id="ladder-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M0 0 L8 4 L0 8 z" className="fill-line-3" />
        </marker>
      </defs>
      {LADDER.map((r, i) => {
        const y = 4 + i * ROW
        const mid = y + BOX_H / 2
        const last = i === LADDER.length - 1
        const ship = r.exit === 'Ship'
        return (
          <g key={r.n}>
            <rect x="1" y={y} width={BOX_W} height={BOX_H} rx="6" className="fill-bg-1 stroke-line-2" />
            <text x="18" y={mid + 5} className="fill-ink-3 font-mono text-[13px]">
              {r.n}
            </text>
            <text x="42" y={mid + 5} className="fill-ink-1 font-sans text-[15px]">
              {r.ask}
            </text>
            {/* Exit to the right. */}
            <line x1={BOX_W + 1} y1={mid} x2={EXIT_X - 6} y2={mid} className="stroke-line-3" markerEnd="url(#ladder-arrow)" />
            <text x={(BOX_W + EXIT_X) / 2} y={mid - 8} textAnchor="middle" className="fill-ink-3 font-mono text-[11px]">
              {r.on}
            </text>
            <rect
              x={EXIT_X}
              y={y + 6}
              width={638 - EXIT_X}
              height={BOX_H - 12}
              rx="4"
              className={ship ? 'fill-accent' : 'fill-none stroke-line-3'}
            />
            <text
              x={EXIT_X + 12}
              y={mid + 5}
              className={cx('font-sans text-[14px]', ship ? 'fill-accent-ink font-semibold' : 'fill-ink-2')}
            >
              {r.exit}
            </text>
            {/* Otherwise, down to the next rule. */}
            {!last && (
              <>
                <line x1="40" y1={y + BOX_H} x2="40" y2={y + ROW - 4} className="stroke-line-3" markerEnd="url(#ladder-arrow)" />
                <text x="50" y={y + BOX_H + 14} className="fill-ink-3 font-mono text-[11px]">
                  {r.n === 4 ? 'clear' : r.n === 5 ? 'fine' : 'yes'}
                </text>
              </>
            )}
          </g>
        )
      })}
    </svg>
  )
}

/** The phone version of the ladder, and its text equivalent. */
function LadderList() {
  return (
    <ol className="grid gap-2 sm:hidden" aria-label="Decision ladder">
      {LADDER.map((r) => (
        <li key={r.n} className="rounded-control border border-line-2 bg-bg-1 px-4 py-3">
          <p className="text-[15px] leading-6 text-ink-1">
            <span className={cx(type.data, 'mr-2 text-ink-3')}>{r.n}</span>
            {r.ask}
          </p>
          <p className={cx(type.data, 'mt-1 text-ink-2')}>
            {r.on} → <span className={r.exit === 'Ship' ? 'text-accent' : 'text-ink-1'}>{r.exit}</span>
          </p>
        </li>
      ))}
    </ol>
  )
}

/** `/rules#rule-3`, and the short `/rules#3` from 25 §8, both land on rule 3. */
function useRuleTarget(): number | null {
  const { hash } = useLocation()
  const m = /^#(?:rule-)?([1-6])$/.exec(hash)
  const n = m ? Number(m[1]) : null
  useEffect(() => {
    if (!n) return
    document.getElementById(`rule-${n}`)?.scrollIntoView({ block: 'start' })
  }, [n])
  return n
}

export function RulesRoute() {
  usePageTitle('The Readout Rules')
  const target = useRuleTarget()
  const [lit, setLit] = useState(target)
  // The linked rule is marked briefly so the eye finds it after the jump.
  useEffect(() => {
    setLit(target)
    if (!target) return
    const t = setTimeout(() => setLit(null), 1600)
    return () => clearTimeout(t)
  }, [target])

  return (
    <div className={cx(page, 'pt-10 pb-16 sm:pt-16 print:py-0')}>
      <div className="mx-auto max-w-read">
        <p className={type.eyebrow}>Reference · for real experiment reviews</p>
        <h1 className={cx(type.displayL, 'mt-3')}>The Readout Rules</h1>
        <p className={cx(type.bodyL, 'mt-4')}>Use these, in order, before anyone says “ship”.</p>

        <ol className="mt-10 grid gap-2 print:mt-6 print:gap-0" aria-label="The six rules">
          {RULES.map((r) => (
            <li
              key={r.n}
              id={`rule-${r.n}`}
              className={cx(
                'group relative grid scroll-mt-24 grid-cols-[2.5rem_1fr] rounded-card py-4 print:py-2 transition-colors duration-240 sm:grid-cols-[3.5rem_1fr] lg:-ml-20 lg:grid-cols-[5rem_1fr]',
                lit === r.n ? 'bg-accent-wash' : 'bg-transparent',
              )}
              data-rule={r.n}
            >
              <span
                className="font-display text-[32px] leading-none text-ink-3 sm:text-[44px] lg:pr-6 lg:text-right"
                aria-hidden="true"
              >
                {r.n}
              </span>
              <div>
                <h2 className="text-[18px] leading-7 font-semibold text-ink-1 sm:text-[19px]">
                  {r.title}
                  <a
                    href={`#rule-${r.n}`}
                    className="ml-2 font-mono text-[14px] font-normal text-ink-3 no-underline opacity-0 max-sm:hidden group-hover:opacity-100 hover:text-ink-1 focus-visible:opacity-100"
                    aria-label={`Link to rule ${r.n}`}
                  >
                    #
                  </a>
                </h2>
                <p className={cx(type.body, 'mt-1 text-ink-2')}>{r.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-6 rounded-card border border-line-2 bg-bg-1 px-5 py-4" data-calls-line>
          <p className={type.eyebrow}>Calls</p>
          <ul className={cx(type.data, 'mt-2 grid gap-1 text-ink-2')}>
            {CALLS_LINE.map((c) => (
              <li key={c.when}>
                {c.when} → <span className="font-medium text-ink-1">{c.call}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-8 flex flex-wrap items-start gap-3 print:hidden">
          <CopyButton text={rulesMarkdown()} label="Copy as Markdown" primary onCopied={() => void trackRulesCopied()} />
          <CopyButton text={REVIEW_TEMPLATE} label="Copy review template" />
        </div>
        <p className={cx(type.bodyS, 'mt-3 print:hidden')}>
          Both paste as GitHub-flavoured Markdown: into a pull request, an issue or your team’s review doc.
        </p>

        <section className="mt-16" aria-labelledby="ladder-h">
          <h2 className={cx(type.titleM, 'mb-2')} id="ladder-h">
            The decision ladder
          </h2>
          <p className={cx(type.bodyS, 'mb-6')}>Top to bottom. The first rule a result fails decides the call.</p>
          <DecisionLadder />
          <LadderList />
        </section>

        <section className="mt-16" aria-labelledby="traps-h">
          <h2 className={cx(type.titleM, 'mb-4')} id="traps-h">
            Six ways a good test becomes a bad decision
          </h2>
          <ul className="border-t border-line-1">
            {TRAPS.map((t) => (
              <li key={t.name} className="flex items-baseline justify-between gap-6 border-b border-line-1 py-4">
                <div>
                  <p className="text-[16px] leading-6 font-semibold text-ink-1">{t.name}</p>
                  <p className={cx(type.body, 'mt-0.5 text-ink-2')}>{t.oneLiner}</p>
                </div>
                <a href={`#rule-${t.rule}`} className={cx(link, type.data, 'shrink-0 whitespace-nowrap')}>
                  Rule {t.rule}
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-16 print:break-inside-avoid" aria-labelledby="template-h">
          <h2 className={cx(type.titleM, 'mb-2')} id="template-h">
            Experiment review template
          </h2>
          <p className={cx(type.body, 'mb-4 text-ink-2')}>
            Fill it in before launch (the top half) and at the readout (the checklist). Works for any experiment, including
            one run with Flagsmith feature flags.
          </p>
          <pre
            className="overflow-x-auto rounded-card border border-line-2 bg-bg-1 p-5 font-mono text-[13px] leading-[22px] text-ink-1 print:overflow-visible print:whitespace-pre-wrap"
            tabIndex={0}
            aria-label="Experiment review template"
          >
            <code>{REVIEW_TEMPLATE}</code>
          </pre>
        </section>

        <p className={cx(type.bodyS, 'mt-12 print:hidden')}>
          Learned these by playing?{' '}
          <Link to="/" className={link}>
            Try the six results
          </Link>{' '}
          or{' '}
          <Link to="/team" className={link}>
            run it with your team
          </Link>
          .
        </p>
      </div>
    </div>
  )
}
