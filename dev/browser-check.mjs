#!/usr/bin/env node
/**
 * Task 34: the real-browser check (29 §12.3 UI-1…UI-10, §12.4 cross-device, a slice of §12.5 failures), in the
 * installed Google Chrome driven by playwright-core. Runs against its own Vite dev server.
 *
 * Nothing leaves this machine: every request to a Flagsmith host is answered by a local fake that behaves like a
 * running experiment (and records each events POST), and any other non-localhost request is refused and reported.
 * Each scenario uses a fresh, throwaway browser context, so no real profile or storage is touched.
 *
 * Covers: keyboard-only measured journey (Enter starts, 1–4 + Enter, focus to the card title, Lock in disabled
 * until a choice, saved before the next card, Space skips the flip, ←/→ through the debrief, copy the Rules with the
 * exact Markdown and a "Copied" announcement); exactly one exposure, one batch of four and one M5 event, all for the
 * stored identity; axe (WCAG 2.1 A/AA) with 0 serious or critical on every page at every viewport; no horizontal
 * scroll; the above-the-fold landing at 1280 × 800 and 375 × 812; mobile practice by touch (badge on every screen,
 * Lock in on screen, 44 px targets, S4/S6 without overflow, zero Flagsmith requests); the flip grid 2 × 3 on a
 * tablet; reduced motion (no transform animation); presenter keys F, R, ←, →, Esc with zero requests;
 * Flagsmith unreachable or slow (> 4 s) → labelled practice within 4 s and no events.
 * Two tabs of one browser (TT-1…TT-4): Start, the same card answered, the last card locked and the Rules copied in
 * both at once; one identity, one answer per card, one score batch, one M5 event.
 * Not covered here (stated in the report): Firefox and WebKit engines, real phones and tablets.
 *
 * TARGET=prod builds a production bundle (VITE_FLAGSMITH_ENV_NAME=production) into a temporary folder and serves it
 * with the real deploy headers and SPA rewrite (dev/serve-dist.mjs, from vercel.json). It then also requires zero
 * Content-Security-Policy violations, zero console errors, the security headers on every page, and working deep links.
 *
 * Usage: node dev/browser-check.mjs                (npm run check:browser)
 *        TARGET=prod node dev/browser-check.mjs    (npm run check:browser:prod)
 * CHROME_PATH overrides the Chrome binary.          Exit 0 = all pass.
 */
import { chromePath } from './chrome.mjs'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import { createServer as createViteServer } from 'vite'
import { serveDist } from './serve-dist.mjs'

const CHROME = chromePath()
const TARGET = process.env.TARGET === 'prod' ? 'prod' : 'dev'
const PORT = TARGET === 'prod' ? 5184 : 5183
const BASE = `http://localhost:${PORT}`
const AXE = readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8')

const VIEWPORTS = {
  'desktop 1280×800': { width: 1280, height: 800 },
  'desktop 1440×900': { width: 1440, height: 900 },
  'tablet 768×1024': { width: 768, height: 1024, mobile: true },
  'tablet 1024×768': { width: 1024, height: 768, mobile: true },
  'phone 320×568': { width: 320, height: 568, mobile: true },
  'phone 375×812': { width: 375, height: 812, mobile: true },
  'phone 412×915': { width: 412, height: 915, mobile: true },
}

const results = []
const pass = (name, detail = '') => results.push({ ok: true, name, detail })
const fail = (name, detail = '') => results.push({ ok: false, name, detail })
const check = (cond, name, detail = '') => (cond ? pass(name, detail) : fail(name, detail))

// ---------- expected copy, read from the source modules themselves (works for both targets) ----------
async function expectedCopy() {
  const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })
  try {
    const rules = await vite.ssrLoadModule('/src/content/rules.ts')
    const study = await vite.ssrLoadModule('/src/content/study.ts')
    return { rulesMd: rules.rulesMarkdown(), unavailable: study.PRACTICE_COPY['sdk-error'].slice(0, 30) }
  } finally {
    await vite.close()
  }
}

// ---------- console errors and CSP violations, from every page ----------
const consoleErrors = []
const cspViolations = []

// ---------- the server: Vite dev, or a production build served like the host ----------
// Every Flagsmith request is faked below, so the app only needs *a* key to take the measured path. A fixed placeholder
// makes the check behave the same with or without a local .env (CI has none) and never sends a real key anywhere.
const CHECK_ENV = { ...process.env, VITE_FLAGSMITH_ENV_KEY: 'BrowserCheckPlaceholderKey01' }

