/**
 * Landing and the two runs, driven like a player: clicks and keys, with a fake Flagsmith layer. MeasuredSession is
 * replaced by a stub that records where it mounts (the real one is covered on the wire in integration.test.tsx).
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MEASURED_ORDER, type Call } from '../content/scenarios.v1'
import type { GateResult } from '../flagsmith/client'
import { KEYS, loadAttempt, lockCall, newAttempt, readPractice, withStatus, writeAttempt } from '../run/attemptStore'
import { buildPayload, type StudyDeps } from '../run/controller'
import { StudyProvider } from '../run/StudyContext'
import { Landing } from './Landing'
import { ChallengeRoute, PracticeRoute } from './Run'

const mounts: string[] = []
vi.mock('../flagsmith/MeasuredSession', () => ({
  MeasuredSession: ({ persistedVariant }: { persistedVariant: string }) => {
    mounts.push(persistedVariant)
    return null
  },
}))

const UID = '11111111-2222-4333-8444-555555555555'
const CALLS6: Call[] = ['ship', 'control', 'collecting', 'distrust', 'ship', 'control']
const ENROLLED: GateResult = { enrolled: true, variant: 'chance_to_win', experimentId: 42, experimentName: 'x', value: 'x' }

function deps(over: Partial<StudyDeps> = {}): StudyDeps {
  return {
    enrol: vi.fn(async () => ENROLLED),
    init: vi.fn(async () => undefined),
    sendScores: vi.fn(async () => 'sent' as const),
    resend: vi.fn(async () => 'none' as const),
    envName: () => 'development',
    storageOk: () => true,
    ...over,
  }
}

function Path() {
  return <output data-testid="path">{useLocation().pathname}</output>
}

function app(d: StudyDeps, at = '/') {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <StudyProvider deps={d}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/challenge" element={<ChallengeRoute />} />
          <Route path="/practice" element={<PracticeRoute />} />
          <Route path="*" element={<p>elsewhere</p>} />
        </Routes>
        <Path />
      </StudyProvider>
    </MemoryRouter>,
  )
}

const path = () => screen.getByTestId('path').textContent
const seedAttempt = (n: number, finished = false) => {
  let a = newAttempt({ uid: UID, variant: 'control', experimentId: 42, envName: 'development' })
  for (let i = 0; i < n; i++) a = lockCall(a, MEASURED_ORDER[i]!, CALLS6[i]!, 1000)
  if (finished) {
    a = withStatus(a, 'scored_pending', { scoredAt: new Date().toISOString(), payload: buildPayload(a, null) })
    a = withStatus(a, 'sent_1', { delivery: { send1: 'ok' } })
  }
  writeAttempt(a)
  localStorage.setItem(KEYS.uid, UID)
  return a
}

/** Select call n (1–4) with its key, then lock in with Enter, and wait for the next card. */
async function play(key: string) {
  fireEvent.keyDown(window, { key })
  fireEvent.keyDown(window, { key: 'Enter' })
  await act(() => new Promise((r) => setTimeout(r, 220)))
}

beforeEach(() => {
  localStorage.clear()
  mounts.length = 0
})
afterEach(() => cleanup())

