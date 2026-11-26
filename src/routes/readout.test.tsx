/**
 * After the flip: the six debriefs (25 §6, 26 §8.5), Your readout (25 §7, 26 §8.6) and the Rules page (25 §8, 26 §8.7),
 * driven like a player. measurement.ts is mocked to record M5 calls; its wire behaviour is in integration.test.tsx.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CALLS_LINE, PATTERN_RULES, REVIEW_TEMPLATE, RULES, rulesMarkdown } from '../content/rules'
import { CALL_LABEL, CALLS, MEASURED_ORDER, SCENARIOS, type Call, type ScenarioId } from '../content/scenarios.v1'
import { ALL_DEFENSIBLE_TEXT, patterns } from '../content/scoring'
import { KEYS, lockCall, newAttempt, withStatus, writeAttempt, writePractice } from '../run/attemptStore'
import { buildPayload, type StudyDeps } from '../run/controller'
import { StudyProvider } from '../run/StudyContext'
import { DebriefRoute, SummaryRoute } from './Readout'
import { LADDER, RulesRoute } from './Rules'

const m5 = vi.fn(async () => true)
vi.mock('../flagsmith/measurement', () => ({ trackRulesCopied: () => m5() }))

const UID = '11111111-2222-4333-8444-555555555555'
const wrong = (k: Call): Call => (k === 'ship' ? 'control' : 'ship')
/** Play order S3, S1, S5, S2, S4, S6. Mixed: right on S1 and S6, wrong elsewhere. */
const MIXED = Object.fromEntries(
  MEASURED_ORDER.map((id) => [id, id === 'S1' || id === 'S6' ? SCENARIOS[id].key : wrong(SCENARIOS[id].key)]),
) as Record<ScenarioId, Call>
const PERFECT = Object.fromEntries(MEASURED_ORDER.map((id) => [id, SCENARIOS[id].key])) as Record<ScenarioId, Call>

const deps = (): StudyDeps => ({
  enrol: vi.fn(),
  init: vi.fn(async () => undefined),
  sendScores: vi.fn(async () => 'sent' as const),
  resend: vi.fn(async () => 'none' as const),
  envName: () => 'development',
  storageOk: () => true,
})

function seed(answers: Record<ScenarioId, Call>) {
  let a = newAttempt({ uid: UID, variant: 'control', experimentId: 42, envName: 'development' })
  for (const id of MEASURED_ORDER) a = lockCall(a, id, answers[id], 1000)
  a = withStatus(a, 'scored_pending', { scoredAt: new Date().toISOString(), payload: buildPayload(a, null) })
  writeAttempt(withStatus(a, 'sent_1', { delivery: { send1: 'ok' } }))
  localStorage.setItem(KEYS.uid, UID)
}

function Path() {
  const l = useLocation()
  return <output data-testid="path">{l.pathname + l.hash}</output>
}
function app(at: string) {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <StudyProvider deps={deps()}>
        <Routes>
          <Route path="/readout/summary" element={<SummaryRoute kind="measured" />} />
          <Route path="/readout/:n" element={<DebriefRoute kind="measured" />} />
          <Route path="/practice/readout/summary" element={<SummaryRoute kind="practice" />} />
          <Route path="/practice/readout/:n" element={<DebriefRoute kind="practice" />} />
          <Route path="/rules" element={<RulesRoute />} />
          <Route path="*" element={<p>elsewhere</p>} />
        </Routes>
        <Path />
      </StudyProvider>
    </MemoryRouter>,
  )
}
const path = () => screen.getByTestId('path').textContent
const h1 = () => screen.getByRole('heading', { level: 1 })
const lines = () => [...document.querySelectorAll<HTMLElement>('[data-inference]')].map((p) => p.dataset.inference)
const writeText = vi.fn(async (_: string) => undefined)

beforeEach(() => {
  localStorage.clear()
  m5.mockClear()
  writeText.mockClear()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})
afterEach(() => cleanup())