async function startServer() {
  if (TARGET === 'prod') {
    const out = mkdtempSync(join(tmpdir(), 'readout-prod-'))
    const b = spawnSync('npx', ['vite', 'build', '--outDir', out, '--emptyOutDir'], {
      encoding: 'utf8',
      env: { ...CHECK_ENV, VITE_FLAGSMITH_ENV_NAME: 'production' },
    })
    if (b.status !== 0) throw new Error(`production build failed: ${b.stderr || b.stdout}`)
    const server = await serveDist(out, PORT)
    return { kill: () => (server.close(), rmSync(out, { recursive: true, force: true })) }
  }
  const proc = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'], env: CHECK_ENV })
  const end = Date.now() + 30000
  while (Date.now() < end) {
    try {
      if ((await fetch(BASE)).ok) return proc
    } catch {}
    await new Promise((r) => setTimeout(r, 250))
  }
  proc.kill()
  throw new Error('dev server did not start')
}

// ---------- the fake Flagsmith and the external-request guard ----------
function fakeNetwork() {
  const net = { requests: [], events: [], external: [], edge: 'ok' }
  const identity = (id) => ({
    identifier: id,
    traits: [],
    flags: [
      {
        feature: { id: 1, name: 'readout_framing', type: 'MULTIVARIATE' },
        enabled: true,
        feature_state_value: 'chance_to_win',
        variant: 'chance_to_win',
        metadata: { experiment: { id: 42, name: 'readout framing', in_experiment: true } },
      },
    ],
  })
  net.install = async (context) => {
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url())
      if (url.hostname === 'localhost') return route.continue()
      if (url.hostname.endsWith('flagsmith.com')) {
        net.requests.push(`${route.request().method()} ${url.href}`)
        if (url.hostname.startsWith('events.')) {
          net.events.push(...JSON.parse(route.request().postData() ?? '{"events":[]}').events)
          return route.fulfill({ status: 202, body: '' })
        }
        if (net.edge === 'down') return route.abort('connectionrefused')
        if (net.edge === 'slow') await new Promise((r) => setTimeout(r, 6000))
        if (net.identityDelay && url.pathname.includes('identities')) await new Promise((r) => setTimeout(r, net.identityDelay))
        if (url.pathname.includes('identities')) {
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(identity(url.searchParams.get('identifier') ?? '')) })
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      }
      net.external.push(url.href)
      return route.abort('blockedbyclient')
    })
  }
  return net
}

async function newContext(browser, vp, extra = {}) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: !!vp.mobile,
    hasTouch: !!vp.mobile,
    deviceScaleFactor: vp.mobile ? 2 : 1,
    ...extra,
  })
  const net = fakeNetwork()
  await net.install(context)
  await context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      console.error(`[csp] ${e.violatedDirective} blocked ${e.blockedURI || '(inline)'}`)
    })
  })
  context.on('console', (m) => {
    if (m.type() !== 'error') return
    const where = (() => {
      try {
        return new URL(m.page()?.url() ?? '').pathname
      } catch {
        return '?'
      }
    })()
    // The fake network refuses Flagsmith on purpose in the failure checks; those fetch errors are expected.
    if (/ERR_CONNECTION_REFUSED|ERR_BLOCKED_BY_CLIENT|Failed to load resource/.test(m.text()) && net.edge !== 'ok') return
    ;(m.text().startsWith('[csp]') ? cspViolations : consoleErrors).push(`${where}: ${m.text().slice(0, 160)}`)
  })
  return { context, net }
}

// ---------- page probes ----------
async function axe(page) {
  await page.evaluate(AXE)
  const r = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const out = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })
    return out.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, where: v.nodes[0]?.target?.join(' ') }))
  })
  return { bad: r.filter((v) => v.impact === 'serious' || v.impact === 'critical'), minor: r.filter((v) => v.impact !== 'serious' && v.impact !== 'critical') }
}
const badgeVisible = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('body *')].some((el) => {
      if (el.children.length || !/Practice · not part of the study/i.test(el.textContent ?? '')) return false
      const r = el.getBoundingClientRect()
      return r.width > 1 && r.height > 1 && r.bottom > 0 && r.top < window.innerHeight && getComputedStyle(el).visibility !== 'hidden'
    }),
  )
// Playwright's waitForFunction evaluates its predicate with eval, which the production CSP (rightly) blocks; this
// polls with page.evaluate instead, which works under any CSP.
async function until(page, fn, arg, timeout = 15000) {
  const end = Date.now() + timeout
  for (;;) {
    if (await page.evaluate(fn, arg)) return
    if (Date.now() > end) throw new Error(`timed out waiting for ${fn.toString().slice(0, 80)}`)
    await page.waitForTimeout(50)
  }
}
const hScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
const settle = (page) => page.waitForTimeout(450)
async function storedAttempt(page) {
  return page.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem('readout.attempt') ?? 'null')
    } catch {
      return null
    }
  })
}

