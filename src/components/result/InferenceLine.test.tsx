/**
 * The flip's motion (25 §5, 26 §7): the line rotates out (140 ms), swaps, rotates in (140 ms), with an accent outline
 * shown briefly. Element.animate is stubbed (jsdom has none) so the finish event is under the test's control.
 */
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { analyse } from '../../content/analysis'
import { SCENARIOS, type Framing } from '../../content/scenarios.v1'
import { FLASH_MS, InferenceLine } from './ResultCard'

const metric = analyse(SCENARIOS.S1).primary
type Anim = { onfinish: (() => void) | null }
let calls: { el: Element; anim: Anim }[] = []

beforeEach(() => {
  vi.useFakeTimers()
  calls = []
  ;(Element.prototype as unknown as { animate: unknown }).animate = function (this: Element) {
    const anim: Anim = { onfinish: null }
    calls.push({ el: this, anim })
    return anim
  }
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  delete (Element.prototype as unknown as { animate?: unknown }).animate
})

function line(framing: Framing, delayMs = 0) {
  return <InferenceLine framing={framing} metric={metric} animate delayMs={delayMs} />
}
const p = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-inference]')!
const outlined = (c: HTMLElement) => p(c).parentElement!.className.includes('shadow-[0_0_0_1px')

describe('InferenceLine flip', () => {
  it('rotates the line element itself, after its stagger delay', () => {
    const { container, rerender } = render(line('p_value', 90))
    rerender(line('chance_to_win', 90))
    act(() => vi.advanceTimersByTime(89))
    expect(calls).toHaveLength(0)
    act(() => vi.advanceTimersByTime(1))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.el).toBe(p(container)) // the ref is attached (it was lost once, and the flip silently stopped)
    expect(outlined(container)).toBe(true)
  })

  it('swaps the text when the rotation out finishes, then rotates in', () => {
    const { container, rerender } = render(line('p_value'))
    rerender(line('chance_to_win'))
    act(() => vi.advanceTimersByTime(0))
    expect(p(container).dataset.inference).toBe('p_value')
    act(() => calls[0]!.anim.onfinish!())
    expect(p(container).dataset.inference).toBe('chance_to_win')
    expect(calls).toHaveLength(2)
  })

  it('the outline is brief: it clears after FLASH_MS', () => {
    const { container, rerender } = render(line('p_value'))
    rerender(line('chance_to_win'))
    act(() => vi.advanceTimersByTime(0))
    act(() => calls[0]!.anim.onfinish!())
    act(() => vi.advanceTimersByTime(FLASH_MS - 1))
    expect(outlined(container)).toBe(true)
    act(() => vi.advanceTimersByTime(1))
    expect(outlined(container)).toBe(false)
  })

  it('a hidden tab never finishes the animation: the line still swaps (once)', () => {
    const { container, rerender } = render(line('p_value'))
    rerender(line('chance_to_win'))
    act(() => vi.advanceTimersByTime(400))
    expect(p(container).dataset.inference).toBe('chance_to_win')
    expect(calls).toHaveLength(2)
    act(() => calls[0]!.anim.onfinish?.())
    expect(calls).toHaveLength(2)
  })

  it('without animate (skip, reduced motion) the line swaps at once', () => {
    const { container, rerender } = render(<InferenceLine framing="p_value" metric={metric} />)
    rerender(<InferenceLine framing="chance_to_win" metric={metric} />)
    expect(p(container).dataset.inference).toBe('chance_to_win')
    expect(calls).toHaveLength(0)
  })
})
