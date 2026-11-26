/**
 * The team drill (25 §9, 26 §8.8–8.9). No accounts, no rooms, no server.
 * `/team` is the facilitation guide; `/team/present` shows the six results on a shared screen. The presenter view
 * never talks to Flagsmith and tracks nothing: it is a teaching surface, not part of the study.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ResultCard } from '../components/result/ResultCard'
import { CopyButton, FramingToggle, usePageTitle } from '../components/site/Site'
import { btn, btnGhost, cx, kbd, link, notice, page, srOnly, type } from '../components/ui/classes'
import { REVIEW_TEMPLATE, RULES, rulesMarkdown } from '../content/rules'
import { CALLS, CALL_LABEL, MEASURED_ORDER, SCENARIOS, type Framing } from '../content/scenarios.v1'
import { TEAM_PRIVACY_NOTE, TEAM_STEPS, inviteMessage, teamInviteUrl } from '../content/team'
import { trackRulesCopied } from '../flagsmith/measurement'
import { useStudy } from '../run/StudyContext'

// ---------------- /team ----------------

export function TeamRoute() {
  usePageTitle('Run it with your team')
  const origin = window.location.origin
  const url = teamInviteUrl(origin)

  return (
    <div className={cx(page, 'pt-10 pb-16 sm:pt-16 print:py-0')}>
      <div className="mx-auto max-w-read">
        <p className={type.eyebrow}>Team drill · 30 minutes · no accounts</p>
        <h1 className={cx(type.displayL, 'mt-3')}>Run it with your team</h1>
        <p className={cx(type.bodyL, 'mt-4')}>
          Everyone plays alone, then you walk the six results together on one screen and leave with rules for your next real
          experiment review.
        </p>

        <section className="mt-10 rounded-card border border-line-2 bg-bg-1 p-5 print:mt-6 print:p-4" aria-labelledby="invite-h">
          <h2 className={type.eyebrow} id="invite-h">
            1 · Send the invite
          </h2>
          <p className={cx(type.data, 'mt-3 break-all text-ink-1')} data-invite-url>
            {url}
          </p>
          <div className="mt-4 flex flex-wrap gap-3 print:hidden">
            <CopyButton text={inviteMessage(origin)} label="Copy invite message" primary />
            <CopyButton text={url} label="Copy link only" />
          </div>
        </section>

        <section className="mt-12 print:mt-6" aria-labelledby="plan-h">
          <h2 className={cx(type.titleM, 'mb-4')} id="plan-h">
            The 30 minutes
          </h2>
          {/* Desktop: a table. Phones: minute blocks (26 §8.8 item 11). One is displayed at a time. */}
          <table className="w-full border-collapse text-left text-[15px] leading-6 max-sm:hidden">
            <thead>
              <tr className={cx(type.eyebrow, 'border-b border-line-2')}>
                <th scope="col" className="w-20 py-2 pr-4 font-medium">Minutes</th>
                <th scope="col" className="w-44 py-2 pr-4 font-medium">Step</th>
                <th scope="col" className="py-2 font-medium">What to say or do</th>
              </tr>
            </thead>
            <tbody>
              {TEAM_STEPS.map((s) => (
                <tr key={s.step} className="border-b border-line-1 align-top">
                  <td className={cx(type.data, 'py-4 pr-4 text-ink-3 print:py-2')}>{s.minutes}</td>
                  <th scope="row" className="py-4 pr-4 font-semibold text-ink-1 print:py-2">
                    {s.step}
                  </th>
                  <td className="py-4 text-ink-2 print:py-2">{s.script(url)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ol className="grid gap-3 sm:hidden">
            {TEAM_STEPS.map((s) => (
              <li key={s.step} className="rounded-card border border-line-2 bg-bg-1 px-4 py-3">
                <p className="text-[16px] leading-6 font-semibold text-ink-1">
                  <span className={cx(type.data, 'mr-2 text-ink-3')}>{s.minutes} min</span>
                  {s.step}
                </p>
                <p className={cx(type.body, 'mt-1 break-words text-ink-2')}>{s.script(url)}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-10 print:mt-6" aria-labelledby="present-h">
          <h2 className={cx(type.eyebrow, 'mb-3')} id="present-h">
            2 · Walk the six results
          </h2>
          <Link to="/team/present" className={cx(btn('primary', { blockMobile: true }), 'print:hidden')}>
            Open presenter view →
          </Link>
          <p className={cx(type.body, 'hidden text-ink-2 print:block')} data-print-presenter>
            On the shared screen, open {origin}/team/present. Arrow keys move, F flips the inference line, R reveals the call.
          </p>
          <p className={cx(type.bodyS, 'mt-3 print:hidden')}>
            Keys on screen: <span className={kbd}>←</span> <span className={kbd}>→</span> move, <span className={kbd}>F</span> flips
            the inference line, <span className={kbd}>R</span> reveals the call, <span className={kbd}>Esc</span> comes back here.
          </p>
        </section>

        <section className="mt-10 print:mt-6" aria-labelledby="adopt-h">
          <h2 className={cx(type.eyebrow, 'mb-3')} id="adopt-h">
            3 · Adopt the rules
          </h2>
          <p className={cx(type.body, 'text-ink-2')}>
            Paste both into your team’s experiment docs or the pull request for your next experiment. Agree your bar for rule
            6 before anyone looks at a result.
          </p>
          <div className="mt-4 flex flex-wrap gap-3 print:hidden">
            <CopyButton text={rulesMarkdown()} label="Copy the Rules" onCopied={() => void trackRulesCopied()} />
            <CopyButton text={REVIEW_TEMPLATE} label="Copy review template" />
          </div>
          <p className={cx(type.bodyS, 'mt-3 print:hidden')}>
            Or read them first on the{' '}
            <Link to="/rules" className={link}>
              Rules page
            </Link>
            .
          </p>
        </section>

        <p className={cx(notice(), 'mt-12 print:mt-6')} data-team-privacy>
          {TEAM_PRIVACY_NOTE}
        </p>
        <button type="button" className={cx(btnGhost, 'mt-6 h-11 text-[15px] print:hidden')} onClick={() => window.print()}>
          Print this guide
        </button>
      </div>
    </div>
  )
}

// ---------------- /team/present ----------------

const MAX_SCALE = 1.4
const MIN_STAGE_WIDTH = 768 // below this the stage scrolls at 1× instead of shrinking to fit

/**
 * Scales the stage contents to fill the screen, up to 1.4× (26 §8.9). transform, not zoom: offsetWidth/Height stay
 * the natural size, so the fit is computed from the unscaled layout.
 */
function useFitScale(stage: React.RefObject<HTMLElement>, inner: React.RefObject<HTMLElement>) {
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const s = stage.current
    const c = inner.current
    if (!s || !c || typeof ResizeObserver === 'undefined') return
    const fit = () => {
      const w = c.offsetWidth
      const h = c.offsetHeight
      if (!w || !h || s.clientWidth < MIN_STAGE_WIDTH) return setScale(1)
      setScale(Math.max(0.5, Math.min(MAX_SCALE, (s.clientWidth - 32) / w, (s.clientHeight - 32) / h)))
    }
    const ro = new ResizeObserver(fit)
    ro.observe(s)
    ro.observe(c)
    fit()
    return () => ro.disconnect()
  }, [stage, inner])
  return scale
}

export function PresenterRoute() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const raw = Number(params.get('r'))
  const n = Number.isInteger(raw) && raw >= 1 && raw <= 6 ? raw : 1
  const id = MEASURED_ORDER[n - 1]!
  const s = SCENARIOS[id]
  const { defaultFraming } = useStudy()
  const [framing, setFraming] = useState<Framing>(defaultFraming.framing)
  const [revealed, setRevealed] = useState(false)
  const stage = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const scale = useFitScale(stage, inner)
  usePageTitle(`Presenter · Result ${n} of 6`)

  const go = useCallback(
    (to: number) => {
      if (to < 1 || to > 6) return
      setRevealed(false)
      setParams({ r: String(to) }, { replace: true })
    },
    [setParams],
  )
  const flip = useCallback(() => setFraming((f) => (f === 'p_value' ? 'chance_to_win' : 'p_value')), [])
  const reveal = useCallback(() => setRevealed((r) => !r), [])

  // Keys F, R, ←, →, Esc (25 §9), each mirrored by a button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.metaKey || e.ctrlKey) return
      const t = e.target instanceof HTMLElement ? e.target : null
      if (t?.closest('[role="radiogroup"]') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
      if (k === 'ArrowLeft') go(n - 1)
      else if (k === 'ArrowRight') go(n + 1)
      else if (k === 'f') flip()
      else if (k === 'r') reveal()
      else if (k === 'Escape') navigate('/team')
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [n, go, flip, reveal, navigate])

  const bar = 'h-11 rounded-control px-3 text-[14px] font-medium text-ink-2 hover:bg-bg-2 hover:text-ink-1 disabled:opacity-40 disabled:hover:bg-transparent'

  return (
    <div className="flex min-h-screen flex-col bg-bg-0 md:h-screen md:overflow-hidden" data-presenter>
      <h1 className={srOnly}>
        Presenter view, result {n} of 6: {s.title}
      </h1>
      <p className={cx(type.bodyS, 'px-4 pt-3 text-center sm:hidden')}>Best on a laptop or shared screen.</p>

      <div ref={stage} className="flex min-h-0 flex-1 items-start justify-center overflow-auto px-4 py-4 md:items-center md:overflow-hidden">
        <div className="w-full md:w-auto" style={{ transform: `scale(${scale})`, transformOrigin: 'center' }} data-scale={scale.toFixed(2)}>
          <div ref={inner} className="flex w-full flex-col gap-6 md:w-[1100px] md:flex-row md:items-start">
            <div className="min-w-0 md:w-[720px] md:shrink-0">
              <ResultCard
                key={id}
                model={s}
                framing={framing}
                animate
                annotations={revealed ? s.evidence : []}
                eyebrowRight={<FramingToggle value={framing} onChange={setFraming} compact label="Show this line as" />}
              />
            </div>
            <aside className="min-w-0 flex-1" aria-label="The calls">
              <p className={cx(type.eyebrow, 'mb-3')}>Your call? Show of fingers</p>
              <ol className="grid gap-2">
                {CALLS.map((c, i) => {
                  const key = revealed && c === s.key
                  return (
                    <li
                      key={c}
                      className={cx(
                        'flex min-h-13 items-center gap-3 rounded-control border px-4 text-[16px] leading-[22px] font-medium transition-colors duration-180',
                        key ? 'border-accent bg-accent-wash text-ink-1' : revealed ? 'border-line-1 text-ink-3' : 'border-line-2 text-ink-1',
                      )}
                      data-call={c}
                      data-key={key || undefined}
                    >
                      <span
                        className="inline-flex size-6 shrink-0 items-center justify-center rounded-chip border border-line-3 font-mono text-[12px] text-ink-3"
                        aria-hidden="true"
                      >
                        {i + 1}
                      </span>
                      {CALL_LABEL[c]}
                      {key && <span className={cx(type.eyebrow, 'ml-auto text-accent')}>Defensible</span>}
                    </li>
                  )
                })}
              </ol>
              <div className={cx('mt-6 transition-opacity duration-240', revealed ? 'opacity-100' : 'opacity-0')} aria-hidden={!revealed || undefined}>
                <p className={type.eyebrow}>The trap</p>
                <p className="mt-1 text-[20px] leading-7 font-semibold text-ink-1">{s.trap.name}</p>
                <p className={cx(type.body, 'mt-1 text-ink-2')}>{s.trap.oneLiner}</p>
                <p className={cx(type.body, 'mt-3 text-ink-1')} data-presenter-rule>
                  <span className="font-semibold">The rule that catches it: </span>
                  {s.rules.map((r) => `Rule ${r}, ${RULES[r - 1]!.title}`).join(' and ')}
                </p>
                <p className={cx(notice(true), 'mt-4')}>Ask the room: when have we seen this in our own launches?</p>
              </div>
            </aside>
          </div>
        </div>
      </div>

      {/* Muted until used (26 §8.9 item 6); every key has a button for touch screens and screen sharing. */}
      <nav
        aria-label="Presenter controls"
        className="sticky bottom-0 flex flex-wrap items-center justify-center gap-1 border-t border-line-1 bg-bg-0/92 px-3 py-2 opacity-70 backdrop-blur-[8px] transition-opacity duration-180 focus-within:opacity-100 hover:opacity-100"
      >
        <button type="button" className={bar} onClick={() => go(n - 1)} disabled={n === 1} aria-label="Previous result">
          ← <span className={kbd} aria-hidden="true">←</span>
        </button>
        <span className={cx(type.data, 'px-3 text-ink-2')} aria-live="polite" data-position>
          Result {n} of 6
        </span>
        <button type="button" className={bar} onClick={() => go(n + 1)} disabled={n === 6} aria-label="Next result">
          → <span className={kbd} aria-hidden="true">→</span>
        </button>
        <span className="mx-2 h-5 w-px bg-line-2" aria-hidden="true" />
        <button type="button" className={bar} onClick={flip}>
          Flip <span className={kbd}>F</span>
        </button>
        <button type="button" className={bar} onClick={reveal} aria-pressed={revealed}>
          {revealed ? 'Hide' : 'Reveal'} <span className={kbd}>R</span>
        </button>
        <span className="mx-2 h-5 w-px bg-line-2" aria-hidden="true" />
        <Link to="/team" className={cx(bar, 'inline-flex items-center gap-2 no-underline')}>
          Exit <span className={kbd}>Esc</span>
        </Link>
      </nav>
      <p className={srOnly} aria-live="polite" data-announce>
        {revealed ? `Defensible call: ${CALL_LABEL[s.key]}. The trap: ${s.trap.name}. ${s.rules.map((r) => `Rule ${r}`).join(' and ')}.` : ''}
      </p>
    </div>
  )
}