// ---------- 1. keyboard-only measured journey, desktop ----------
async function measuredJourney(browser) {
  const vp = VIEWPORTS['desktop 1280×800']
  const { context, net } = await newContext(browser, vp, { permissions: ['clipboard-read', 'clipboard-write'] })
  const page = await context.newPage()
  await page.goto(`${BASE}/`)
  await page.locator('h1').waitFor()
  check(net.requests.length === 0, 'UI-1 landing makes no Flagsmith request before Start', `${net.requests.length} requests`)

  // UI-10: no mouse from here on. Enter starts when nothing else has focus.
  await page.keyboard.press('Enter')
  await page.waitForURL('**/challenge')
  await page.locator('[data-scenario]').waitFor()
  check(net.requests.some((r) => r.includes('identities')), 'I-1 Start identifies with Flagsmith (faked locally)')

  let focusOk = 0
  let disabledOk = 0
  let savedOk = 0
  let selectedOk = 0
  const fold = []
  for (let i = 0; i < 6; i++) {
    await page.locator('[data-scenario]').waitFor()
    await settle(page)
    const sc = await page.locator('[data-scenario]').getAttribute('data-scenario')
    const focus = await page.evaluate(() => /^rc-title/.test(document.activeElement?.id ?? '') || !!document.activeElement?.closest?.('[id^="rc-title"]'))
    focusOk += focus ? 1 : 0
    disabledOk += (await page.locator('[data-lock]').isDisabled()) ? 1 : 0
    const lockBox = await page.locator('[data-lock]').boundingBox()
    fold.push([sc, Math.round((lockBox?.y ?? 9e9) + (lockBox?.height ?? 0))])
    await page.keyboard.press(String((i % 4) + 1))
    selectedOk += (await page.locator('[role="radio"][aria-checked="true"]').count()) === 1 ? 1 : 0
    await page.keyboard.press('Enter')
    if (i < 5) {
      await until(page, (prev) => document.querySelector('[data-scenario]')?.getAttribute('data-scenario') !== prev, sc)
      const a = await storedAttempt(page)
      savedOk += a?.index === i + 1 ? 1 : 0
    }
  }
  check(focusOk === 6, 'UI-2 focus moves to the card title on every result', `${focusOk}/6`)
  check(disabledOk === 6, 'UI-2 Lock in is disabled until a call is chosen', `${disabledOk}/6`)
  check(selectedOk === 6, 'UI-2 keys 1–4 select a call', `${selectedOk}/6`)
  const overFold = fold.filter(([sc, bottom]) => sc !== 'S6' && bottom > vp.height)
  check(overFold.length === 0, '26 §3 at 1280 × 800 every single-metric card, Lock in included, fits above the fold', fold.map(([sc, b]) => `${sc} ${b}px`).join(', '))
  check(savedOk === 5, 'UI-3 each locked call is saved before the next card shows', `${savedOk}/5`)

  await page.waitForURL('**/readout')
  const exposures = () => net.events.filter((e) => e.event === '$flag_exposure')
  await page.waitForTimeout(800)
  await page.keyboard.press(' ') // UI-4: Space skips to the end state
  await page.getByRole('button', { name: 'Walk through your six calls' }).waitFor({ state: 'visible' })
  pass('UI-4 Space skips the flip to its end state')

  // Keyboard to the debrief: Tab to "Walk through your six calls", Enter.
  for (let t = 0; t < 40; t++) {
    await page.keyboard.press('Tab')
    if ((await page.evaluate(() => document.activeElement?.textContent ?? '')).includes('Walk through your six calls')) break
  }
  await page.keyboard.press('Enter')
  await page.waitForURL('**/readout/1')
  // Each debrief page binds its arrow keys once it has rendered; wait for its title to take focus.
  const key = async (k, to) => {
    await settle(page)
    await page.keyboard.press(k)
    await page.waitForURL(to)
  }
  for (let n = 2; n <= 6; n++) await key('ArrowRight', `**/readout/${n}`)
  await key('ArrowLeft', '**/readout/5')
  await key('ArrowRight', '**/readout/6')
  await key('ArrowRight', '**/readout/summary')
  pass('UI-5 ←/→ move through the debrief to the readout')

  // UI-7: keyboard to "Copy as Markdown", Enter, then the clipboard holds exactly the Rules. Waits for the button to
  // render first, so the Tab walk never runs over a page that is still mounting.
  await page.getByRole('button', { name: 'Copy as Markdown' }).waitFor()
  await settle(page)
  for (let t = 0; t < 80; t++) {
    await page.keyboard.press('Tab')
    if ((await page.evaluate(() => document.activeElement?.textContent ?? '')).includes('Copy as Markdown')) break
  }
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  const clip = await page.evaluate(() => navigator.clipboard.readText())
  const md = COPY.rulesMd
  check(clip === md, 'UI-7 the clipboard holds exactly the Rules Markdown', `${clip.length} chars`)
  const announced = await page.evaluate(() => [...document.querySelectorAll('[aria-live], [role="status"]')].some((n) => /Copied/.test(n.textContent ?? '')))
  check(announced, 'UI-7 "Copied" is announced in a live region')
  pass('UI-10 the whole journey, landing to readout and Rules copy, ran on the keyboard alone')

  const end = Date.now() + 5000
  while (Date.now() < end && !net.events.some((e) => e.event === 'readout_rules_copied')) await page.waitForTimeout(100)
  const uid = await page.evaluate(() => localStorage.getItem('readout.uid'))
  const names = net.events.map((e) => e.event)
  check(exposures().length === 1, 'I-4 exactly one $flag_exposure for the run', `${exposures().length}`)
  check(
    JSON.stringify(names.filter((n) => n !== '$flag_exposure')) ===
      JSON.stringify(['readout_score', 'readout_completed', 'readout_loss_call', 'readout_near_miss_call', 'readout_rules_copied']),
    'I-6 the four score events, then one Rules-copied event',
    names.join(', '),
  )
  check(new Set(net.events.map((e) => e.identifier)).size === 1 && net.events[0]?.identifier === uid, 'I-2 every event carries the stored identity')
  check(net.external.length === 0, 'no request left for any host other than (faked) Flagsmith', net.external.join(' '))

  const state = await context.storageState()
  await context.close()
  return state
}