describe('debrief', () => {
  it('the result in play order: title, the calls as text, the trap, and the rule to check next time', () => {
    seed(MIXED)
    app('/readout/1') // S3, answered wrong
    const s = SCENARIOS.S3
    expect(h1().textContent).toBe(`Result 1 · ${s.shortTitle}`)
    expect(document.activeElement).toBe(h1())
    const calls = document.querySelector('[data-calls]')!
    expect(calls.textContent).toBe(`You chose${CALL_LABEL[MIXED.S3]}✗not defensibleDefensible call${CALL_LABEL[s.key]}`)
    expect(screen.getByRole('heading', { level: 2, name: s.trap.name })).toBeTruthy()
    for (const r of s.rules) {
      expect(screen.getByRole('link', { name: `Rule ${r}: ${RULES[r - 1]!.title}` }).getAttribute('href')).toBe(`/rules#rule-${r}`)
    }
  })

  it('a defensible call shows ✓ and no "defensible call" line', () => {
    seed(MIXED)
    app('/readout/2') // S1, right
    const calls = document.querySelector('[data-calls]')!
    expect(calls.textContent).toBe(`You chose${CALL_LABEL[SCENARIOS.S1.key]}✓defensible`)
    expect(within(calls as HTMLElement).queryByText('Defensible call')).toBeNull()
  })

  it('the evidence is marked on the card itself, with its callout', () => {
    seed(MIXED)
    app('/readout/3') // S5: the broken split
    for (const e of SCENARIOS.S5.evidence) expect(screen.getByText(e.callout)).toBeTruthy()
    expect(document.querySelector('[data-numbers-figs]')).toBeTruthy()
    expect(screen.getByText(/Sample-ratio check/)).toBeTruthy()
    cleanup()
    app('/readout/1') // S3: no sample-ratio line
    expect(screen.queryByText(/Sample-ratio check/)).toBeNull()
  })

  it('the index marks this page and every call ✓/✗ in words', () => {
    seed(MIXED)
    app('/readout/4')
    const nav = screen.getByRole('navigation', { name: 'Your six results' })
    const links = within(nav).getAllByRole('link')
    expect(links).toHaveLength(7)
    expect(links[3]!.getAttribute('aria-current')).toBe('page')
    expect(links.filter((l) => l.getAttribute('aria-current')).length).toBe(1)
    expect(links.map((l) => (/not defensible/.test(l.textContent!) ? '✗' : /defensible/.test(l.textContent!) ? '✓' : '→'))).toEqual([
      '✗', '✓', '✗', '✗', '✗', '✓', '→',
    ])
  })

  it('← and → move between results; → on the last goes to Your readout; ← on the first stays', () => {
    seed(MIXED)
    app('/readout/1')
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(path()).toBe('/readout/1')
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(path()).toBe('/readout/2')
    expect(h1().textContent).toBe(`Result 2 · ${SCENARIOS.S1.shortTitle}`)
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(path()).toBe('/readout/1')
    cleanup()
    app('/readout/6')
    expect(screen.getByRole('link', { name: /See your readout/ }).getAttribute('href')).toBe('/readout/summary')
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(path()).toBe('/readout/summary')
  })

  it('arrows inside the framing toggle, or with a modifier (browser back), do not navigate', () => {
    seed(MIXED)
    app('/readout/2')
    fireEvent.keyDown(window, { key: 'ArrowRight', altKey: true })
    expect(path()).toBe('/readout/2')
    const radio = screen.getAllByRole('radio')[0]!
    fireEvent.keyDown(radio, { key: 'ArrowRight' })
    expect(path()).toBe('/readout/2')
    // Even a key event the toggle itself does not handle, if it comes from inside it.
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' })
    expect(path()).toBe('/readout/2')
  })

  it('the toggle flips only this card’s line; the next page opens on the framing the player saw', () => {
    seed(MIXED) // variant control → p-values
    app('/readout/2')
    expect(new Set(lines())).toEqual(new Set(['p_value']))
    fireEvent.click(screen.getByRole('radio', { name: /chance/ }))
    expect(new Set(lines())).toEqual(new Set(['chance_to_win']))
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(new Set(lines())).toEqual(new Set(['p_value']))
  })

  it('redirects: nothing finished → landing; a bad number → result 1; practice without a record → practice', () => {
    app('/readout/2')
    expect(path()).toBe('/')
    cleanup()
    seed(MIXED)
    for (const bad of ['0', '7', 'x', '1.5']) {
      app(`/readout/${bad}`)
      expect(path()).toBe('/readout/1')
      cleanup()
    }
    localStorage.clear()
    app('/practice/readout/1')
    expect(path()).toBe('/practice')
  })

  it('practice debrief: labelled practice, links stay under /practice/readout', () => {
    writePractice({ order: MEASURED_ORDER, answers: MIXED, finishedAt: new Date().toISOString(), framing: 'chance_to_win' })
    app('/practice/readout/1')
    expect(screen.getByText(/Debrief · Result 1 of 6 · Practice/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Next result/ }).getAttribute('href')).toBe('/practice/readout/2')
    expect(new Set(lines())).toEqual(new Set(['chance_to_win']))
  })
})

