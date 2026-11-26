/**
 * Design-system guards (26 §1, §9), reading the Tailwind theme in index.css:
 *  - every text/UI colour pair we actually use meets WCAG 2.2 AA (4.5:1 text, 3:1 UI/graphics);
 *  - semantic colour (good/bad) appears only in the post-measurement screens, never in the measured run;
 *  - no colour is hard-coded outside the theme, and Tailwind's stock palette is switched off.
 * Ratios are computed from the real theme, so changing a token re-runs the check.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..')
const THEME_FILE = 'styles/index.css'
const css = readFileSync(join(SRC, THEME_FILE), 'utf8')
const theme = css.slice(css.indexOf('@theme {'))

function token(name: string): string {
  const m = theme.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`))
  if (!m) throw new Error(`token --color-${name} missing or not a 6-digit hex`)
  return m[1]!
}

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

describe('Tailwind theme', () => {
  it('switches off the stock palette and fonts, so only our tokens exist', () => {
    expect(theme).toMatch(/--color-\*:\s*initial;/)
    expect(theme).toMatch(/--font-\*:\s*initial;/)
  })

  it('keeps the breakpoints the design uses (640 / 1024 px are Tailwind sm / lg; no override)', () => {
    expect(theme).not.toMatch(/--breakpoint-/)
  })
})

describe('contrast (WCAG 2.2 AA)', () => {
  it('matches the reference ratio for black on white', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
  })

  // [foreground, background, minimum]
  const TEXT = 4.5
  const UI = 3
  const pairs: [string, string, number][] = [
    // Text on every surface it sits on: page, card, selected option, code block.
    ...['bg-0', 'bg-1', 'bg-2', 'bg-3'].flatMap(
      (bg) => ['ink-1', 'ink-2'].map((fg) => [fg, bg, TEXT] as [string, string, number]),
    ),
    ['ink-3', 'bg-0', TEXT],
    ['ink-3', 'bg-1', TEXT],
    ['ink-3', 'bg-2', TEXT],
    // Primary button label in every state.
    ['accent-ink', 'accent', TEXT],
    ['accent-ink', 'accent-hover', TEXT],
    ['accent-ink', 'accent-press', TEXT],
    // Focus ring and evidence outline (UI).
    ['accent', 'bg-0', UI],
    ['accent', 'bg-1', UI],
    ['accent', 'bg-2', UI],
    // ✓/✗ marks after measurement, on page and card.
    ['good', 'bg-0', TEXT],
    ['good', 'bg-1', TEXT],
    ['bad', 'bg-0', TEXT],
    ['bad', 'bg-1', TEXT],
    // Interval bar and zero line on the card (graphics).
    ['viz-bar', 'bg-1', UI],
    ['viz-zero', 'bg-1', UI],
    // Env tag and practice badge: small accent text on the page and the header.
    ['accent', 'bg-0', TEXT],
    ['accent', 'bg-1', TEXT],
    // Progress rule: done segments against the header (graphics).
    ['ink-2', 'bg-0', UI],
  ]

  it.each(pairs)('%s on %s ≥ %s:1', (fg, bg, min) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(min)
  })

  it('practice badge: accent text on accent-wash composited over bg-0 ≥ 4.5:1', () => {
    const wash = theme.match(/--color-accent-wash:\s*rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)/)
    expect(wash).toBeTruthy()
    const [r, g, b, a] = wash!.slice(1).map(Number) as [number, number, number, number]
    const base = token('bg-0')
    const mix = [r, g, b]
      .map((c, i) => Math.round(c * a + parseInt(base.slice(1 + i * 2, 3 + i * 2), 16) * (1 - a)))
      .map((c) => c.toString(16).padStart(2, '0'))
      .join('')
    expect(contrast(token('accent'), `#${mix}`)).toBeGreaterThanOrEqual(TEXT)
  })
})

// ---------- colour rules ----------

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

/** Files allowed to use good/bad: the theme and the post-measurement screens only. */
const ALLOWED = new Set([THEME_FILE, 'routes/Readout.tsx'])
// Any Tailwind utility on the semantic colours (text-good, bg-bad/20, hover:border-good, …) or the raw variables.
const SEMANTIC =
  /--color-(good|bad)\b|--good\b|--bad\b|\bis-(good|bad)\b|\b(text|bg|border|outline|ring|fill|stroke|decoration|shadow|from|via|to|accent|caret|divide|placeholder)-(good|bad)\b/

describe('semantic colour isolation (26 §1 rules 1–2)', () => {
  const files = walk(SRC)
    .filter((p) => /\.(tsx?|css)$/.test(p) && !/\.test\.tsx?$/.test(p))
    .map((p) => relative(SRC, p))

  it('finds the source files', () => {
    expect(files).toContain('components/result/ResultCard.tsx')
    expect(files).toContain(THEME_FILE)
  })

  it('catches every form of the semantic colour (self-check of the pattern)', () => {
    for (const s of ['text-good', 'bg-bad/20', 'hover:border-good', 'var(--color-bad)', 'is-good']) expect(SEMANTIC.test(s)).toBe(true)
    for (const s of ['text-ink-1', 'goodbye', 'bg-accent']) expect(SEMANTIC.test(s)).toBe(false)
  })

  it('uses good/bad only after measurement', () => {
    const offenders = files.filter((f) => !ALLOWED.has(f) && SEMANTIC.test(readFileSync(join(SRC, f), 'utf8')))
    expect(offenders).toEqual([])
  })

  it('hard-codes no hex colour outside the theme (CSS and class strings alike)', () => {
    const HEX = /#[0-9a-fA-F]{3,8}\b/
    const offenders = files.filter((f) => f !== THEME_FILE && HEX.test(readFileSync(join(SRC, f), 'utf8')))
    expect(offenders).toEqual([])
  })

  it('has no stylesheet other than the Tailwind entry', () => {
    expect(files.filter((f) => f.endsWith('.css'))).toEqual([THEME_FILE])
  })
})