// ---------- 2. every page at every viewport: axe, horizontal scroll ----------
// ---------- 1b. two tabs of one browser (one context = shared localStorage and Web Locks) ----------
async function twoTabs(browser) {
  const vp = VIEWPORTS['desktop 1280×800']
  const { context, net } = await newContext(browser, vp, { permissions: ['clipboard-read', 'clipboard-write'] })
  const [a, b] = [await context.newPage(), await context.newPage()]
  await Promise.all([a, b].map((p) => p.goto(`${BASE}/`)))
  await Promise.all([a, b].map((p) => p.getByRole('button', { name: 'Start the challenge' }).waitFor()))

  // Start in both tabs inside the same Flagsmith round trip (held 1.5 s, under the 4 s gate).
  net.identityDelay = 1500
  await Promise.all([a, b].map((p) => p.getByRole('button', { name: 'Start the challenge' }).click()))
  await Promise.all([a, b].map((p) => p.waitForURL('**/challenge')))
  net.identityDelay = 0
  const uid = await a.evaluate(() => localStorage.getItem('readout.uid'))
  const idReqs = net.requests.filter((r) => r.includes('identities')).map((r) => new URL(r.split(' ')[1]).searchParams.get('identifier'))
  check(!!uid && new Set(idReqs).size === 1 && idReqs[0] === uid, 'TT-1 Start in two tabs at once: one identity, one Flagsmith identify', `${idReqs.length} identify request(s), ${new Set(idReqs).size} identity`)
  const [sa, sb] = [await storedAttempt(a), await storedAttempt(b)]
  check(!!sa && sa.id === sb?.id && sa.uid === uid, 'TT-1 both tabs follow the one attempt')

  // Both tabs answer the first card at the same moment, with different calls.
  await Promise.all([a, b].map((p) => p.locator('[data-scenario]').waitFor()))
  await settle(a)
  await a.keyboard.press('1')
  await b.keyboard.press('2')
  await Promise.all([a.locator('[data-lock]').click(), b.locator('[data-lock]').click()])
  await a.waitForTimeout(800)
  const after1 = await storedAttempt(a)
  const first = after1?.order?.[0]
  const answered = Object.keys(after1?.answers ?? {})
  check(after1?.index === 1 && answered.length === 1 && ['ship', 'control', 'collecting', 'distrust'].includes(after1.answers[first]), 'TT-2 two tabs lock the same card at once: exactly one answer is stored, index 1', `index ${after1?.index}, answers ${JSON.stringify(after1?.answers)}`)
  const notice = await Promise.all([a, b].map((p) => p.getByText('moved on in another tab').count()))
  check(notice.some((n) => n > 0), 'TT-2 the losing tab says the challenge moved on in another tab', `notice in tabs: ${notice.join(', ')}`)

  // Finish cards 2–5 in tab A; then both tabs lock the sixth card at once.
  for (let i = 1; i < 5; i++) {
    await a.locator('[data-scenario]').waitFor()
    await settle(a)
    const sc = await a.locator('[data-scenario]').getAttribute('data-scenario')
    await a.keyboard.press(String((i % 4) + 1))
    await a.keyboard.press('Enter')
    await until(a, (prev) => document.querySelector('[data-scenario]')?.getAttribute('data-scenario') !== prev, sc)
  }
  await b.reload()
  await Promise.all([a, b].map((p) => p.locator('[data-scenario]').waitFor()))
  await settle(a)
  await settle(b)
  const sixth = await Promise.all([a, b].map((p) => p.locator('[data-scenario]').getAttribute('data-scenario')))
  await a.keyboard.press('3')
  await b.keyboard.press('4')
  await Promise.all([a.locator('[data-lock]').click(), b.locator('[data-lock]').click()])
  await Promise.all([a, b].map((p) => p.waitForURL('**/readout', { timeout: 15000 })))
  await a.waitForTimeout(1500)
  const done = await storedAttempt(a)
  const scores = (n) => net.events.filter((e) => e.event === n).length
  check(sixth[0] === sixth[1] && Object.keys(done?.answers ?? {}).length === 6, 'TT-3 both tabs on the last card; six answers stored, no seventh', `${sixth.join('/')} · ${Object.keys(done?.answers ?? {}).length} answers`)
  check(
    ['readout_score', 'readout_completed', 'readout_loss_call', 'readout_near_miss_call'].every((n) => scores(n) === 1),
    'TT-3 completion in two tabs at once: the four score events are sent exactly once',
    ['readout_score', 'readout_completed', 'readout_loss_call', 'readout_near_miss_call'].map((n) => `${n} ${scores(n)}`).join(', '),
  )
  check(done?.status === 'sent_1' && done?.payload?.metadata?.answers?.split(',').length === 6, 'TT-3 one payload, built from the stored answers, status sent_1', `${done?.status}`)

  // Delivery and M5: both tabs copy the Rules at once; one event, and the attempt's answers and payload are untouched.
  await Promise.all([a, b].map((p) => p.goto(`${BASE}/readout/summary`)))
  const copy = (p) => p.getByRole('button', { name: /Copy as Markdown/ })
  await Promise.all([a, b].map((p) => copy(p).waitFor()))
  await Promise.all([copy(a).click(), copy(b).click()])
  const end = Date.now() + 5000
  while (Date.now() < end && scores('readout_rules_copied') === 0) await a.waitForTimeout(100)
  await a.waitForTimeout(1500)
  const final = await storedAttempt(a)
  check(scores('readout_rules_copied') === 1, 'TT-4 Rules copied in two tabs at once: one M5 event', `${scores('readout_rules_copied')}`)
  check(scores('readout_score') === 1, 'TT-4 revisiting in two tabs re-sends no scores', `${scores('readout_score')}`)
  check(
    JSON.stringify(final?.answers) === JSON.stringify(done?.answers) && JSON.stringify(final?.payload) === JSON.stringify(done?.payload) && final?.delivery?.send1 === 'ok',
    'TT-4 delivery updates from two tabs leave the answers and payload untouched; send 1 recorded ok',
    `send1 ${final?.delivery?.send1}`,
  )
  check(new Set(net.events.map((e) => e.identifier)).size === 1, 'TT every event from both tabs carries the one identity')
  await context.close()
}

