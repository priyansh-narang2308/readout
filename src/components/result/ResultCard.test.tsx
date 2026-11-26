/**
 * T-INVARIANT (26 §9, 33): the two arms are identical except the text inside [data-inference].
 * Rendered exactly as the challenge renders it: ResultCard + DecisionBar footer, for every measured scenario.
 */
import { cleanup, render, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DecisionBar } from '../decision/DecisionBar'
import { MEASURED_ORDER, SCENARIOS, type Framing } from '../../content/scenarios.v1'
import { ResultCard } from './ResultCard'

afterEach(cleanup)

function renderArm(id: (typeof MEASURED_ORDER)[number], framing: Framing) {
  const { container } = render(
    <ResultCard
      model={SCENARIOS[id]}
      framing={framing}
      titleId="t"
      footer={<DecisionBar name="d" selected={null} onSelect={() => {}} onLock={() => {}} />}
    />,
  )
  return container
}

function masked(el: HTMLElement): string {
  const clone = el.cloneNode(true) as HTMLElement
  clone.querySelectorAll('[data-inference]').forEach((n) => {
    n.removeAttribute('data-inference')
    n.innerHTML = ''
  })
  return clone.innerHTML
}

describe('T-INVARIANT: arms differ only inside the inference line', () => {
  it.each(MEASURED_ORDER)('%s', (id) => {
    const p = renderArm(id, 'p_value')
    const pHtml = p.innerHTML
    const pMasked = masked(p)
    const pLines = [...p.querySelectorAll('[data-inference]')].map((n) => n.textContent)
    cleanup()
    const c = renderArm(id, 'chance_to_win')
    const cLines = [...c.querySelectorAll('[data-inference]')].map((n) => n.textContent)

    expect(masked(c)).toBe(pMasked)
    // The masked content really is the only difference, and it really differs.
    expect(c.innerHTML).not.toBe(pHtml)
    expect(pLines.length).toBe(SCENARIOS[id].guardrail ? 2 : 1)
    expect(cLines.length).toBe(pLines.length)
    pLines.forEach((t) => expect(t).toMatch(/^p-value/))
    cLines.forEach((t) => expect(t).toMatch(/^Chance to beat control/))
  })
})

describe('result card structure (26 §8.2 item 12)', () => {
  it.each(MEASURED_ORDER)('%s is accessible and labelled fictional', (id) => {
    const c = renderArm(id, 'p_value')
    const section = c.querySelector('section')!
    expect(section.getAttribute('aria-labelledby')).toBe('t')
    expect(within(section).getByText(/fictional test/i)).toBeTruthy()
    const bars = within(section).getAllByRole('img')
    expect(bars.length).toBe(SCENARIOS[id].guardrail ? 2 : 1)
    bars.forEach((b) => expect(b.getAttribute('aria-label')).toMatch(/^95% interval for the lift from .+; point estimate /))
    // Real tables with header scopes.
    section.querySelectorAll('table').forEach((t) => {
      expect(t.querySelectorAll('th[scope="col"]').length).toBe(4)
      expect(t.querySelectorAll('th[scope="row"]').length).toBe(2)
    })
    expect(within(section).getByRole('radiogroup')).toBeTruthy()
    expect(within(section).getAllByRole('radio')).toHaveLength(4)
  })

  it('preview card (landing) has no inference line at all', () => {
    const { container } = render(<ResultCard model={SCENARIOS.S1} framing={null} />)
    expect(container.querySelector('[data-inference]')).toBeNull()
  })

  it('evidence callouts use valid whitespace-free aria-describedby IDs', () => {
    const { container } = render(<ResultCard model={SCENARIOS.S2} framing="p_value" annotations={SCENARIOS.S2.evidence} />)
    const described = [...container.querySelectorAll('[aria-describedby]')]
    expect(described.length).toBeGreaterThan(0)
    for (const el of described) {
      const ids = el.getAttribute('aria-describedby')!.split(/\s+/)
      expect(ids).toHaveLength(1)
      expect(ids[0]).not.toMatch(/\s/)
      expect(document.getElementById(ids[0]!)).not.toBeNull()
    }
  })
})
