// Dev-only: site header, footer, env tag, practice badge, progress rule, framing toggle and copy button states,
// rendered with the real components and styles. Writes measurements to <body data-measure> for headless checks.
import { createRoot } from 'react-dom/client'
import { useEffect, useRef, useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import '../src/styles/index.css'
import { CopyButton, FramingToggle, PracticeBadge, ProgressRule, SiteLayout } from '../src/components/site/Site'
import { cx, page, type } from '../src/components/ui/classes'
import type { Framing } from '../src/content/scenarios.v1'

// Hold the "Copied" state on screen for the capture (the real component reverts after 1.6 s).
const realTimeout = window.setTimeout.bind(window)
window.setTimeout = ((fn: TimerHandler, ms?: number, ...a: unknown[]) =>
  ms === 1600 ? 0 : realTimeout(fn, ms, ...a)) as typeof window.setTimeout

function Toggle({ compact, initial }: { compact?: boolean; initial: Framing }) {
  const [v, setV] = useState<Framing>(initial)
  return <FramingToggle value={v} onChange={setV} compact={compact} label="Show this line as" />
}

function CopyDemo({ mode }: { mode: 'idle' | 'ok' | 'blocked' }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (mode === 'idle') return
    const t = realTimeout(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => (mode === 'ok' ? Promise.resolve() : Promise.reject(new Error('blocked'))) },
      })
      ref.current?.querySelector('button')?.click()
    }, mode === 'ok' ? 50 : 300)
    return () => clearTimeout(t)
  }, [mode])
  return (
    <div ref={ref}>
      <CopyButton
        text={'## Readout Rules\n- [ ] 1. Check the split before the result\n- [ ] 2. Read the interval, not the verdict'}
        label={mode === 'blocked' ? 'Copy share text' : 'Copy as Markdown'}
        primary={mode !== 'blocked'}
      />
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-7">
      <p className={cx(type.eyebrow, 'mb-2')}>{label}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  )
}

function App() {
  useEffect(() => {
    const t = realTimeout(() => {
      const nav = document.querySelector('nav[aria-label="Main"]') as HTMLElement
      const h = nav.parentElement as HTMLElement
      const doc = document.documentElement
      document.body.dataset.measure = JSON.stringify({
        vw: doc.clientWidth,
        scrollW: doc.scrollWidth,
        headerH: h.getBoundingClientRect().height,
        navRight: Math.round(nav.getBoundingClientRect().right),
        navLinkH: (nav.querySelector('a') as HTMLElement).getBoundingClientRect().height,
        copied: document.querySelectorAll('[data-state="copied"]').length,
        failed: document.querySelectorAll('[data-state="failed"]').length,
        focusIn: document.activeElement?.tagName,
      })
    }, 900)
    return () => clearTimeout(t)
  }, [])
  return (
    <MemoryRouter initialEntries={['/rules']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <SiteLayout>
        <div className={cx(page, 'py-8')}>
          <Row label="Framing toggle · full">
            <Toggle initial="p_value" />
            <Toggle initial="chance_to_win" />
          </Row>
          <Row label="Framing toggle · compact (card header)">
            <Toggle compact initial="p_value" />
            <Toggle compact initial="chance_to_win" />
          </Row>
          <Row label="Progress rule · result 1, 3, finished">
            <ProgressRule current={0} done={0} />
            <ProgressRule current={2} done={2} />
            <ProgressRule current={6} done={6} />
          </Row>
          <Row label="Practice badge">
            <PracticeBadge />
          </Row>
          <Row label="Copy · idle">
            <CopyDemo mode="idle" />
          </Row>
          <Row label="Copy · copied">
            <CopyDemo mode="ok" />
          </Row>
          <Row label="Copy · clipboard blocked">
            <CopyDemo mode="blocked" />
          </Row>
        </div>
      </SiteLayout>
    </MemoryRouter>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
