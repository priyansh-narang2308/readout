/**
 * Task 29: the Development debug panel (28 §10 V-2…V-5, §11). It shows real state only (gate, flag, attempt, the
 * identity and what was observed on the wire), never the key itself, and renders nothing in production.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GateResult } from '../../flagsmith/client'
import { __resetDeliveryMonitor, createMonitoredFetch } from '../../flagsmith/deliveryMonitor'
import { KEYS, newAttempt, writeAttempt } from '../../run/attemptStore'
import { DebugPanel } from './DebugPanel'

let gate: GateResult | null = null
vi.mock('../../run/StudyContext', () => ({ useStudy: () => ({ gate }) }))

const UID = '11111111-2222-4333-8444-555555555555'
const KEY = 'ser.dev-key-should-never-render-1234'
const EVENTS = 'https://events.api.flagsmith.com/v1/events'

beforeEach(() => {
  localStorage.clear()
  __resetDeliveryMonitor()
  gate = null
  vi.stubEnv('VITE_FLAGSMITH_ENV_KEY', KEY)
  vi.stubEnv('VITE_FLAGSMITH_ENV_NAME', 'development')
})
afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

const open = () => {
  fireEvent.click(screen.getByRole('button', { name: 'DEV' }))
  return screen.getByRole('region', { name: 'Development debug panel' })
}

describe('debug panel (Development only)', () => {
  it('renders nothing at all in a production build', () => {
    vi.stubEnv('VITE_FLAGSMITH_ENV_NAME', 'production')
    const { container } = render(<DebugPanel />)
    expect(container.innerHTML).toBe('')
  })

  it('is closed until asked, then says which environment and whether a key is set, never the key', () => {
    render(<DebugPanel />)
    const btn = screen.getByRole('button', { name: 'DEV' })
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('region')).toBeNull()
    const panel = open()
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    expect(panel.textContent).toContain('env: development · key: set')
    expect(document.body.innerHTML).not.toContain(KEY)
    vi.stubEnv('VITE_FLAGSMITH_ENV_KEY', '')
    cleanup()
    render(<DebugPanel />)
    expect(open().textContent).toContain('key: missing')
  })

  it('V-2: shows the gate result, enrolled with variant and experiment id, or the practice reason', () => {
    gate = { enrolled: true, variant: 'chance_to_win', experimentId: 42, experimentName: 'x', value: 'chance_to_win' }
    render(<DebugPanel />)
    expect(open().textContent).toContain('gate: enrolled · chance_to_win · exp 42')
    cleanup()
    gate = { enrolled: false, reason: 'not-in-experiment' }
    render(<DebugPanel />)
    expect(open().textContent).toContain('gate: practice · not-in-experiment')
  })

  it('V-5: shows the stored identity and the attempt (status, arm, progress, delivery)', () => {
    localStorage.setItem(KEYS.uid, UID)
    writeAttempt(newAttempt({ uid: UID, variant: 'control', experimentId: 42, envName: 'development' }))
    render(<DebugPanel />)
    const panel = open()
    expect(within(panel).getByText(`identity: ${UID}`)).toBeTruthy()
    expect(panel.textContent).toContain('attempt: in_progress · control · 0/6 · send1 — · send2 —')
  })

  it('V-4/V-6: shows what was observed on the wire: the exposure outcome and each events POST with its status', async () => {
    localStorage.setItem(KEYS.uid, UID)
    render(<DebugPanel />)
    expect(open().querySelector('[data-debug-exposure]')!.textContent).toBe('exposure: not sent')
    const post = createMonitoredFetch(async () => new Response('', { status: 202 }))
    await post(EVENTS, { body: JSON.stringify({ events: [{ event: '$flag_exposure', identifier: UID }] }) })
    const panel = screen.getByRole('region')
    expect(panel.querySelector('[data-debug-exposure]')!.textContent).toBe('exposure: ok')
    expect(panel.textContent).toMatch(/· 202 · \$flag_exposure/)
    expect([...panel.querySelectorAll('p')].some((p) => p.textContent === 'none')).toBe(false)
  })
})
