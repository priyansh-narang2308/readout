// Dev-only style specimen: the type scale, tokens and shared parts, rendered from the real Tailwind theme and the
// shared class strings so they can be checked by eye.
import '../src/styles/index.css'
import { btn, btnGhost, chip, cx, kbd, link, notice, page, spinner, type } from '../src/components/ui/classes'

const TOKENS = ['bg-0', 'bg-1', 'bg-2', 'bg-3', 'line-1', 'line-2', 'line-3', 'ink-1', 'ink-2', 'ink-3', 'accent', 'accent-ink', 'good', 'bad']
const root = getComputedStyle(document.documentElement)

const section = 'pt-12 sm:pt-16'
const row = 'mt-4 flex flex-wrap items-center gap-4'
const stack = 'mt-4 flex flex-col gap-4'
// The real focus ring, forced on so it shows in a still screenshot.
const forceFocus = 'outline-2 outline-offset-2 outline-accent outline-solid'

const swatches = TOKENS.map((t) => {
  const v = root.getPropertyValue(`--color-${t}`).trim()
  return `<div class="flex flex-col gap-1">
    <span class="h-10 rounded-control border border-line-2" style="background:var(--color-${t})"></span>
    <span class="${type.data}">--${t}</span><span class="${cx(type.data, 'text-ink-3')}">${v}</span>
  </div>`
}).join('')

document.getElementById('root')!.innerHTML = `
<main class="${cx(page, 'py-12')}">
  <p class="${type.eyebrow}">Style specimen · dev only · not built for production</p>

  <section class="${section}">
    <h2 class="${type.eyebrow}">Type scale</h2>
    <div class="${stack}">
      <p class="${type.displayXl}">Would you ship it?</p>
      <p class="${type.displayL}">4 of 6 defensible calls.</p>
      <p class="${type.titleL}">Checkout button copy</p>
      <p class="${type.titleM}">The trap</p>
      <p class="${type.bodyL}">Six realistic A/B test results. For each, make the call: ship, keep the control, keep collecting, or don’t trust the data.</p>
      <p class="${type.body}">Every figure on this card is computed from the raw counts with the same formulas as Flagsmith’s experiment statistics.</p>
      <p class="${type.bodyS}">Fictional result. You’ll see six like this.</p>
      <p class="${type.data}">Control 2,000 · 15.0% &nbsp; Variant 2,000 · 16.5% &nbsp; p = 0.19 &nbsp; chance = 91%</p>
      <p class="${type.dataXl}">+10.0%</p>
      <p class="${type.data}">Minus sign check: −4.2% (U+2212) vs -4.2% (hyphen)</p>
    </div>
  </section>

  <section class="${section}">
    <h2 class="${type.eyebrow}">Surfaces and ink</h2>
    <div class="mt-4 grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">${swatches}</div>
  </section>

  <section class="${section}">
    <h2 class="${type.eyebrow}">Buttons</h2>
    <div class="${row}">
      <button class="${btn('primary')}">Start the challenge</button>
      <button class="${btn('primary')}" disabled>Lock in call</button>
      <button class="${btn('primary')}" aria-busy="true"><span class="${spinner}" aria-hidden="true"></span> Preparing your challenge…</button>
      <button class="${btn('secondary')}">Copy template</button>
      <button class="${btnGhost}">Practise without being measured →</button>
    </div>
    <div class="${row}">
      <button class="${btn('primary', { blockMobile: true })}">Block on mobile</button>
    </div>
  </section>

  <section class="${section}">
    <h2 class="${type.eyebrow}">Small parts</h2>
    <div class="${row}">
      <span class="${chip}">Practice · not part of the study</span>
      <span class="${chip}">Ship</span>
      <span class="${kbd}">1</span><span class="${kbd}">Space</span>
      <a class="${link}" href="#">Full details</a>
    </div>
    <div class="${cx(stack, 'max-w-read')}">
      <p class="${notice()}">This browser is blocking storage, so a run here can only be practice and isn’t recorded.</p>
      <p class="${notice(true)}">Flagsmith couldn’t be reached, so this run is practice and isn’t part of the study.</p>
    </div>
  </section>

  <section class="${section}">
    <h2 class="${type.eyebrow}">Focus ring (forced)</h2>
    <div class="${row}">
      <button class="${cx(btn('secondary'), forceFocus)}">Secondary, focused</button>
      <button class="${cx(btn('primary'), forceFocus)}">Primary, focused</button>
    </div>
  </section>
</main>`