describe('your readout', () => {
  it('score, a six-cell strip in play order, at most three patterns, the calls table', () => {
    seed(MIXED)
    app('/readout/summary')
    expect(h1().textContent).toBe('2 of 6 defensible calls')
    const cells = [...document.querySelectorAll<HTMLElement>('[data-cell]')]
    expect(cells.map((c) => c.dataset.cell)).toEqual(['bad', 'good', 'bad', 'bad', 'bad', 'good'])
    expect(cells.map((c) => c.getAttribute('href'))).toEqual([1, 2, 3, 4, 5, 6].map((n) => `/readout/${n}`))
    const pats = document.querySelector('[data-patterns]')!.querySelectorAll('li')
    expect(pats.length).toBeGreaterThan(0)
    expect(pats.length).toBeLessThanOrEqual(3)
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('row')).toHaveLength(7)
    expect(screen.getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Result', 'Trap', 'Your call', 'Defensible call', 'Defensible?'])
  })

  it('many patterns triggered: only the three most costly are shown, in order', () => {
    // Ship everything except "don't trust" on S1: triggers significant-good, broken split, guardrail, early ×2,
    // over-caution, distrusting clean data.
    const worst = { ...Object.fromEntries(MEASURED_ORDER.map((id) => [id, 'ship'])), S1: 'distrust' } as Record<ScenarioId, Call>
    const all = patterns(worst)
    expect(all.length).toBeGreaterThan(3)
    seed(worst)
    app('/readout/summary')
    const shown = [...document.querySelector('[data-patterns]')!.querySelectorAll('li > p:first-child')].map((p) => p.textContent)
    expect(shown).toEqual(all.slice(0, 3).map((p) => p.title))
  })

  it('UX-1: every pattern shown on the readout ends with the Rule to apply next time, linked to it', () => {
    const worst = { ...Object.fromEntries(MEASURED_ORDER.map((id) => [id, 'ship'])), S1: 'distrust' } as Record<ScenarioId, Call>
    seed(worst)
    app('/readout/summary')
    const items = [...document.querySelector('[data-patterns]')!.querySelectorAll('li')]
    expect(items).toHaveLength(3)
    for (const li of items) {
      const rule = li.querySelector('[data-pattern-rule]')
      expect(rule, li.textContent ?? '').not.toBeNull()
      const n = Number(rule!.getAttribute('data-pattern-rule'))
      const a = rule!.querySelector('a')!
      expect(a.getAttribute('href')).toBe(`/rules#rule-${n}`)
      expect(a.textContent).toBe(`Rule ${n}, ${RULES[n - 1]!.title}`)
    }
  })

  it('UX-1: every pattern the scoring can produce has a Rule, and it is one the pattern’s result tests', () => {
    // Every answer combination on the results the patterns read covers every pattern id.
    const ids = new Set<string>()
    for (const s1 of CALLS) for (const s2 of CALLS) for (const s3 of CALLS) for (const s5 of CALLS) for (const s6 of CALLS) {
      const a = { S1: s1, S2: s2, S3: s3, S4: 'ship', S5: s5, S6: s6 } as Record<ScenarioId, Call>
      for (const p of patterns(a)) ids.add(p.id)
    }
    expect(ids.size).toBeGreaterThanOrEqual(8)
    for (const id of ids) expect(PATTERN_RULES[id], id).toBeGreaterThanOrEqual(1)
    const testedBy = (s: ScenarioId) => SCENARIOS[s].rules
    expect(testedBy('S2')).toContain(PATTERN_RULES['significant-good'])
    expect(testedBy('S5')).toContain(PATTERN_RULES['broken-split'])
    expect(testedBy('S6')).toContain(PATTERN_RULES.guardrail)
    expect(testedBy('S1')).toContain(PATTERN_RULES['over-caution'])
    expect(testedBy('S4')).toContain(PATTERN_RULES.early)
  })

  it('6 of 6: the all-defensible message instead of patterns', () => {
    seed(PERFECT)
    app('/readout/summary')
    expect(h1().textContent).toBe('6 of 6 defensible calls')
    expect(screen.getByText(ALL_DEFENSIBLE_TEXT)).toBeTruthy()
    expect(document.querySelector('[data-patterns]')).toBeNull()
  })

  it('share text is neutral: score and link only, never the framing or answers', () => {
    seed(MIXED)
    app('/readout/summary')
    const t = document.querySelector('[data-share]')!.textContent!
    expect(t).toBe(`I made 2 of 6 defensible calls on six A/B test results. Would you ship it? ${window.location.origin}/?ref=share`)
    expect(t).not.toMatch(/p-value|chance|control|variant|ship the|framing/i)
  })

  it('Copy as Markdown copies the Rules and reports M5 once per copy', async () => {
    seed(MIXED)
    app('/readout/summary')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy as Markdown' })))
    expect(writeText).toHaveBeenCalledWith(rulesMarkdown())
    expect(m5).toHaveBeenCalledTimes(1)
  })

  it('a blocked clipboard does not report M5', async () => {
    writeText.mockRejectedValueOnce(new Error('denied'))
    seed(MIXED)
    app('/readout/summary')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy as Markdown' })))
    expect(m5).not.toHaveBeenCalled()
  })
})