const SITE_PAGES = ['/', '/practice', '/rules', '/team', '/team/present', '/about', '/nope']
const RUN_PAGES = ['/readout', '/readout/1', '/readout/4', '/readout/6', '/readout/summary']

async function sweep(browser, finishedState) {
  const axeBad = []
  const minor = new Map()
  const scroll = []
  const small = new Set()
  let runs = 0
  for (const [label, vp] of Object.entries(VIEWPORTS)) {
    for (const [pages, state] of [
      [SITE_PAGES, undefined],
      [RUN_PAGES, finishedState],
    ]) {
      const { context, net } = await newContext(browser, vp, state ? { storageState: state } : {})
      const page = await context.newPage()
      for (const path of pages) {
        await page.goto(`${BASE}${path}`)
        await page.locator('h1').first().waitFor()
        await settle(page)
        if (path === '/readout') {
          await page.keyboard.press(' ')
          await settle(page)
        }
        const { bad, minor: m } = await axe(page)
        runs++
        bad.forEach((v) => axeBad.push(`${label} ${path}: ${v.id} (${v.impact}, ${v.n}) at ${v.where}`))
        m.forEach((v) => minor.set(`${v.id} (${v.impact})`, (minor.get(`${v.id} (${v.impact})`) ?? 0) + 1))
        // The presenter scales its whole stage to fit the screen (26 §8.9): it is for a shared screen, not a phone.
      if (vp.mobile && path !== '/team/present') {
          // 29 §12.4: tap targets ≥ 44 px on touch screens. Buttons and toggles; inline text links are exempt, and
          // the Development-only debug button never ships.
          const tiny = await page.evaluate(() =>
            [...document.querySelectorAll('button, [role="radio"], [role="tab"], a[class*="btn"], a[class*="h-11"]')]
              .filter((el) => !el.closest('[data-debug-panel]') && el.textContent?.trim() !== 'DEV')
              .map((el) => [el, el.getBoundingClientRect()])
              .filter(([el, r]) => r.width > 1 && r.height > 1 && getComputedStyle(el).visibility !== 'hidden' && (r.height < 44 || r.width < 44))
              .map(([el, r]) => `"${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24)}" ${Math.round(r.width)}×${Math.round(r.height)}`),
          )
          tiny.forEach((t) => small.add(`${label.split(" ")[1]} ${path}: ${t}`))
        }
        const over = await hScroll(page)
        if (over > 0) scroll.push(`${label} ${path}: ${over}px`)
      }
      if (state) check(net.requests.length === 0, `${label}: the finished run's pages make no Flagsmith request`, `${net.requests.length}`)
      await context.close()
    }
  }
  check(axeBad.length === 0, `axe WCAG 2.1 A/AA: 0 serious or critical across ${runs} page × viewport runs`, axeBad.join('\n      '))
  if (minor.size) pass('axe minor/moderate findings (not gating)', [...minor].map(([k, n]) => `${k} ×${n}`).join(', '))
  check(small.size === 0, 'every button and toggle on every page is at least 44 × 44 px on touch screens', [...small].join(', '))
  check(scroll.length === 0, `no horizontal scroll on any page at any of ${Object.keys(VIEWPORTS).length} viewports`, scroll.join(', '))
}

