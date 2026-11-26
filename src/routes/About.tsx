/**
 * About (25 §10, 26 §8.11, 34 §4.3–4.4): what Readout is, privacy, the study, how Flagsmith is used, how the result
 * will be reported (upgrade B), the numbers, and the limits.
 *
 * Spoiler guard: the consent block promises "What we're testing is explained after you finish" (34 §4.2). Knowing the
 * hypothesis before playing would change how a player reads the cards, so the study details stay folded until this
 * browser has finished a run (measured or practice). Anyone can still open them; nothing is hidden, only folded.
 */
import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { inferenceText } from '../components/result/ResultCard'
import { repoUrl, usePageTitle } from '../components/site/Site'
import { cx, link, notice, page, type } from '../components/ui/classes'
import { OUTCOMES } from '../content/outcomes'
import { DISCLOSED_EVENTS, EVENT_PURPOSE, DISCLOSED_METADATA, RECORDED_PLAIN, SDK_METADATA } from '../content/privacy'
import { RULES } from '../content/rules'
import { analyse } from '../content/analysis'
import { SCENARIOS } from '../content/scenarios.v1'
import { readPractice } from '../run/attemptStore'
import { useStudy } from '../run/StudyContext'

const DOCS = {
  experimentation: 'https://docs.flagsmith.com/experimentation/',
  statistics: 'https://docs.flagsmith.com/experimentation/statistics',
} as const

const SECTIONS = [
  { id: 'privacy', label: 'Privacy' },
  { id: 'study', label: 'The study' },
  { id: 'flagsmith', label: 'How Flagsmith is used' },
  { id: 'numbers', label: 'The numbers' },
  { id: 'limits', label: 'Limitations' },
] as const

/** Opens in a new tab and says so (26 §8.11 item 12). */
function External({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={link}>
      {children}
      <span aria-hidden="true"> ↗</span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mt-14 scroll-mt-24" aria-labelledby={`${id}-h`}>
      <h2 className={cx(type.titleL, 'mb-4')} id={`${id}-h`}>
        {title}
      </h2>
      <div className={cx(type.body, 'grid gap-4 text-ink-2')}>{children}</div>
    </section>
  )
}

const code = 'font-mono text-[0.92em] text-ink-1'

// The example in "The two versions": one real card's line in both framings, computed, never typed in.
const EX_METRIC = analyse(SCENARIOS.S5).primary
const EX_P = inferenceText('p_value', EX_METRIC)
const EX_C = inferenceText('chance_to_win', EX_METRIC)

/** Has this browser finished a run, so the reveal is no longer a spoiler? */
function usePlayed(): boolean {
  const { state, practiceRun } = useStudy()
  return useMemo(() => state.kind === 'finished' || practiceRun !== null || readPractice() !== null, [state, practiceRun])
}

