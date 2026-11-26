/**
 * Landing (25 §3, 26 §8.1, 34 §4.1–4.2). Static: it renders at once and sends nothing to Flagsmith. Only the Start
 * button talks to Flagsmith, and only after the player has read the consent block next to it.
 *
 * It never renders an InferenceLine and never mounts MeasuredSession (25 §2 rule 4): the preview card has no
 * inference row at all.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ResultCard } from '../components/result/ResultCard'
import { usePageTitle } from '../components/site/Site'
import { btn, btnGhost, cx, link, notice, page, spinner, type } from '../components/ui/classes'
import { RECORDED_PLAIN } from '../content/privacy'
import { TRAPS } from '../content/rules'
import { CALLS, CALL_LABEL, PREVIEW_SCENARIO } from '../content/scenarios.v1'
import { PRACTICE_COPY, type PracticeReason } from '../content/study'
import { landingAction } from '../run/attemptStore'
import { useStudy } from '../run/StudyContext'

export function Landing() {
  usePageTitle('Readout')
  return (
    <>
      <section className={cx(page, 'grid items-start gap-x-6 gap-y-10 pt-10 sm:pt-16 lg:grid-cols-12 lg:pt-10')}>
        <div className="lg:col-span-6">
          <p className={type.eyebrow}>Experiment-decision training</p>
          <h1 className={cx(type.displayXl, 'mt-3 text-balance')}>Would you ship it?</h1>
          <p className={cx(type.bodyL, 'mt-5')}>
            Six realistic A/B test results. For each, make the call: ship, keep the control, keep collecting, or don’t trust
            the data. Then see exactly which reading mistakes you made.
          </p>
          <p className={cx(type.data, 'mt-4 text-ink-3')}>6 results · about 4 minutes · no sign-up</p>
          <div className="mt-8 lg:mt-6">
            <StartPanel />
          </div>
        </div>
        <PreviewCard />
      </section>

      <Section title="What happens">
        <ol className="grid gap-6 sm:gap-7">
          <Step n={1} title="Make six calls.">
            No feedback until the end.
          </Step>
          <Step n={2} title="See the flip.">
            One line on every result was chosen for you. You’ll see what it was, and what the other half saw.
          </Step>
          <Step n={3} title="Take the rules to your team.">
            A six-step checklist for real experiment reviews.
          </Step>
        </ol>
      </Section>

      <Section title="The six ways a good test becomes a bad decision">
        {/* Unlinked: no spoilers about which result is which (25 §3 item 5). */}
        <ul className="grid border-t border-line-1 sm:grid-cols-2 sm:gap-x-12">
          {TRAPS.map((t, i) => (
            <li
              key={t.name}
              className="flex items-baseline gap-4 border-b border-line-1 py-4 font-display text-[22px] leading-7 sm:text-[26px] sm:leading-8"
            >
              <span className={cx(type.data, 'w-6 shrink-0 text-ink-3')} aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              {t.name}
            </li>
          ))}
        </ul>
      </Section>
    </>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={cx(page, 'mt-16 sm:mt-24')} aria-labelledby={slug(title)}>
      <h2 className={cx(type.eyebrow, 'mb-6')} id={slug(title)}>
        {title}
      </h2>
      {children}
    </section>
  )
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '')

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="grid max-w-[46rem] grid-cols-[2.5rem_1fr] items-baseline sm:grid-cols-[3.5rem_1fr]">
      <span className="font-display text-[32px] leading-none text-ink-3 sm:text-[44px]" aria-hidden="true">
        {n}
      </span>
      <p className="text-[20px] leading-[30px] text-ink-2 sm:text-[24px] sm:leading-[34px]">
        <strong className="font-semibold text-ink-1">{title}</strong> {children}
      </p>
    </li>
  )
}

// ---------------- Start ----------------

/**
 * The CTA follows the stored state (25 §3 table, 34 §4.5): Start with consent, Continue, or practice only.
 * A Start that Flagsmith does not enrol stays on this page and says why before anything is played.
 */