// ---------- 3. above the fold (UI-1) ----------
async function aboveFold(browser) {
  for (const label of ['desktop 1280×800', 'phone 375×812']) {
    const { context } = await newContext(browser, VIEWPORTS[label])
    const page = await context.newPage()
    await page.goto(`${BASE}/`)
    await page.locator('h1').waitFor()
    await settle(page)
    const h = VIEWPORTS[label].height
    const box = async (loc) => (await loc.boundingBox()) ?? { y: 9e9, height: 0 }
    const parts = {
      H1: await box(page.locator('h1')),
      'Start button': await box(page.getByRole('button', { name: 'Start the challenge' })),
      'study notice': await box(page.locator('#study')),
    }
    if (label.startsWith('desktop')) {
      const out = Object.entries(parts).filter(([, b]) => b.y + b.height > h)
      check(
        out.length === 0,
        `UI-1 ${label}: H1, Start and the whole study notice are above the fold`,
        Object.entries(parts).map(([k, b]) => `${k} ends at ${Math.round(b.y + b.height)}px`).join(', ') + ` of ${h}`,
      )
    } else {
      // 34 §4.2 (which overrides 29) puts the full consent text directly above Start: on a phone it can't all fit,
      // so the H1 and the start of the notice are above the fold, and Start follows the notice directly.
      const gap = parts['Start button'].y - (parts['study notice'].y + parts['study notice'].height)
      check(
        parts.H1.y + parts.H1.height <= h && parts['study notice'].y + 48 <= h && gap >= 0 && gap <= 40,
        `UI-1 ${label}: H1 and the start of the study notice above the fold, Start directly after the notice`,
        `notice starts ${Math.round(parts['study notice'].y)}px, Start at ${Math.round(parts['Start button'].y)}px (${Math.round(gap)}px after it)`,
      )
    }
    await context.close()
  }
}

