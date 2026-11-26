/**
 * Task 31, AC-9 at page level. The card-level T-INVARIANT (ResultCard.test) proves the card differs only in its
 * inference line. This proves the whole measured page does: the real /challenge route (run header, progress, card,
 * decision bar, live regions, page title) rendered for each arm at each of the six positions, with the text inside
 * [data-inference] removed, is byte-identical. Anything arm-dependent anywhere else on the page fails it.
 */
import { act, cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../app/App'
import { MEASURED_ORDER, SCENARIOS, type Call } from '../content/scenarios.v1'
import type { GateResult } from '../flagsmith/client'
import { KEYS, lockCall, newAttempt, writeAttempt, type Variant } from '../run/attemptStore'
import type { StudyDeps } from '../run/controller'
import { StudyProvider } from '../run/StudyContext'

vi.mock('../flagsmith/MeasuredSession', () => ({ MeasuredSession: () => null }))

const UID = '11111111-2222-4333-8444-555555555555'
const CALLS6: Call[] = ['ship', 'control', 'collecting', 'distrust', 'ship', 'control']
const ENROLLED: GateResult = { enrolled: true, variant: 'control', experimentId: 42, experimentName: 'x', value: 'x' }
const deps = (): StudyDeps => ({
  enrol: vi.fn(async () => ENROLLED),
  init: vi.fn(async () => undefined),
  sendScores: vi.fn(async () => 'sent' as const),
  resend: vi.fn(async () => 'none' as const),
  envName: () => 'development',
  storageOk: () => true,
})

type Page = { masked: string; lines: string[]; title: string; attempt: string }

async function page(variant: Variant, at: number): Promise<Page> {
  localStorage.clear()
  localStorage.setItem(KEYS.uid, UID)
  let a = newAttempt({ uid: UID, variant, experimentId: 42, envName: 'development' })
  for (let i = 0; i < at; i++) a = lockCall(a, MEASURED_ORDER[i]!, CALLS6[i]!, 1000)
  // Same id and start time in both arms, so the only difference in storage is the arm itself.
  a = { ...a, id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', startedAt: '2026-11-15T10:00:00.000Z' }
  writeAttempt(a)
  await act(async () => {
    render(
      <MemoryRouter initialEntries={['/challenge']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <StudyProvider deps={deps()}>
          <AppRoutes />
        </StudyProvider>
      </MemoryRouter>,
    )
  })
  const clone = document.body.cloneNode(true) as HTMLElement
  const lines = [...document.querySelectorAll('[data-inference]')].map((n) => n.textContent ?? '')
  clone.querySelectorAll('[data-inference]').forEach((n) => {
    n.removeAttribute('data-inference')
    n.innerHTML = ''
  })
  // React's useId counter keeps running across renders in one test file (r0, r1, …): the only generated id is the
  // card title's, so it is named by position. Any other difference is real.
  const masked = clone.innerHTML.replace(/rc-title-r[0-9a-z]+/g, 'rc-title-ID')
  const out = { masked, lines, title: document.title, attempt: localStorage.getItem(KEYS.attempt)! }
  cleanup()
  return out
}

beforeEach(() => localStorage.clear())
afterEach(() => cleanup())

describe('AC-9: the measured page differs between arms only inside the inference line', () => {
  it.each(MEASURED_ORDER.map((id, i) => [i + 1, id] as const))('result %i (%s)', async (n, id) => {
    const p = await page('control', n - 1)
    const c = await page('chance_to_win', n - 1)

    // The right card is on screen, in the run, not practice.
    expect(p.masked).toContain(SCENARIOS[id].title)
    expect(p.masked).not.toMatch(/Practice · not part of the study/)

    expect(c.masked).toBe(p.masked)
    expect(c.title).toBe(p.title)

    // The masked lines are the experiment, and only they differ.
    expect(p.lines.length).toBe(SCENARIOS[id].guardrail ? 2 : 1)
    expect(c.lines.length).toBe(p.lines.length)
    p.lines.forEach((t) => expect(t).toMatch(/^p-value/))
    c.lines.forEach((t) => expect(t).toMatch(/^Chance to beat control/))

    // Nothing outside the lines names either framing (a leak would survive masking only if it matched in both arms).
    expect(p.masked).not.toMatch(/p-value|chance to beat|chance_to_win|control arm/i)
  })
})
