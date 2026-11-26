// Dev-only harness: the real route table (AppRoutes) in a MemoryRouter, with seeded storage and a fake Flagsmith layer.
//   ?route=/ | /challenge | /practice | /readout[/1-6|/summary] | /rules | /team[/present] | /about   which route to open (MemoryRouter)
//   ?seed=new | continue | done | void | storage | atlast | practice   stored state before render (default: leave storage as is)
//   ?calls=perfect                          seeded calls are all defensible (default: a fixed mixed set)
//   ?gate=enrolled | not-running | unavailable | slow     fake Flagsmith answer to Start (default enrolled)
//   ?deps=real                              use the real Flagsmith layer and the .env development key instead of fakes
// Fake mode never contacts Flagsmith. Real mode is the development environment only (the build refuses production here).
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { AppRoutes, ScrollManager } from '../src/app/App'
import '../src/styles/index.css'
import { cx, page, type } from '../src/components/ui/classes'
import { MEASURED_ORDER, SCENARIOS, type Call } from '../src/content/scenarios.v1'
import type { GateResult } from '../src/flagsmith/client'
import { writePractice } from '../src/run/attemptStore'
import { KEYS, lockCall, newAttempt, withStatus, writeAttempt } from '../src/run/attemptStore'
import { buildPayload, type StudyDeps } from '../src/run/controller'
import { realDeps, StudyProvider, useStudy } from '../src/run/StudyContext'
import { flagsmith } from '../src/flagsmith/client'

const q = new URLSearchParams(location.search)
const UID = '11111111-2222-4333-8444-555555555555'
const CALLS6: Call[] =
  q.get('calls') === 'perfect' ? MEASURED_ORDER.map((id) => SCENARIOS[id].key) : ['ship', 'control', 'collecting', 'distrust', 'ship', 'control']

function seed(kind: string | null) {
  if (!kind) return
  localStorage.clear()
  if (kind === 'new' || kind === 'storage') return
  localStorage.setItem(KEYS.uid, UID)
  if (kind === 'void') return localStorage.setItem(KEYS.attempt, '{"broken":true}')
  if (kind === 'practice') {
    writePractice({ order: MEASURED_ORDER, answers: Object.fromEntries(MEASURED_ORDER.map((id, i) => [id, CALLS6[i]!])), finishedAt: new Date().toISOString(), framing: 'p_value' })
    return
  }
  let a = newAttempt({ uid: UID, variant: q.get('variant') === 'control' ? 'control' : 'chance_to_win', experimentId: 42, envName: 'development' })
  const n = kind === 'continue' ? 2 : kind === 'atlast' ? 5 : kind.startsWith('at') ? Number(kind.slice(2)) : 6
  for (let i = 0; i < n; i++) a = lockCall(a, MEASURED_ORDER[i]!, CALLS6[i]!, 9000)
  if (kind === 'done') {
    a = withStatus(a, 'scored_pending', { scoredAt: new Date().toISOString(), payload: buildPayload(a, null) })
    a = withStatus(a, 'sent_1', { delivery: { send1: 'ok' } })
  }
  writeAttempt(a)
}
seed(q.get('seed'))

const GATES: Record<string, GateResult> = {
  enrolled: { enrolled: true, variant: 'chance_to_win', experimentId: 42, experimentName: 'readout framing', value: 'chance_to_win' },
  'not-running': { enrolled: false, reason: 'not-in-experiment' },
  unavailable: { enrolled: false, reason: 'timeout' },
}

function fakeDeps(): StudyDeps {
  const gate = q.get('gate') ?? 'enrolled'
  return {
    enrol: (uid) => {
      console.info('[fake] enrol', uid)
      return new Promise((r) => setTimeout(() => r(GATES[gate === 'slow' ? 'enrolled' : gate]!), gate === 'slow' ? 60000 : 400))
    },
    init: async () => undefined,
    sendScores: async () => 'sent',
    resend: async () => 'none',
    envName: () => 'development',
    storageOk: () => q.get('seed') !== 'storage',
  }
}

function Where() {
  const loc = useLocation()
  const { gate, state } = useStudy()
  const src = flagsmith.loadingState?.source
  return (
    <p className={cx(page, type.bodyS, 'py-2 font-mono')} data-route={loc.pathname}>
      dev harness · route {loc.pathname} · deps {q.get('deps') === 'real' ? 'REAL (development)' : 'fake'} · state {state.kind} · gate{' '}
      <span data-gate>{gate ? JSON.stringify(gate) : 'none'}</span> · sdk source {String(src ?? 'n/a')}
    </p>
  )
}