// ---------- 4. mobile practice by touch ----------
async function mobilePractice(browser) {
  for (const label of ['phone 320×568', 'phone 375×812']) {
    const vp = VIEWPORTS[label]
    const { context, net } = await newContext(browser, vp)
    const page = await context.newPage()
    await page.goto(`${BASE}/practice`)
    let badge = 0
    let lockOnScreen = 0
    let small = []
    const overflow = []
    for (let i = 0; i < 6; i++) {
      await page.locator('[data-scenario]').waitFor()
      await settle(page)
      const sc = await page.locator('[data-scenario]').getAttribute('data-scenario')
      badge += (await badgeVisible(page)) ? 1 : 0
      await page.locator('[data-decision]').nth(i % 4).tap()
      const lock = await page.locator('[data-lock]').boundingBox()
      lockOnScreen += lock && lock.y >= 0 && lock.y + lock.height <= vp.height ? 1 : 0
      const targets = await page.evaluate(() =>
        [...document.querySelectorAll('[role="radio"], [data-lock]')].map((el) => {
          const r = el.getBoundingClientRect()
          return { h: Math.round(r.height), w: Math.round(r.width), t: el.textContent?.trim().slice(0, 20) }
        }),
      )
      small.push(...targets.filter((t) => t.h < 44 || t.w < 44).map((t) => `${sc} "${t.t}" ${t.w}×${t.h}`))
      if (sc === 'S4' || sc === 'S6') {
        const o = await page.evaluate(() => {
          const card = document.querySelector('[data-scenario]')
          const r = card.getBoundingClientRect()
          // Anything drawn outside the card's own box (sr-only text is 1 px and clipped, so it is skipped).
          const inner = [...card.querySelectorAll('*')].filter((n) => {
            const b = n.getBoundingClientRect()
            return b.width > 1 && (b.right > r.right + 1 || b.left < r.left - 1)
          }).length
          return { right: r.right - window.innerWidth, inner }
        })
        if (o.right > 0 || o.inner > 0) overflow.push(`${sc}: right +${Math.round(o.right)}px, ${o.inner} overflowing nodes`)
      }
      await page.locator('[data-lock]').tap()
      if (i < 5) await until(page, (prev) => document.querySelector('[data-scenario]')?.getAttribute('data-scenario') !== prev, sc)
    }
    await page.waitForURL('**/practice/readout')
    await settle(page)
    badge += (await badgeVisible(page)) ? 1 : 0
    check(badge === 7, `UI-9 ${label}: the practice badge is on every practice screen`, `${badge}/7`)
    check(lockOnScreen === 6, `${label}: Lock in is on screen (sticky) on every card after choosing`, `${lockOnScreen}/6`)
    check(small.length === 0, `${label}: every call option and Lock in is at least 44 × 44 px`, [...new Set(small)].join(', '))
    check(overflow.length === 0, `${label}: the S4 and S6 cards render without overflow`, overflow.join(', '))
    check(net.requests.length === 0, `UI-9 ${label}: practice makes zero Flagsmith requests`, `${net.requests.length}`)
    await context.close()
  }
}

// ---------- 5. tablet flip grid, reduced motion ----------
async function flipChecks(browser, finishedState) {
  for (const [label, want] of [
    ['tablet 768×1024', 2],
    ['tablet 1024×768', 3],
  ]) {
    const { context } = await newContext(browser, VIEWPORTS[label], { storageState: finishedState })
    const page = await context.newPage()
    await page.goto(`${BASE}/readout`)
    const grid = page.getByRole('list', { name: 'Your six results' })
    await grid.waitFor()
    const cols = await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
    check(cols === want, `${label}: the flip grid is ${want} × ${6 / want}`, `${cols} columns`)
    await context.close()
  }
  const { context } = await newContext(browser, VIEWPORTS['desktop 1280×800'], { storageState: finishedState, reducedMotion: 'reduce' })
  const page = await context.newPage()
  await page.goto(`${BASE}/readout`)
  await page.getByRole('list', { name: 'Your six results' }).waitFor()
  let moving = 0
  for (let t = 0; t < 12; t++) {
    moving += await page.evaluate(
      () =>
        document.getAnimations().filter((a) => {
          const kf = a.effect?.getKeyframes?.() ?? []
          return kf.some((k) => k.transform && k.transform !== 'none') || (a.transitionProperty ?? '').includes('transform')
        }).length,
    )
    await page.waitForTimeout(150)
  }
  check(moving === 0, 'UI-4 reduced motion: the flip runs no transform animation', `${moving} transform animation samples`)
  await context.close()
}

// ---------- 6. presenter (UI-8) ----------
async function presenter(browser) {
  const { context, net } = await newContext(browser, VIEWPORTS['desktop 1440×900'])
  const page = await context.newPage()
  await page.goto(`${BASE}/team/present`)
  await page.locator('[data-presenter]').waitFor()
  const pos = () => page.locator('[data-position]').textContent()
  const line = () => page.locator('[data-inference]').first().textContent()
  const press = async (k) => {
    await page.keyboard.press(k)
    await settle(page)
  }
  await settle(page)
  const p1 = await pos()
  await press('ArrowRight')
  const p2 = await pos()
  await press('ArrowLeft')
  const p3 = await pos()
  const l1 = await line()
  await press('f')
  const l2 = await line()
  const before = await page.locator('[data-presenter]').innerText()
  await page.keyboard.press('r')
  await settle(page)
  const after = await page.locator('[data-presenter]').innerText()
  await page.keyboard.press('Escape')
  await page.waitForURL('**/team')
  check(p1 !== p2 && p3 === p1, 'UI-8 presenter ←/→ move between results', `${p1} → ${p2} → ${p3}`)
  check(l1 !== l2, 'UI-8 presenter F flips the inference line', `"${l1}" → "${l2}"`)
  check(before !== after, 'UI-8 presenter R reveals the answer')
  pass('UI-8 presenter Esc returns to the team guide')
  check(net.requests.length === 0, 'UI-8 the presenter makes zero Flagsmith requests', `${net.requests.length}`)
  await context.close()
}

