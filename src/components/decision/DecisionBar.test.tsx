/**
 * DecisionBar behaviour (25 §4.3, 29 UI-2): keys 1–4 select, arrows move, Enter locks, Lock in disabled without a
 * selection, and a call is locked at most once per result (held Enter / double click never double-submit).
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CALLS, CALL_LABEL, type Call } from '../../content/scenarios.v1'
import { DecisionBar } from './DecisionBar'

afterEach(cleanup)

function Harness({ onLock, locked = false, initial = null }: { onLock: (c: Call) => void; locked?: boolean; initial?: Call | null }) {
  const [sel, setSel] = useState<Call | null>(initial)
  return (
    <>
      <button type="button">Unrelated</button>
      <input aria-label="free text" />
      <DecisionBar name="t" selected={sel} onSelect={setSel} onLock={() => sel && onLock(sel)} locked={locked} />
    </>
  )
}

const radios = () => screen.getAllByRole('radio')
const lockBtn = () => screen.getByRole('button', { name: 'Lock in call' })
const checked = () => radios().find((r) => r.getAttribute('aria-checked') === 'true')?.textContent ?? null
const key = (k: string, init: KeyboardEventInit = {}, target: Element | Window = window) =>
  act(() => {
    fireEvent.keyDown(target, { key: k, ...init })
  })

describe('DecisionBar', () => {
  it('shows the four calls in the fixed order, inside a labelled radiogroup', () => {
    render(<Harness onLock={() => {}} />)
    expect(screen.getByRole('radiogroup', { name: /your call/i })).toBeTruthy()
    expect(radios().map((r) => r.textContent)).toEqual(CALLS.map((c, i) => `${i + 1}${CALL_LABEL[c]}`))
  })

  it('keeps Lock in disabled until a call is selected, and Enter does nothing before that', () => {
    const onLock = vi.fn()
    render(<Harness onLock={onLock} />)
    expect((lockBtn() as HTMLButtonElement).disabled).toBe(true)
    key('Enter')
    expect(onLock).not.toHaveBeenCalled()
  })

  it.each(CALLS.map((c, i) => [String(i + 1), c] as const))('key %s selects %s', (k, c) => {
    render(<Harness onLock={() => {}} />)
    key(k)
    expect(checked()).toContain(CALL_LABEL[c])
    expect((lockBtn() as HTMLButtonElement).disabled).toBe(false)
  })

  it('lets the player change their mind freely before locking', () => {
    const onLock = vi.fn()
    render(<Harness onLock={onLock} />)
    key('1')
    key('4')
    key('2')
    key('Enter')
    expect(onLock).toHaveBeenCalledTimes(1)
    expect(onLock).toHaveBeenCalledWith('control')
  })

  it('locks exactly once on Enter, ignoring key repeat and a second press', () => {
    const onLock = vi.fn()
    render(<Harness onLock={onLock} />)
    key('3')
    key('Enter')
    key('Enter', { repeat: true })
    key('Enter')
    expect(onLock).toHaveBeenCalledTimes(1)
  })

  it('locks exactly once on a double click of Lock in', () => {
    const onLock = vi.fn()
    render(<Harness onLock={onLock} />)
    fireEvent.click(radios()[0]!)
    fireEvent.click(lockBtn())
    fireEvent.click(lockBtn())
    expect(onLock).toHaveBeenCalledTimes(1)
    expect(onLock).toHaveBeenCalledWith('ship')
  })

  it('ignores number keys with modifiers and while typing in a text field', () => {
    render(<Harness onLock={() => {}} />)
    key('2', { metaKey: true })
    key('2', { ctrlKey: true })
    key('2', { altKey: true })
    key('2', {}, screen.getByLabelText('free text'))
    expect(checked()).toBeNull()
  })

  it('does not hijack Enter on an unrelated focused button', () => {
    const onLock = vi.fn()
    render(<Harness onLock={onLock} initial="ship" />)
    key('Enter', {}, screen.getByRole('button', { name: 'Unrelated' }))
    expect(onLock).not.toHaveBeenCalled()
  })

  it('moves selection and focus with the arrow keys, wrapping around', () => {
    render(<Harness onLock={() => {}} />)
    const first = radios()[0]!
    first.focus()
    key('ArrowUp', {}, first)
    expect(checked()).toContain(CALL_LABEL.distrust)
    expect(document.activeElement).toBe(radios()[3])
    key('ArrowDown', {}, radios()[3]!)
    expect(checked()).toContain(CALL_LABEL.ship)
    expect(document.activeElement).toBe(radios()[0])
  })

  it('uses a roving tab stop: one option is tabbable, the selected one once chosen', () => {
    render(<Harness onLock={() => {}} />)
    expect(radios().map((r) => r.tabIndex)).toEqual([0, -1, -1, -1])
    key('3')
    expect(radios().map((r) => r.tabIndex)).toEqual([-1, -1, 0, -1])
  })

  it('when locked: every option and Lock in are disabled, and keys do nothing', () => {
    const onLock = vi.fn()
    render(<Harness onLock={onLock} locked initial="collecting" />)
    radios().forEach((r) => expect((r as HTMLButtonElement).disabled).toBe(true))
    expect((lockBtn() as HTMLButtonElement).disabled).toBe(true)
    key('1')
    key('Enter')
    expect(checked()).toContain(CALL_LABEL.collecting)
    expect(onLock).not.toHaveBeenCalled()
  })

  it('a fresh bar (next result) starts with no selection and can lock again', () => {
    const onLock = vi.fn()
    const { rerender } = render(<Harness key="S1" onLock={onLock} />)
    key('1')
    key('Enter')
    rerender(<Harness key="S2" onLock={onLock} />)
    expect(checked()).toBeNull()
    key('Enter')
    expect(onLock).toHaveBeenCalledTimes(1)
    key('2')
    key('Enter')
    expect(onLock).toHaveBeenCalledTimes(2)
    expect(onLock).toHaveBeenLastCalledWith('control')
  })
})
