/**
 * Task 34 found three things in a real browser that jsdom alone missed; these pin the fixes.
 *  1. 26 §4: the practice badge on EVERY practice screen. The practice flip, debrief and readout use the site header,
 *     which had no badge.
 *  2. axe color-contrast: muted (ink-3) text inside the amber evidence highlight fell to 4.0:1 (3.1:1 where two
 *     highlights overlap); inside a highlight it now steps up to ink-2.
 *  3. 29 §12.4: tap targets ≥ 44 px. The "Show this line as" toggle was 36–40 px tall on touch screens.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { evidence } from '../ui/classes'
import { FramingToggle, SiteHeader } from './Site'

afterEach(() => cleanup())

const header = (at: string) =>
  render(
    <MemoryRouter initialEntries={[at]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <SiteHeader />
    </MemoryRouter>,
  )

describe('fixes from the real-browser check', () => {
  it.each(['/practice/readout', '/practice/readout/3', '/practice/readout/summary'])('the site header on %s shows the practice badge', (at) => {
    header(at)
    expect(screen.getByText('Practice · not part of the study')).toBeTruthy()
  })

  it.each(['/', '/readout', '/readout/3', '/readout/summary', '/rules', '/team', '/about'])('and never outside practice (%s)', (at) => {
    header(at)
    expect(screen.queryByText(/Practice · not part of the study/)).toBeNull()
  })

  it('muted text inside an evidence highlight is raised to ink-2', () => {
    for (const offset of ['outline-offset-3', 'outline-offset-4', 'outline-offset-6'] as const) {
      expect(evidence(offset).split(' ')).toContain('[&_.text-ink-3]:text-ink-2')
    }
  })

  it.each([false, true])('the framing toggle is 44 px tall on touch screens (compact: %s)', (compact) => {
    render(<FramingToggle value="p_value" onChange={() => undefined} compact={compact} />)
    for (const b of screen.getAllByRole('radio')) {
      expect(b.className.split(' ')).toContain('pointer-coarse:h-11')
      expect(b.className).not.toMatch(/pointer-coarse:h-(9|10)\b/)
    }
  })
})
