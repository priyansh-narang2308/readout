/**
 * Team guide and presenter (25 §9, 26 §8.8–8.9) and About (25 §10, 26 §8.11, 34 §4.3–4.4).
 * The presenter and About never talk to Flagsmith; M5 (Rules copy on /team) is mocked and its wire path is in
 * integration.test.tsx.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OUTCOMES, NEVER_SAY } from '../content/outcomes'
import { DISCLOSED_EVENTS, DISCLOSED_METADATA, SDK_METADATA } from '../content/privacy'
import { REVIEW_TEMPLATE, RULES, rulesMarkdown } from '../content/rules'
import { CALL_LABEL, MEASURED_ORDER, SCENARIOS, type Call } from '../content/scenarios.v1'
import { TEAM_PRIVACY_NOTE, TEAM_STEPS, inviteMessage } from '../content/team'
import { KEYS, lockCall, newAttempt, withStatus, writeAttempt, writePractice } from '../run/attemptStore'
import { buildPayload, type StudyDeps } from '../run/controller'
import { StudyProvider } from '../run/StudyContext'
import { AboutRoute } from './About'
import { PresenterRoute, TeamRoute } from './Team'

const m5 = vi.fn(async () => true)
vi.mock('../flagsmith/measurement', () => ({ trackRulesCopied: () => m5() }))

const d: StudyDeps = {
  enrol: vi.fn(),
  init: vi.fn(async () => undefined),
  sendScores: vi.fn(async () => 'sent' as const),
  resend: vi.fn(async () => 'none' as const),
  envName: () => 'development',
  storageOk: () => true,
}

function Path() {
  const l = useLocation()
  return <output data-testid="path">{l.pathname + l.search}</output>
}
function app(at: string) {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <StudyProvider deps={d}>
        <Routes>
          <Route path="/team" element={<TeamRoute />} />
          <Route path="/team/present" element={<PresenterRoute />} />
          <Route path="/about" element={<AboutRoute />} />
          <Route path="*" element={<p>elsewhere</p>} />
        </Routes>
        <Path />
      </StudyProvider>
    </MemoryRouter>,
  )
}
const path = () => screen.getByTestId('path').textContent
const writeText = vi.fn(async (_: string) => undefined)
const key = (k: string, o: Partial<KeyboardEventInit> = {}) => fireEvent.keyDown(window, { key: k, ...o })
const lines = () => new Set([...document.querySelectorAll<HTMLElement>('[data-inference]')].map((p) => p.dataset.inference))

beforeEach(() => {
  localStorage.clear()
  m5.mockClear()
  writeText.mockClear()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})
afterEach(() => cleanup())

describe('team guide', () => {
  it('invite link tagged ref=team, the four timed steps, presenter link, privacy note', async () => {
    app('/team')
    const url = `${window.location.origin}/?ref=team`
    expect(document.querySelector('[data-invite-url]')!.textContent).toBe(url)
    expect(screen.getAllByRole('row')).toHaveLength(TEAM_STEPS.length + 1)
    expect(screen.getAllByRole('rowheader').map((r) => r.textContent)).toEqual(TEAM_STEPS.map((s) => s.step))
    // Table (desktop) and minute blocks (phones) both carry it; CSS shows one.
    expect(screen.getAllByText(new RegExp(`open this link on your own device: ${url.replace(/[.?/]/g, '\\$&')}`))).toHaveLength(2)
    expect(screen.getByRole('link', { name: /Open presenter view/ }).getAttribute('href')).toBe('/team/present')
    expect(document.querySelector('[data-team-privacy]')!.textContent).toBe(TEAM_PRIVACY_NOTE)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy invite message' })))
    expect(writeText).toHaveBeenLastCalledWith(inviteMessage(window.location.origin))
    expect(inviteMessage('https://x.test')).toContain('https://x.test/?ref=team')
  })

  it('adopt the rules: copying the Rules reports M5, the template does not', async () => {
    app('/team')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy review template' })))
    expect(writeText).toHaveBeenLastCalledWith(REVIEW_TEMPLATE)
    expect(m5).not.toHaveBeenCalled()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy the Rules' })))
    expect(writeText).toHaveBeenLastCalledWith(rulesMarkdown())
    expect(m5).toHaveBeenCalledTimes(1)
  })
})

describe('presenter view', () => {
  const callsShown = () => [...document.querySelectorAll<HTMLElement>('[data-call]')].map((c) => c.dataset.call)
  const keyCall = () => document.querySelector<HTMLElement>('[data-key]')?.dataset.call ?? null

  it('the six results in the measured order; ← → move, and stop at the ends', () => {
    app('/team/present')
    const title = () => screen.getByRole('heading', { level: 1 }).textContent
    expect(title()).toBe(`Presenter view, result 1 of 6: ${SCENARIOS[MEASURED_ORDER[0]!].title}`)
    key('ArrowLeft')
    expect(path()).toBe('/team/present')
    for (let i = 2; i <= 6; i++) {
      key('ArrowRight')
      expect(path()).toBe(`/team/present?r=${i}`)
      expect(title()).toBe(`Presenter view, result ${i} of 6: ${SCENARIOS[MEASURED_ORDER[i - 1]!].title}`)
    }
    key('ArrowRight')
    expect(path()).toBe('/team/present?r=6')
    expect(document.querySelector('[data-position]')!.textContent).toBe('Result 6 of 6')
  })

  it('F flips the inference line, R reveals the defensible call, the trap and the evidence; moving hides it again', () => {
    app('/team/present?r=2')
    const s = SCENARIOS[MEASURED_ORDER[1]!]
    expect(lines()).toEqual(new Set(['p_value']))
    key('f')
    expect(lines()).toEqual(new Set(['chance_to_win']))
    key('F')
    expect(lines()).toEqual(new Set(['p_value']))
    expect(callsShown()).toHaveLength(4)
    expect(keyCall()).toBeNull()
    expect(screen.queryByText(s.evidence[0]!.callout)).toBeNull()
    key('r')
    expect(keyCall()).toBe(s.key)
    for (const e of s.evidence) expect(screen.getByText(e.callout)).toBeTruthy()
    expect(document.querySelector('[data-announce]')!.textContent).toBe(`Defensible call: ${CALL_LABEL[s.key]}. The trap: ${s.trap.name}. ${s.rules.map((r) => `Rule ${r}`).join(' and ')}.`)
    key('ArrowRight')
    expect(keyCall()).toBeNull()
    expect(document.querySelector('[data-announce]')!.textContent).toBe('')
  })

  it('UX-2: on every result, the reveal names the Rule that catches the trap, the one the team adopts in step 3', () => {
    for (const [i, id] of MEASURED_ORDER.entries()) {
      cleanup()
      app(`/team/present?r=${i + 1}`)
      key('r')
      const s = SCENARIOS[id]
      const line = document.querySelector('[data-presenter-rule]')!
      expect(line.textContent).toBe(`The rule that catches it: ${s.rules.map((r) => `Rule ${r}, ${RULES[r - 1]!.title}`).join(' and ')}`)
    }
  })

  it('every key has a button; modifiers are left to the browser; Esc goes back to /team', () => {
    app('/team/present')
    const nav = screen.getByRole('navigation', { name: 'Presenter controls' })
    fireEvent.click(within(nav).getByRole('button', { name: 'Next result' }))
    expect(path()).toBe('/team/present?r=2')
    fireEvent.click(within(nav).getByRole('button', { name: /Flip/ }))
    expect(lines()).toEqual(new Set(['chance_to_win']))
    fireEvent.click(within(nav).getByRole('button', { name: /Reveal/ }))
    expect(within(nav).getByRole('button', { name: /Hide/ }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(within(nav).getByRole('button', { name: 'Previous result' }))
    expect(path()).toBe('/team/present?r=1')
    expect(within(nav).getByRole('button', { name: 'Previous result' })).toHaveProperty('disabled', true)
    key('r', { metaKey: true })
    expect(keyCall()).toBeNull()
    key('Escape')
    expect(path()).toBe('/team')
  })

  it('a bad ?r falls back to result 1; nothing is sent to Flagsmith', () => {
    app('/team/present?r=9')
    expect(document.querySelector('[data-position]')!.textContent).toBe('Result 1 of 6')
    expect(d.init).not.toHaveBeenCalled()
    expect(d.enrol).not.toHaveBeenCalled()
  })
})

function seedFinished() {
  let a = newAttempt({ uid: '11111111-2222-4333-8444-555555555555', variant: 'control', experimentId: 42, envName: 'development' })
  for (const id of MEASURED_ORDER) a = lockCall(a, id, SCENARIOS[id].key as Call, 1000)
  a = withStatus(a, 'scored_pending', { scoredAt: new Date().toISOString(), payload: buildPayload(a, null) })
  writeAttempt(withStatus(a, 'sent_1', { delivery: { send1: 'ok' } }))
  localStorage.setItem(KEYS.uid, a.uid)
}

describe('about', () => {
  it('privacy lists exactly the disclosed events and metadata', () => {
    app('/about')
    const box = document.querySelector('[data-disclosed]')!
    const codes = [...box.querySelectorAll('code')].map((c) => c.textContent)
    for (const e of DISCLOSED_EVENTS) expect(codes).toContain(e)
    for (const m of [...DISCLOSED_METADATA, ...SDK_METADATA]) expect(codes).toContain(m)
    expect(codes.filter((c) => c !== 'readout_framing').sort()).toEqual([...DISCLOSED_EVENTS, ...DISCLOSED_METADATA, ...SDK_METADATA].sort())
    expect(box.textContent).toContain('$flag_exposure (feature readout_framing, value = the version shown)')
    expect(screen.getByText(/Clear your site data to remove the ID/)).toBeTruthy()
  })

  it('spoiler guard: before playing, the study is folded and nothing outside it says what is tested', () => {
    app('/about')
    const spoiler = document.querySelector<HTMLDetailsElement>('[data-spoiler]')!
    expect(spoiler.open).toBe(false)
    expect(within(spoiler).getByText('Show what we’re testing (spoiler)')).toBeTruthy()
    const outside = document.body.cloneNode(true) as HTMLElement
    outside.querySelector('[data-spoiler]')!.remove()
    expect(outside.textContent).not.toMatch(/chance|hypothes|p-value|_to_win/i)
  })

  it.each([
    ['a finished measured run', seedFinished],
    ['a finished practice run', () => writePractice({ order: MEASURED_ORDER, answers: Object.fromEntries(MEASURED_ORDER.map((id) => [id, SCENARIOS[id].key])), finishedAt: new Date().toISOString(), framing: 'p_value' })],
  ])('after %s the study is open, with no spoiler warning', (_, seed) => {
    seed()
    app('/about')
    const spoiler = document.querySelector<HTMLDetailsElement>('[data-spoiler]')!
    expect(spoiler.open).toBe(true)
    expect(within(spoiler).queryByText(/Play first/)).toBeNull()
  })

  it('the outcomes, decided before data, follow the Rules order and never use banned words', () => {
    app('/about')
    const items = [...document.querySelector('[data-outcomes]')!.querySelectorAll('li')]
    expect(items).toHaveLength(OUTCOMES.length)
    expect(OUTCOMES.map((o) => o.rule)).toEqual([1, 2, 5, 3, 4, 6])
    for (const o of OUTCOMES) {
      const text = `${o.when} ${o.decision} ${o.wording}`.toLowerCase()
      for (const w of NEVER_SAY) expect(text.includes(`“${w}”`) || !text.includes(w)).toBe(true)
    }
  })

  it('external links open in a new tab and say so; no repo, no dead links', () => {
    app('/about')
    const ext = [...document.querySelectorAll<HTMLAnchorElement>('a[target="_blank"]')]
    expect(ext.length).toBeGreaterThan(0)
    for (const a of ext) {
      expect(a.rel).toBe('noopener noreferrer')
      expect(a.textContent).toMatch(/opens in a new tab/)
      expect(a.href).toMatch(/^https:\/\/docs\.flagsmith\.com\//)
    }
  })
})