export function StartPanel() {
  const { state, preparing, start, setPracticeReason } = useStudy()
  const navigate = useNavigate()
  const [refused, setRefused] = useState<PracticeReason | null>(null)
  const primary = useRef<HTMLButtonElement>(null)
  const action = landingAction(state)

  const practise = (reason: PracticeReason) => {
    setPracticeReason(reason)
    navigate('/practice')
  }

  const onStart = async () => {
    if (preparing) return
    const out = await start()
    if (out.to === 'challenge') navigate('/challenge')
    else setRefused(out.reason)
  }

  // After a refusal the button changes under the player's focus: keep focus on it so Enter does the new thing.
  useEffect(() => {
    if (refused) primary.current?.focus()
  }, [refused])

  // Enter starts (25 §3) when nothing else has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      if (document.activeElement && document.activeElement !== document.body) return
      e.preventDefault()
      primary.current?.click()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (refused) {
    return (
      <Cta
        note={<InlineNotice text={PRACTICE_COPY[refused]} warn />}
        button={
          <button ref={primary} type="button" className={btn('primary', { blockMobile: true })} onClick={() => practise(refused)}>
            Start practice
          </button>
        }
      />
    )
  }

  switch (action.kind) {
    case 'continue':
      return (
        <Cta
          note={<p className={type.bodyS}>Your challenge is saved in this browser. Pick up where you left off.</p>}
          button={
            <button ref={primary} type="button" className={btn('primary', { blockMobile: true })} onClick={() => navigate('/challenge')}>
              Continue (Result {action.result} of 6)
            </button>
          }
          secondary={<PractiseLink onClick={() => practise('chosen')} />}
        />
      )
    case 'practice_only':
      return (
        <Cta
          note={<InlineNotice text={PRACTICE_COPY[action.reason]} warn={action.reason !== 'done'} />}
          button={
            <button ref={primary} type="button" className={btn('primary', { blockMobile: true })} onClick={() => practise(action.reason)}>
              {action.reason === 'done' ? 'Practice again' : 'Start practice'}
            </button>
          }
          secondary={
            action.reason === 'done' ? (
              <Link to="/readout/summary" className={cx(btnGhost, 'text-[15px]')}>
                See your readout →
              </Link>
            ) : undefined
          }
        />
      )
    case 'start':
      return (
        <>
          <ConsentBlock />
          <Cta
            button={
              <button
                ref={primary}
                type="button"
                className={btn('primary', { blockMobile: true })}
                onClick={onStart}
                // aria-disabled, not disabled: focus stays on the button while Flagsmith answers (≤ 4 s).
                aria-disabled={preparing || undefined}
                aria-busy={preparing || undefined}
              >
                {preparing ? (
                  <>
                    <span className={spinner} aria-hidden="true" />
                    Preparing your challenge…
                  </>
                ) : (
                  'Start the challenge'
                )}
              </button>
            }
            secondary={<PractiseLink onClick={() => practise('chosen')} disabled={preparing} />}
            note={<p className={type.bodyS}>Starting means you’re OK with this measurement.</p>}
          />
        </>
      )
  }
}

function Cta({ button, secondary, note }: { button: ReactNode; secondary?: ReactNode; note?: ReactNode }) {
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 max-sm:flex-col max-sm:items-stretch">
        {button}
        {secondary}
      </div>
      {note}
    </div>
  )
}

function PractiseLink({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      className={cx(btnGhost, 'h-11 text-[15px] max-sm:self-center')}
      onClick={disabled ? undefined : onClick}
      aria-disabled={disabled || undefined}
    >
      Practise without being measured →
    </button>
  )
}

function InlineNotice({ text, warn }: { text: string | null; warn?: boolean }) {
  if (!text) return null
  return (
    <p className={notice(warn)} role="status">
      {text}
    </p>
  )
}

/** 34 §4.2, final copy. Always visible above Start, never collapsed. */
export function ConsentBlock() {
  return (
    <div className="mb-6 rounded-card border border-line-2 bg-bg-1 p-5 text-[15px] leading-6 text-ink-2" id="study">
      <p>
        <strong className="font-semibold text-ink-1">Before you start.</strong> This challenge is also a study run with
        Flagsmith. Start creates a random ID stored in this browser that links what you see to your calls. No name, email
        or account. It records:
      </p>
      <ul className="mt-3 grid gap-1 pl-5 lg:gap-0.5 marker:text-ink-3 [list-style:disc]">
        {RECORDED_PLAIN.map((x, i) => (
          <li key={x}>
            {x}
            {i < RECORDED_PLAIN.length - 1 ? ';' : '.'}
          </li>
        ))}
      </ul>
      <p className="mt-3">
        Nothing else. Flagsmith also gets standard request data, such as your IP address. Clearing site data or another
        browser gives a new ID. Practice sends nothing. What we’re testing is explained after you finish.{' '}
        <Link to="/about#privacy" className={link}>
          Full details
        </Link>
      </p>
    </div>
  )
}

// ---------------- Preview ----------------

/** A fictional card that is not one of the six, with no inference row and inert choices (25 §3 item 3). */
function PreviewCard() {
  return (
    <figure className="lg:col-span-6 lg:col-start-7">
      <ResultCard
        model={{ ...PREVIEW_SCENARIO, id: 'preview' }}
        framing={null}
        label="Example result (fictional)"
        footer={
          <div className="mt-5 border-t border-line-1 pt-5">
            <p className={cx(type.eyebrow, 'mb-2')}>Your call</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {CALLS.map((c, i) => (
                <li
                  key={c}
                  aria-disabled="true"
                  className="flex min-h-14 items-center gap-3 rounded-control border border-line-2 px-4 text-[16px] font-medium leading-[22px] text-ink-2"
                >
                  <span
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-chip border border-line-3 font-mono text-[12px] text-ink-3"
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  {CALL_LABEL[c]}
                </li>
              ))}
            </ul>
          </div>
        }
      />
      <figcaption className={cx(type.bodyS, 'mt-3')}>Fictional result. You’ll see six like this.</figcaption>
    </figure>
  )
}
