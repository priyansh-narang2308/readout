/**
 * The flip (25 §5, 26 §8.4) on its timeline, with fake timers: what shows when, skip, the toggle, the flag line,
 * stamps and score, the live summary, and where it sends a player with nothing to reveal.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MEASURED_ORDER, SCENARIOS, type Call } from '../content/scenarios.v1'
import { KEYS, lockCall, newAttempt, withStatus, writeAttempt, writePractice } from '../run/attemptStore'
import { buildPayload, type StudyDeps } from '../run/controller'
import { StudyProvider } from '../run/StudyContext'
import { FLIP_AT, FlipRoute } from './Readout'

const UID = '11111111-2222-4333-8444-555555555555'
// One defensible call (on the first result in MEASURED_ORDER); the rest wrong.
const wrong = (k: Call): Call => (k === 'ship' ? 'control' : 'ship')
const ANSWERS = Object.fromEntries(MEASURED_ORDER.map((id, i) => [id, i === 0 ? SCENARIOS[id].key : wrong(SCENARIOS[id].key)]))

const deps = (): StudyDeps => ({
  enrol: vi.fn(),
  init: vi.fn(async () => undefined),
  sendScores: vi.fn(async () => 'sent' as const),
  resend: vi.fn(async () => 'none' as const),
  envName: () => 'development',
  storageOk: () => true,
})

function seedFinished(variant: 'control' | 'chance_to_win') {
  let a = newAttempt({ uid: UID, variant, experimentId: 42, envName: 'development' })
  for (const id of MEASURED_ORDER) a = lockCall(a, id, ANSWERS[id] as Call, 1000)
  a = withStatus(a, 'scored_pending', { scoredAt: new Date().toISOString(), payload: buildPayload(a, null) })
  a = withStatus(a, 'sent_1', { delivery: { send1: 'ok' } })
  writeAttempt(a)
  localStorage.setItem(KEYS.uid, UID)
}

function Path() {
  return <output data-testid="path">{useLocation().pathname}</output>
}
function app(at: string) {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <StudyProvider deps={deps()}>
        <Routes>
          <Route path="/readout" element={<FlipRoute kind="measured" />} />
          <Route path="/practice/readout" element={<FlipRoute kind="practice" />} />
          <Route path="*" element={<p>elsewhere</p>} />
        </Routes>
        <Path />
      </StudyProvider>
    </MemoryRouter>,
  )
}

// Seven lines: one result also shows a guardrail metric, with its own inference line.
const LINES = MEASURED_ORDER.reduce((n, id) => n + 1 + (SCENARIOS[id].guardrail ? 1 : 0), 0)
const lines = () => [...document.querySelectorAll<HTMLElement>('[data-inference]')].map((p) => p.dataset.inference)
const stamps = () => [...document.querySelectorAll<HTMLElement>('[data-stamp]')].map((s) => s.dataset.stamp)
const shown = (el: Element | null) => !el!.closest('[aria-hidden="true"]')
const at = (ms: number) => act(() => vi.advanceTimersByTime(ms))
const live = () => document.querySelector('[aria-live="polite"]')!.textContent

let mm: typeof window.matchMedia | undefined
const setReduced = (on: boolean) => {
  window.matchMedia = ((q: string) => ({ matches: on && q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  mm = window.matchMedia
  setReduced(false)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  window.matchMedia = mm!
})

describe('the flip, measured', () => {
  it('runs on its timeline: seen framing first, then all six lines flip, then sentence, stamps, score, actions', () => {
    seedFinished('control')
    app('/readout')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('You saw p-values.')
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }))
    expect(lines()).toEqual(Array(LINES).fill('p_value'))
    expect(stamps()).toEqual(Array(6).fill('neutral'))
    const score = document.querySelector('[data-score]')
    expect(shown(score)).toBe(false)
    expect(shown(screen.getByText(/Half of everyone/))).toBe(false)
    expect(live()).toBe('')

    at(FLIP_AT.sub)
    expect(shown(screen.getByText(/Half of everyone/))).toBe(true)
    at(FLIP_AT.flip - FLIP_AT.sub) // jsdom has no Element.animate: each line swaps at once when its turn comes
    expect(lines()).toEqual(Array(LINES).fill('chance_to_win'))
    expect(shown(document.querySelector('[data-flag-line]'))).toBe(false)
    at(FLIP_AT.sentence - FLIP_AT.flip)
    expect(shown(document.querySelector('[data-flag-line]'))).toBe(true)
    expect(stamps()).toEqual(Array(6).fill('neutral'))
    at(FLIP_AT.stamps - FLIP_AT.sentence)
    expect(stamps()).toEqual(['good', 'bad', 'bad', 'bad', 'bad', 'bad'])
    expect(shown(score)).toBe(false)
    at(FLIP_AT.score - FLIP_AT.stamps)
    expect(shown(score)).toBe(true)
    expect(score!.textContent).toBe('1 of 6 defensible calls.')
    expect(screen.queryByRole('radiogroup')).toBeNull()
    at(FLIP_AT.actions - FLIP_AT.score)
    expect(screen.getByRole('radiogroup', { name: 'Show the inference line as' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Skip to the end/ })).toBeNull()
    expect(live()).toBe('You saw p-values. The other version showed chance to beat control. 1 of 6 defensible calls.')
  })

  it('names the real flag and the variant Flagsmith served', () => {
    seedFinished('chance_to_win')
    app('/readout')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('You saw chance to beat control.')
    expect(document.querySelector('[data-flag-line]')!.textContent).toBe(
      'flag readout_framing· your variant chance_to_win· served by Flagsmith',
    )
  })

  it('wrong calls show the defensible one once stamps resolve; right calls do not', () => {
    seedFinished('control')
    app('/readout')
    at(FLIP_AT.actions)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(6)
    expect(items[0]!.textContent).not.toMatch(/→/)
    for (const li of items.slice(1)) expect(li.textContent).toMatch(/→/)
    expect(items[1]!.getAttribute('aria-label')).toMatch(/defensible call/)
  })

  it.each([' ', 'Enter'])('%j skips straight to the end state', (key) => {
    seedFinished('control')
    app('/readout')
    at(200)
    fireEvent.keyDown(window, { key })
    expect(lines()).toEqual(Array(LINES).fill('chance_to_win'))
    expect(stamps()).toContain('good')
    expect(shown(document.querySelector('[data-score]'))).toBe(true)
    expect(screen.getByRole('radiogroup')).toBeTruthy()
    // Nothing from the cancelled timeline fires later and drags the page back.
    at(FLIP_AT.sub)
    expect(screen.getByRole('radiogroup')).toBeTruthy()
    at(FLIP_AT.actions)
    expect(lines()).toEqual(Array(LINES).fill('chance_to_win'))
  })

  it('the Skip button does the same; after the end, Enter no longer skips (it belongs to the buttons)', () => {
    seedFinished('control')
    app('/readout')
    fireEvent.click(screen.getByRole('button', { name: /Skip to the end/ }))
    expect(screen.getByRole('radiogroup')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { checked: false }))
    expect(lines()).toEqual(Array(LINES).fill('p_value'))
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(lines()).toEqual(Array(LINES).fill('p_value'))
  })

  it('the toggle flips all six lines both ways', () => {
    seedFinished('control')
    app('/readout')
    at(FLIP_AT.actions)
    const [a, b] = screen.getAllByRole('radio')
    fireEvent.click(a!.getAttribute('aria-checked') === 'true' ? b! : a!)
    expect(lines()).toEqual(Array(LINES).fill('p_value'))
    fireEvent.click(screen.getByRole('radio', { checked: false }))
    expect(lines()).toEqual(Array(LINES).fill('chance_to_win'))
  })

  it('actions: walk through goes to result 1, the other link to the summary', () => {
    seedFinished('control')
    app('/readout')
    at(FLIP_AT.actions)
    expect(screen.getByRole('link', { name: 'Skip to your readout' }).getAttribute('href')).toBe('/readout/summary')
    fireEvent.click(screen.getByRole('button', { name: 'Walk through your six calls' }))
    expect(screen.getByTestId('path').textContent).toBe('/readout/1')
  })

  it('reduced motion: the end state at once, no timeline', () => {
    setReduced(true)
    seedFinished('control')
    app('/readout')
    expect(lines()).toEqual(Array(LINES).fill('chance_to_win'))
    expect(shown(document.querySelector('[data-score]'))).toBe(true)
    expect(screen.getByRole('radiogroup')).toBeTruthy()
  })

  it('nothing finished: back to the landing page', () => {
    app('/readout')
    expect(screen.getByTestId('path').textContent).toBe('/')
  })
})

describe('the flip, practice', () => {
  it('practice copy, no variant claimed, and no practice record sends you to practice', () => {
    app('/practice/readout')
    expect(screen.getByTestId('path').textContent).toBe('/practice')
    cleanup()
    writePractice({ order: MEASURED_ORDER, answers: ANSWERS, finishedAt: new Date().toISOString(), framing: 'chance_to_win' })
    app('/practice/readout')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('This was a practice run.')
    expect(document.querySelector('[data-flag-line]')!.textContent).not.toMatch(/your variant/)
    expect(lines()).toEqual(Array(LINES).fill('chance_to_win'))
    at(FLIP_AT.actions)
    expect(lines()).toEqual(Array(LINES).fill('p_value'))
    expect(live()).toMatch(/^This was a practice run\. The other version shows p-values\./)
  })
})
