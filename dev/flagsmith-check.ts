// Dev-only Flagsmith connection check. Imports the app's real modules; nothing here is a mock.
import '../src/styles/index.css'
import { enrol, envKey, envName, flagsmith, FLAG_KEY } from '../src/flagsmith/client'
import { deliveryLog } from '../src/flagsmith/deliveryMonitor'
import { DEV_CHECK_EVENT, sendDevConnectionCheck } from '../src/flagsmith/measurement'
import { uuid } from '../src/run/attemptStore'
import { btn, cx, type } from '../src/components/ui/classes'

const out = document.getElementById('out')!
const runBtn = document.getElementById('run') as HTMLButtonElement
const sendBtn = document.getElementById('send') as HTMLButtonElement

// Styling: Tailwind classes from the shared class strings (the HTML carries structure only).
const CLS: Record<string, string> = {
  eyebrow: type.eyebrow,
  title: cx(type.titleL, 'mt-3'),
  intro: cx(type.body, 'mt-2 text-ink-2'),
  row: 'mt-6 flex flex-wrap gap-3',
}
document.querySelectorAll<HTMLElement>('[data-cls]').forEach((el) => (el.className = CLS[el.dataset.cls!]!))
document.getElementById('main')!.className = 'mx-auto w-full max-w-[880px] px-(--gutter) py-12 [--gutter:16px] sm:[--gutter:32px] lg:[--gutter:48px]'
runBtn.className = btn('primary')
sendBtn.className = btn('secondary')
out.className = cx(type.data, 'mt-6 whitespace-pre-wrap rounded-card border border-line-2 bg-bg-1 p-4 text-ink-1')

const lines: string[] = []
function say(s: string) {
  lines.push(s)
  out.textContent = lines.join('\n')
}

if (envName() === 'production') {
  say('Refusing to run: this is a production build.')
  runBtn.disabled = true
}

// Persist per tab so a reload reuses the same Dev identity instead of creating a new one.
const identity = sessionStorage.getItem('devCheckIdentity') ?? `dev-check-${uuid()}`
sessionStorage.setItem('devCheckIdentity', identity)

async function run() {
  runBtn.disabled = true
  say(`env name:        ${envName()}`)
  say(`env key:         ${envKey() ? 'set (value not shown)' : 'MISSING'}`)
  say(`identity:        ${identity}`)
  const started = performance.now()
  const gate = await enrol(identity)
  say(`init + gate:     ${Math.round(performance.now() - started)} ms`)
  say(`sdk source:      ${flagsmith.loadingState?.source ?? '—'}`)
  const flag = flagsmith.getAllFlags()?.[FLAG_KEY]
  say(
    `flag (server):   ${flag ? JSON.stringify({ enabled: flag.enabled, value: flag.value, variant: flag.variant ?? null, experiment: flag.experiment ?? null }) : 'MISSING'}`,
  )
  say(`gate result:     ${JSON.stringify(gate)}`)
  out.dataset.state = 'evaluated'
  out.dataset.gate = gate.enrolled ? 'enrolled' : gate.reason
  out.dataset.source = String(flagsmith.loadingState?.source ?? '')
  sendBtn.disabled = flagsmith.loadingState?.source !== 'SERVER'
}

async function send() {
  sendBtn.disabled = true
  const id = uuid()
  say(`\nsending:         ${DEV_CHECK_EVENT} (devCheckId ${id})`)
  const r = await sendDevConnectionCheck(identity, id)
  say(`observed outcome: ${r.outcome ?? 'no request observed'}`)
  for (const l of deliveryLog()) say(`POST events API:  HTTP ${l.status} · ${l.events.join(', ')} · ${new Date(l.at).toISOString()}`)
  out.dataset.state = 'sent'
  out.dataset.outcome = String(r.outcome ?? 'none')
}

runBtn.addEventListener('click', () => void run())
sendBtn.addEventListener('click', () => void send())

// ?auto=1 runs both steps (used for a headless run by the developer).
if (new URLSearchParams(location.search).get('auto') === '1') void run().then(() => {
    if (!sendBtn.disabled) void send()
  })