// ---------- 7. Flagsmith down or slow (F-1, F-9) ----------
async function failures(browser) {
  for (const [mode, id] of [
    ['down', 'F-1 Flagsmith unreachable'],
    ['slow', 'F-9 flags slower than 4 s'],
  ]) {
    const { context, net } = await newContext(browser, VIEWPORTS['desktop 1280×800'])
    net.edge = mode
    const page = await context.newPage()
    await page.goto(`${BASE}/`)
    await page.locator('h1').waitFor()
    const t0 = Date.now()
    const unavailable = COPY.unavailable
    await page.getByRole('button', { name: 'Start the challenge' }).click()
    // The landing says why this can only be practice (the notice under Start) and offers the practice run.
    let labelled = false
    try {
      await page.getByRole('status').filter({ hasText: unavailable }).first().waitFor({ timeout: 6000 })
      labelled = true
    } catch {}
    const ms = Date.now() - t0
    check(labelled && ms <= 4500, `${id}: the landing explains it within 4 s and offers practice`, `${ms} ms`)
    const stayed = new URL(page.url()).pathname === '/'
    await page.getByRole('button', { name: /practi[cs]e/i }).first().click()
    let badge = false
    try {
      await page.locator('[data-scenario]').waitFor({ timeout: 3000 })
      await settle(page)
      badge = await badgeVisible(page)
    } catch (e) {
      badge = `probe error: ${String(e).slice(0, 120)}`
    }
    check(stayed && badge === true, `${id}: no measured run starts; the practice run is labelled`, `stayed on landing: ${stayed}, badge: ${badge}, now at ${new URL(page.url()).pathname}`)
    await page.waitForTimeout(500)
    check(net.events.length === 0, `${id}: no events sent`, `${net.events.length}`)
    await context.close()
  }
}

// ---------- 8. production only: the deploy headers and deep links ----------
async function deployChecks() {
  const need = ['content-security-policy', 'referrer-policy', 'x-content-type-options', 'x-frame-options', 'permissions-policy']
  const missing = []
  const deep = []
  for (const path of ['/', '/readout/3', '/practice/readout/summary', '/team/present', '/rules', '/nope']) {
    const r = await fetch(`${BASE}${path}`)
    const html = await r.text()
    need.filter((h) => !r.headers.get(h)).forEach((h) => missing.push(`${path}: ${h}`))
    if (r.status !== 200 || !html.includes('<div id="root">')) deep.push(`${path}: ${r.status}`)
  }
  check(missing.length === 0, 'deploy: the CSP and security headers are on every page', missing.join(', '))
  check(deep.length === 0, 'deploy: deep links are served the app shell (SPA rewrite)', deep.join(', '))
  const asset = (await (await fetch(`${BASE}/`)).text()).match(/\/assets\/[^"]+\.js/)?.[0]
  const cache = asset ? (await fetch(`${BASE}${asset}`)).headers.get('cache-control') : null
  check(/immutable/.test(cache ?? ''), 'deploy: hashed assets are cached as immutable', cache ?? 'no asset found')
}

// ---------- run ----------
const COPY = await expectedCopy()
const server = await startServer()
// The two-tab checks drive a background tab. Chrome pauses animation frames and throttles timers there, and Playwright
// needs a frame to see a button settle before it clicks, so a background click can wait forever (seen on Linux CI).
// These switches keep every tab running like a foreground window; they change nothing the app does.
const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
})
try {
  const finished = await measuredJourney(browser)
  await twoTabs(browser)
  await aboveFold(browser)
  await mobilePractice(browser)
  await flipChecks(browser, finished)
  await presenter(browser)
  await failures(browser)
  await sweep(browser, finished)
  if (TARGET === 'prod') await deployChecks()
  check(cspViolations.length === 0, 'no Content-Security-Policy violation on any page', [...new Set(cspViolations)].join('\n      '))
  const errs = [...new Set(consoleErrors)]
  if (TARGET === 'prod') check(errs.length === 0, 'no console error on any page (production build)', errs.join('\n      '))
  else if (errs.length) pass(`console errors in the dev build (not gating): ${errs.length}`, errs.slice(0, 5).join('\n      '))
} catch (e) {
  fail('the check itself crashed', String(e?.stack ?? e).split('\n').slice(0, 4).join(' | '))
} finally {
  await browser.close()
  server.kill()
}

for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'}  ${r.name}${r.detail ? `\n      ${r.detail}` : ''}`)
const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} checks passed · ${TARGET === 'prod' ? 'production build with deploy headers' : 'dev server'} · Chrome ${browser.version?.() ?? ''}`)
process.exit(failed ? 1 : 0)
