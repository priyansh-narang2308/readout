// Dev-only: every DecisionBar state, inside a card surface, with the real component and styles.
import { createRoot } from 'react-dom/client'
import { useEffect, useRef } from 'react'
import '../src/styles/index.css'
import { DecisionBar } from '../src/components/decision/DecisionBar'
import { cx, type } from '../src/components/ui/classes'
import type { Call } from '../src/content/scenarios.v1'

function State({ label, selected, locked, focus }: { label: string; selected: Call | null; locked?: boolean; focus?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (focus) ref.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus()
  }, [focus])
  return (
    <div ref={ref} className="mb-8">
      <p className={cx(type.eyebrow, 'mb-2')}>{label}</p>
      <div className="relative w-full max-w-card rounded-card border border-line-2 bg-bg-1 px-6 pt-0 pb-6 sm:px-7">
        <DecisionBar name={label} selected={selected} onSelect={() => {}} onLock={() => {}} locked={locked} />
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <main className="mx-auto w-full max-w-[800px] px-(--gutter) py-8 [--gutter:16px] sm:[--gutter:32px] lg:[--gutter:48px]">
    <State label="Default · nothing selected" selected={null} />
    <State label="Selected · Keep collecting" selected="collecting" />
    <State label="Locked · Don't trust (after lock)" selected="distrust" locked />
    <State label="Keyboard focus on the selected option" selected="ship" focus />
  </main>,
)
