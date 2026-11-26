#!/usr/bin/env node
// Arm invariance in a real browser (26 §9 checklist, 27 T-INVARIANT, 29 UI-4): the measured page must lay out
// identically in both arms, outside the text of the inference line, at every width. jsdom can't see layout.
// Each page is loaded in dev/frame.html at an exact width; the probe records layout boxes once fonts are loaded and
// the layout has held still for three snapshots. Run with ARMS=control,control to see the instrument's noise floor.
//
// Starts its own dev server on port 5179 unless one is already running there (or a baseUrl is given), and needs
// Google Chrome. Uses the dev harness with fake Flagsmith deps and a
// throwaway browser profile per page, so nothing is sent anywhere and no real browser storage is touched.
//   node dev/check-arm-geometry.mjs [baseUrl]
import { chromePath } from './chrome.mjs'
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.argv[2] ?? 'http://localhost:5179'

// Use the running dev server if there is one; otherwise start one for this check (CI has none) and stop it at exit.
async function ensureServer() {
  const up = async () => (await fetch(BASE).catch(() => null))?.ok === true
  if (await up()) return null
  if (process.argv[2]) throw new Error(`nothing is serving ${BASE}`)
  const proc = spawn('npx', ['vite', '--port', '5179', '--strictPort'], {
    stdio: 'ignore',
    env: { VITE_FLAGSMITH_ENV_NAME: 'development', ...process.env },
  })
  for (const end = Date.now() + 30000; Date.now() < end; await new Promise((r) => setTimeout(r, 250))) {
    if (await up()) return proc
  }
  proc.kill()
  throw new Error('dev server did not start on port 5179')
}
const server = await ensureServer()
const stop = () => server?.kill()
process.on('exit', stop)
const CHROME = chromePath()
const WIDTHS = process.env.WIDTHS ? process.env.WIDTHS.split(',').map(Number) : [320, 375, 768, 1280]
const ARMS = (process.env.ARMS ?? 'control,chance_to_win').split(',')

function measureOnce(width, at, variant) {
  const profile = mkdtempSync(join(tmpdir(), 'readout-geom-'))
  try {
    const inner = `${BASE}/dev/app.html?route=/challenge&seed=at${at}&variant=${variant}&geom=1`
    const url = `${BASE}/dev/frame.html?w=${width}&src=${encodeURIComponent(inner)}`
    const dom = execFileSync(
      CHROME,
      ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-prefers-reduced-motion', `--user-data-dir=${profile}`,
        `--window-size=${Math.max(width, 500) + 40},1100`, '--virtual-time-budget=20000', '--dump-dom', url],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
    const m = dom.match(/data-geom="([^"]*)"/)
    if (!m) throw new Error(`no geometry for ${url}`)
    return JSON.parse(m[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&'))
  } finally {
    rmSync(profile, { recursive: true, force: true })
  }
}

// Headless Chrome occasionally ends its virtual-time budget before the page reports; that is not a result, so retry.
function measure(width, at, variant) {
  for (let tryNo = 1; ; tryNo++) {
    try {
      return measureOnce(width, at, variant)
    } catch (e) {
      if (tryNo === 5) throw e
    }
  }
}

// Two loads of the SAME arm can differ by 1 px per fractionally-sized block above an element (sub-pixel rounding);
// on the guardrail result (two evidence blocks) that adds up to 2 px, measured with ARMS=control,control. A wrapped
// inference line would move everything below it by a full line (20 px or more), so 2 px cannot hide one.
const TOLERANCE_PX = 2
function sameBox(a, b) {
  if (a === b) return true
  const [ta, na] = a.split(' ')
  const [tb, nb] = b.split(' ')
  if (ta !== tb) return false
  const xs = na.split(',')
  const ys = nb.split(',')
  return xs.every((v, i) => (v === 'text' || ys[i] === 'text' ? v === ys[i] : Math.abs(Number(v) - Number(ys[i])) <= TOLERANCE_PX))
}

let failures = 0
for (const width of WIDTHS) {
  for (const at of process.env.RESULTS ? process.env.RESULTS.split(',').map((n) => Number(n) - 1) : [0, 1, 2, 3, 4, 5]) {
    const compare = () => {
      const [p, c] = ARMS.map((v) => measure(width, at, v))
      const diffs = p.boxes.flatMap((b, i) => (c.boxes[i] !== undefined && sameBox(b, c.boxes[i]) ? [] : [`    ${b}  vs  ${c.boxes[i]}`]))
      return { p, diffs, same: p.boxes.length === c.boxes.length && diffs.length === 0 }
    }
    // A cold first load can mis-measure one block once; a real arm difference reproduces, so measure a mismatch twice.
    let r = compare()
    if (!r.same) r = compare()
    const { p, diffs, same } = r
    if (!same) failures++
    console.log(`${same ? 'ok  ' : 'DIFF'} ${String(width).padStart(4)} px  result ${at + 1} (${p.scenario})  ${p.boxes.length} boxes`)
    if (!same) console.log(diffs.slice(0, 6).join('\n'))
  }
}
console.log(failures ? `\n${failures} layouts differ between arms` : '\nAll layouts identical between arms')
process.exit(failures ? 1 : 0)