describe('rules page', () => {
  it('six rules in order, each with an anchor; the Calls line; both copy buttons', async () => {
    app('/rules')
    const list = screen.getByRole('list', { name: 'The six rules' })
    const items = within(list).getAllByRole('listitem')
    expect(items.map((li) => li.id)).toEqual(RULES.map((r) => `rule-${r.n}`))
    expect(items.map((li) => within(li).getByRole('heading').textContent!.replace('#', ''))).toEqual(RULES.map((r) => r.title))
    const calls = document.querySelector('[data-calls-line]')!.textContent!
    for (const c of CALLS_LINE) expect(calls).toContain(`${c.when} → ${c.call}`)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy review template' })))
    expect(writeText).toHaveBeenLastCalledWith(REVIEW_TEMPLATE)
    expect(m5).not.toHaveBeenCalled() // the template is not the Rules
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy as Markdown' })))
    expect(writeText).toHaveBeenLastCalledWith(rulesMarkdown())
    expect(m5).toHaveBeenCalledTimes(1)
  })

  it('the ladder says exactly what the Calls line says', () => {
    const byRule: Record<number, string> = { 1: 'fails 1', 2: 'fails 2', 3: 'fails 3 or 5', 4: 'crosses zero at full sample', 5: 'fails 3 or 5', 6: 'passes all six' }
    expect(LADDER.map((r) => r.n)).toEqual([1, 2, 3, 4, 5, 6])
    for (const r of LADDER) {
      const c = CALLS_LINE.find((x) => x.when === byRule[r.n])!
      expect(r.exit.toLowerCase()).toBe(c.call.toLowerCase())
    }
    app('/rules')
    const svg = document.querySelector('[data-ladder]')!
    expect(svg.getAttribute('role')).toBe('img')
    expect(svg.querySelector('title')!.textContent).toBe('Decision ladder')
    expect(screen.getByRole('list', { name: 'Decision ladder' })).toBeTruthy()
  })

  it.each(['#rule-3', '#3'])('a link to %s marks rule 3 briefly', async (hash) => {
    vi.useFakeTimers()
    try {
      app(`/rules${hash}`)
      const lit = () => [...document.querySelectorAll('[data-rule]')].filter((e) => e.className.includes('bg-accent-wash')).map((e) => (e as HTMLElement).dataset.rule)
      expect(lit()).toEqual(['3'])
      act(() => vi.advanceTimersByTime(1600))
      expect(lit()).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it('traps link to their rule', () => {
    app('/rules')
    const sec = screen.getByRole('region', { name: /Six ways/ })
    expect(within(sec).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['#rule-3', '#rule-2', '#rule-2', '#rule-1', '#rule-5', '#rule-6'])
  })
})