const deps = q.get('deps') === 'real' ? realDeps(true) : fakeDeps()

createRoot(document.getElementById('root')!).render(
  <MemoryRouter initialEntries={[q.get('route') ?? '/']}>
    <StudyProvider deps={deps}>
      <ScrollManager />
      <AppRoutes />
      <Where />
    </StudyProvider>
  </MemoryRouter>,
)

// Optional auto-press for headless captures: ?press=start presses Start after load.
if (q.get('press') === 'start') {
  setTimeout(() => (Array.from(document.querySelectorAll('button')).find((b) => /Start the challenge/.test(b.textContent ?? '')) as HTMLButtonElement | undefined)?.click(), 300)
}

// Measurements for headless checks: card and Lock-in bottoms in viewport pixels.
setTimeout(() => {
  const card = document.querySelector('section[data-scenario]')?.getBoundingClientRect()
  const lockBtn = document.querySelector('[data-lock]')?.getBoundingClientRect()
  document.body.dataset.measure = JSON.stringify({ scenario: document.querySelector('section[data-scenario]')?.getAttribute('data-scenario'), cardTop: card?.top, cardBottom: card?.bottom, lockBottom: lockBtn?.bottom, vh: innerHeight })
}, 1500)

// Flip timeline for headless checks (?debug=flip): when each line swaps, is outlined, and is mid-rotation.
if (q.get('debug') === 'flip') {
  const t0 = performance.now()
  const log: [number, string][] = []
  const iv = setInterval(() => {
    const ps = [...document.querySelectorAll<HTMLElement>('[data-inference]')]
    const row = ps
      .map((p) => {
        const tr = getComputedStyle(p).transform
        const rot = tr !== 'none' && tr !== 'matrix(1, 0, 0, 1, 0, 0)' ? 'r' : ''
        const flash = p.parentElement!.className.includes('shadow-[0_0_0_1px') ? '*' : ''
        return (p.dataset.inference === 'p_value' ? 'P' : 'c') + flash + rot
      })
      .join(' ')
    if (!log.length || log[log.length - 1]![1] !== row) log.push([Math.round(performance.now() - t0), row])
    document.body.dataset.flip = JSON.stringify(log)
  }, 15)
  setTimeout(() => clearInterval(iv), 4000)
}

// Arm geometry for headless checks (?geom=1, used by dev/check-arm-geometry.mjs): the layout box of every HTML element
// on the page, except what is inside [data-inference] (the line's own box IS included). Both arms must match.
if (q.get('geom')) {
  const snap = () =>
    [...document.body.querySelectorAll<HTMLElement>('*')]
      .filter((el) => el instanceof HTMLElement)
      .filter((el) => !el.closest('[data-inference]') || el.hasAttribute('data-inference'))
      .map((el) => {
        // Layout box (offsets): what the page occupies once settled, independent of any running transform animation.
        let x = 0
        let y = 0
        for (let e: HTMLElement | null = el; e; e = e.offsetParent as HTMLElement | null) {
          x += e.offsetLeft
          y += e.offsetTop
        }
        const tag = el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (el.hasAttribute('data-inference') ? '[inf]' : '')
        // The line and its wrapper are sized by their text, which is the manipulation: their width may differ, their
        // position and height (a wrap would change it and push everything below) may not.
        const own = el.hasAttribute('data-inference') || el.querySelector(':scope > [data-inference]') !== null
        return `${tag} ${x},${y},${own ? 'text' : el.offsetWidth},${el.offsetHeight}`
      })
  // Fonts first, then the same layout three snapshots running (animations and font swaps settled).
  const faces = ['500 16px Newsreader', '400 16px "IBM Plex Sans"', '500 16px "IBM Plex Sans"', '600 16px "IBM Plex Sans"', '400 16px "IBM Plex Mono"', '500 16px "IBM Plex Mono"']
  void Promise.all(faces.map((f) => document.fonts.load(f))).then(() => document.fonts.ready).then(() => {
    let last = ''
    let same = 0
    const iv = setInterval(() => {
      // Not before the stylesheet is live (Vite applies CSS from a module; until then the browser's default margins show).
      if (getComputedStyle(document.body).marginTop !== '0px' || !document.querySelector('[data-scenario]')) return
      const boxes = snap()
      const key = boxes.join('|')
      same = key === last ? same + 1 : 0
      last = key
      if (same >= 2) {
        clearInterval(iv)
        document.body.dataset.geom = JSON.stringify({ scenario: document.querySelector('[data-scenario]')?.getAttribute('data-scenario'), fonts: document.fonts.status, boxes })
      }
    }, 250)
  })
}