export function AboutRoute() {
  usePageTitle('About Readout')
  const played = usePlayed()
  const repo = repoUrl()

  return (
    <div className={cx(page, 'pt-10 pb-16 sm:pt-16')}>
      <div className="mx-auto max-w-read">
        <p className={type.eyebrow}>About</p>
        <h1 className={cx(type.displayL, 'mt-3')}>What Readout is</h1>
        <p className={cx(type.bodyL, 'mt-4')}>
          Readout is a four-minute training lab for reading A/B test results. You make the call on six realistic, fictional
          results, then see which reading mistakes you made and take six rules back to your team. It is also a real
          experiment, run with Flagsmith, on how results should be presented.
        </p>

        <nav aria-label="On this page" className="mt-8 border-y border-line-1 py-4">
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-[15px]">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className={link}>
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <Section id="privacy" title="Privacy">
          <p>
            Pressing <strong className="font-semibold text-ink-1">Start the challenge</strong> creates a random ID in
            this browser’s localStorage. No name, email or account is needed, and Readout never asks. It records:
          </p>
          <ul className="grid gap-1 pl-5 [list-style:disc] marker:text-ink-3">
            {RECORDED_PLAIN.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <p>
            The ID doesn’t name you, but it is not anonymous: it ties what you were shown to your calls, and Flagsmith receives
            these events with the standard information any web request carries, such as your IP address. Flagsmith, which
            runs the experiment, is the only service that receives them: no cookies of our own, no separate analytics
            service and no ad pixels. Practice runs send nothing at all. The ID stays until you clear this site’s data;
            another browser or device gets a different one.{' '}
            <strong className="font-semibold text-ink-1">Clear your site data to remove the ID.</strong>
          </p>
          <div className="grid gap-3 rounded-card border border-line-2 bg-bg-1 p-5" data-disclosed>
            <p className={type.eyebrow}>Exactly what is sent</p>
            <p>Events, and what each one is for:</p>
            <ul className="grid gap-1 pl-5 [list-style:disc] marker:text-ink-3" data-event-purposes>
              {DISCLOSED_EVENTS.map((e) => (
                <li key={e}>
                  <code className={code}>{e}</code>
                  {e === '$flag_exposure' && <> (feature <code className={code}>readout_framing</code>, value = the version shown)</>}:{' '}
                  {EVENT_PURPOSE[e]}.
                </li>
              ))}
            </ul>
            <p>
              Metadata on each event:{' '}
              {DISCLOSED_METADATA.map((m, i) => (
                <span key={m}>
                  {i > 0 && ', '}
                  <code className={code}>{m}</code>
                </span>
              ))}
              . Added by the Flagsmith SDK itself:{' '}
              {SDK_METADATA.map((m, i) => (
                <span key={m}>
                  {i > 0 && ' and '}
                  <code className={code}>{m}</code>
                </span>
              ))}
              .
            </p>
            <p className={type.bodyS}>A test checks that the app sends exactly this list and nothing else.</p>
          </div>
        </Section>

        <Section id="study" title="The study">
          <details className="group rounded-card border border-line-2 bg-bg-1" open={played || undefined} data-spoiler>
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-5 py-3 text-[15px] font-medium text-ink-1 [&::-webkit-details-marker]:hidden">
              <span aria-hidden="true" className="text-ink-3 transition-transform duration-180 group-open:rotate-90 motion-reduce:transition-none">
                ›
              </span>
              {played ? 'What we’re testing' : 'Show what we’re testing (spoiler)'}
            </summary>
            <div className="grid gap-4 border-t border-line-1 px-5 py-5">
              {!played && (
                <p className={notice(true)}>
                  <span>
                    Haven’t played yet? This spoils it: knowing what’s tested changes how you read the results.{' '}
                    <Link to="/" className={link}>
                      Play first
                    </Link>
                    ; it takes four minutes.
                  </span>
                </p>
              )}
              <p>
                <strong className="font-semibold text-ink-1">The question.</strong> When developers read an experiment result,
                do they make more correct calls when the evidence is shown as <em>chance to beat control</em> (Flagsmith’s
                framing) than as a <em>p-value</em>?
              </p>
              <p>
                <strong className="font-semibold text-ink-1">The hypothesis, written down before launch.</strong> Showing
                “chance to beat control” instead of a p-value raises the average score per player, without fewer people
                finishing.
              </p>
              <p>
                <strong className="font-semibold text-ink-1">The two versions.</strong> Every result card is identical in both,
                down to the pixel, except one line. Half of players see “{EX_P.label} · {EX_P.value}”, the other half “
                {EX_C.label} · {EX_C.value}” for the same numbers. Which half you’re in is decided by Flagsmith, not by Readout.
              </p>
              <div>
                <p className="font-semibold text-ink-1">What is measured</p>
                <ul className="mt-2 grid gap-1 pl-5 [list-style:disc] marker:text-ink-3">
                  <li>Main: the average score out of six, per player (unfinished counts as zero).</li>
                  <li>Guardrail: the share of players who finish all six.</li>
                  <li>Guardrail: the share who keep collecting on the promising-but-unfinished result (an “86%” can sound like a win).</li>
                  <li>Secondary: the share who keep the control on the significant loss (a p-value has no direction).</li>
                  <li>Exploratory: the share who copy the Rules afterwards.</li>
                </ul>
              </div>
              <p>
                The full plan is committed before the study starts
                {repo ? (
                  <>
                    {' '}
                    in <External href={`${repo}/blob/main/EXPERIMENT.md`}>EXPERIMENT.md</External>
                  </>
                ) : (
                  ' (the link appears here once the repository is public)'
                )}
                . Results will appear in the README as screenshots from the Flagsmith console, with the time they were taken.
              </p>

              <div id="outcomes" className="mt-2 scroll-mt-24">
                <p className="font-semibold text-ink-1">How the result will be reported, decided before any data</p>
                <p className="mt-1">
                  Read top to bottom; the first that applies is what we report. It is the Readout Rules, applied to Readout.
                </p>
                <ol className="mt-4 grid gap-3" data-outcomes>
                  {OUTCOMES.map((o) => (
                    <li key={o.id} className="rounded-control border border-line-2 bg-bg-0 px-4 py-3">
                      <p className={cx(type.data, 'text-ink-3')}>
                        Rule {o.rule} · {RULES[o.rule - 1]!.title}
                      </p>
                      <p className="mt-1 text-ink-1">{o.when}</p>
                      <p className="mt-1">
                        <span className="font-semibold text-accent">→ {o.decision}</span> {o.wording}
                      </p>
                    </li>
                  ))}
                </ol>
                <p className={cx(type.bodyS, 'mt-3')}>
                  Whatever happens, the result is a pilot at the stated sample: never “proven”, never “users prefer”, and no
                  guardrail is called “safe”.
                </p>
              </div>
            </div>
          </details>
        </Section>

        <Section id="flagsmith" title="How Flagsmith is used">
          <p>
            One multivariate feature flag, <code className={code}>readout_framing</code>, decides which version of one line
            every result card shows. Flagsmith splits random browser IDs 50/50 between its two variants (the control and one
            alternative, described under “The study”), and the app branches on the variant, never on the displayed text.
          </p>
          <p>
            A Flagsmith experiment on that flag owns the split. When your first result card renders, the SDK’s{' '}
            <code className={code}>useExperiment</code> records the exposure; when you lock in your sixth call, four
            conversion events are sent. Flagsmith computes the statistics from those events. If the
            study isn’t running or Flagsmith can’t be reached, the run is labelled practice and nothing is sent.
          </p>
          <p>
            After the study ends, the outcome is rolled out with the same flag: the better version, or the control if it’s inconclusive.
            Read more in the <External href={DOCS.experimentation}>Flagsmith experimentation docs</External>.
          </p>
        </Section>

        <Section id="numbers" title="The numbers">
          <p>
            All six results are fictional teaching scenarios. Every figure on them is computed from raw counts with the same
            formulas as <External href={DOCS.statistics}>Flagsmith’s experiment statistics</External>, and tests check it.
          </p>
          <p>
            One result’s counts (9,120 vs 6,400 users) are the ones Flagsmith uses in its own sample-ratio-mismatch example. We
            kept them on purpose: it’s a recognisable teaching case, not our invention and not real data.
            {repo && (
              <>
                {' '}
                The scenario data, with the answer key, is in{' '}
                <External href={`${repo}/blob/main/src/content/scenarios.v1.ts`}>src/content/scenarios.v1.ts</External> (it
                gives the answers away, so read it after you play).
              </>
            )}
          </p>
        </Section>

        <Section id="limits" title="Limitations">
          <ul className="grid gap-2 pl-5 [list-style:disc] marker:text-ink-3">
            <li>
              The ID belongs to this browser. Clearing site data, a private window, another browser or another device creates a
              new ID, which could be measured again. Preventing that would need accounts, which Readout won’t add.
            </li>
            <li>Ad-blockers that block Flagsmith’s events address stop measurement silently.</li>
            <li>The study can’t link an ID to a person, and never tries to.</li>
          </ul>
        </Section>
      </div>
    </div>
  )
}