describe('Landing', () => {
  it('new visitor: consent next to Start, no Flagsmith call, never an inference line', () => {
    const d = deps()
    app(d)
    expect(screen.getByText(/Before you start\./)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start the challenge' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Practise without being measured/ })).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/p-value|Chance to beat/)
    expect(d.enrol).not.toHaveBeenCalled()
    expect(d.init).not.toHaveBeenCalled()
    expect(mounts).toEqual([])
  })

  it('Start shows Preparing (busy, focus kept), then an enrolled player goes to the challenge', async () => {
    let answer!: (g: GateResult) => void
    const d = deps({ enrol: vi.fn(() => new Promise<GateResult>((r) => (answer = r))) })
    app(d)
    const b = screen.getByRole('button', { name: 'Start the challenge' })
    b.focus()
    fireEvent.click(b)
    await waitFor(() => expect(b.getAttribute('aria-busy')).toBe('true'))
    expect(b.textContent).toMatch(/Preparing your challenge/)
    fireEvent.click(b) // a second press shares the one Start in flight
    expect(d.enrol).toHaveBeenCalledTimes(1)
    await act(async () => answer(ENROLLED))
    await waitFor(() => expect(path()).toBe('/challenge'))
    expect(loadAttempt().kind).toBe('ok')
  })

  it('not enrolled: stays, says why, offers practice; nothing saved', async () => {
    app(deps({ enrol: vi.fn(async () => ({ enrolled: false, reason: 'not-in-experiment' }) as GateResult) }))
    fireEvent.click(screen.getByRole('button', { name: 'Start the challenge' }))
    const b = await screen.findByRole('button', { name: 'Start practice' })
    expect(screen.getByText('The study isn’t running right now, so this run is practice.')).toBeTruthy()
    expect(document.activeElement).toBe(b)
    expect(localStorage.getItem(KEYS.attempt)).toBeNull()
    fireEvent.click(b)
    expect(path()).toBe('/practice')
    expect(screen.getByText('The study isn’t running right now, so this run is practice.')).toBeTruthy()
  })

  it('Enter on the page starts', async () => {
    const d = deps()
    app(d)
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(d.enrol).toHaveBeenCalledTimes(1))
  })

  it('in progress: Continue at the saved result, without asking Flagsmith', () => {
    seedAttempt(2)
    const d = deps()
    app(d)
    fireEvent.click(screen.getByRole('button', { name: 'Continue (Result 3 of 6)' }))
    expect(path()).toBe('/challenge')
    expect(d.enrol).not.toHaveBeenCalled()
  })

  it('finished: Practice again and See your readout, never a second measured run', () => {
    seedAttempt(6, true)
    app(deps())
    expect(screen.queryByRole('button', { name: 'Start the challenge' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Practice again' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /See your readout/ })).toBeTruthy()
  })

  it('corrupt attempt: practice only, with the restore notice', () => {
    localStorage.setItem(KEYS.attempt, '{"x":1}')
    app(deps())
    expect(screen.getByText('We couldn’t restore your challenge, so this run continues as practice.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start practice' })).toBeTruthy()
  })

  it('blocked storage: practice only, no consent block', () => {
    app(deps({ storageOk: () => false }))
    expect(screen.queryByText(/Before you start\./)).toBeNull()
    expect(screen.getByText(/blocking storage/)).toBeTruthy()
  })
})

describe('Challenge', () => {
  it('six calls by keyboard: saved one by one, MeasuredSession mounted, locking panel, scores sent, then the flip', async () => {
    seedAttempt(0)
    const d = deps()
    app(d, '/challenge')
    expect(mounts).toContain('control')
    expect(screen.getByText('Result 1 of 6', { selector: 'span' })).toBeTruthy()
    for (let i = 0; i < 6; i++) {
      await play(String((i % 4) + 1))
      const s = loadAttempt()
      expect(s.kind === 'ok' && s.attempt.index).toBe(i + 1)
    }
    expect(await screen.findByText('Locking in your six calls…')).toBeTruthy()
    await waitFor(() => expect(path()).toBe('/readout'), { timeout: 3000 })
    expect(d.sendScores).toHaveBeenCalledTimes(1)
    const s = loadAttempt()
    expect(s.kind === 'ok' && s.attempt.status).toBe('scored_pending') // the fake does not send
  })

  it('resumes at the saved result', () => {
    seedAttempt(3)
    app(deps(), '/challenge')
    expect(screen.getByText('Result 4 of 6', { selector: 'span' })).toBeTruthy()
  })

  it('a call that cannot be saved: an alert, the same card, nothing moved on', async () => {
    seedAttempt(1)
    app(deps(), '/challenge')
    const real = Storage.prototype.setItem
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === KEYS.attempt) throw new Error('quota')
      return real.call(this, k, v)
    })
    await play('2')
    expect(screen.getByRole('alert').textContent).toMatch(/couldn’t save that call/)
    expect(screen.getByText('Result 2 of 6', { selector: 'span' })).toBeTruthy()
    spy.mockRestore()
    fireEvent.keyDown(window, { key: 'Enter' }) // retry with the kept selection
    await act(() => new Promise((r) => setTimeout(r, 220)))
    expect(screen.getByText('Result 3 of 6', { selector: 'span' })).toBeTruthy()
  })

  it('Leave asks inline; Esc closes it; Leave keeps the attempt', () => {
    const a = seedAttempt(2)
    app(deps(), '/challenge')
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
    expect(screen.getByText(/Your challenge stays where you left it/)).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByText(/Your challenge stays where you left it/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Leave' })[1]!)
    expect(path()).toBe('/')
    const s = loadAttempt()
    expect(s.kind === 'ok' && s.attempt).toMatchObject({ id: a.id, index: 2, status: 'in_progress' })
  })

  it('no attempt: back to the landing page; finished: to the flip', () => {
    app(deps(), '/challenge')
    expect(path()).toBe('/')
    cleanup()
    seedAttempt(6, true)
    app(deps(), '/challenge')
    expect(path()).toBe('/readout')
  })
})

describe('Practice', () => {
  it('never measured: no MeasuredSession, no Flagsmith, no readout.attempt; saves only the practice record', async () => {
    const d = deps()
    app(d, '/practice')
    expect(screen.getByRole('heading', { level: 1, name: 'Practice — not part of the study' })).toBeTruthy()
    expect(screen.getAllByText('Practice · not part of the study').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('radiogroup', { name: 'Show this line as' }).length).toBe(1)
    for (let i = 0; i < 6; i++) await play('1')
    await waitFor(() => expect(path()).toBe('/practice/readout'))
    expect(mounts).toEqual([])
    expect(d.enrol).not.toHaveBeenCalled()
    expect(d.init).not.toHaveBeenCalled()
    expect(d.sendScores).not.toHaveBeenCalled()
    expect(localStorage.getItem(KEYS.attempt)).toBeNull()
    expect(readPractice()?.answers).toBeTruthy()
  })
})
