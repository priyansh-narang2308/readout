// Dev-only: every measured card in both arms, rendered with the real components. ?only=S4&arm=chance_to_win narrows it.
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../src/styles/index.css'
import { DecisionBar } from '../src/components/decision/DecisionBar'
import { ResultCard } from '../src/components/result/ResultCard'
import { cx, page, type } from '../src/components/ui/classes'
import { MEASURED_ORDER, SCENARIOS, type Call, type Framing, type ScenarioId } from '../src/content/scenarios.v1'

const q = new URLSearchParams(location.search)
const ids = (q.get('only')?.split(',') as ScenarioId[] | undefined) ?? MEASURED_ORDER
const arms = (q.get('arm')?.split(',') as Framing[] | undefined) ?? (['p_value', 'chance_to_win'] as Framing[])
// ?density=compact renders the compact card; ?evidence=1 turns on every evidence annotation (debrief styling).
const density = q.get('density') === 'compact' ? 'compact' : 'full'
const evidence = q.get('evidence') === '1'
const ANNOTATIONS = (['checks', 'split', 'arms', 'lift', 'interval', 'guardrail'] as const).map((target) => ({
  target,
  callout: `Look here: ${target}`,
}))

function Card({ id, framing }: { id: ScenarioId; framing: Framing }) {
  const [sel, setSel] = useState<Call | null>(id === 'S1' ? 'ship' : null)
  return (
    <ResultCard
      model={SCENARIOS[id]}
      framing={framing}
      density={density}
      annotations={evidence ? ANNOTATIONS : []}
      footer={density === 'compact' ? undefined : <DecisionBar name={`${id}-${framing}`} selected={sel} onSelect={setSel} onLock={() => {}} />}
    />
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main className={cx(page, 'py-8')}>
      {ids.map((id) => (
        <section key={id} className="mb-12 grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-6">
          {arms.map((f) => (
            <div key={f}>
              <p className={cx(type.eyebrow, 'mb-2')}>{id} · arm {f}</p>
              <Card id={id} framing={f} />
            </div>
          ))}
        </section>
      ))}
    </main>
  </StrictMode>,
)

// ?measure=1: write each card's rendered height into the DOM (read with --dump-dom).
if (q.get('measure') === '1') {
  setTimeout(() => {
    const rows = [...document.querySelectorAll<HTMLElement>('section[data-density]')].map(
      (el) => {
        const r = el.getBoundingClientRect()
        const lock = el.querySelector('[data-lock]')?.getBoundingClientRect()
        return `${el.dataset.scenario}:w${Math.round(r.width)}:h${Math.round(r.height)}:lockBottom${lock ? Math.round(lock.bottom - r.top) : 'none'}`
      },
    )
    document.body.setAttribute('data-heights', rows.join(' '))
  }, 1500)
}
