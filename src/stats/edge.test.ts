/**
 * Methodology edge cases (mission §8): the places where a correct number could still be read wrongly. They guard the
 * teaching content (no scenario sits where rounding hides which side of a threshold it is on) and the formulas at
 * their extremes (no NaN or Infinity reaches a card).
 */
import { describe, expect, it } from 'vitest'
import { analyse } from '../content/analysis'
import { MEASURED_ORDER, SCENARIOS } from '../content/scenarios.v1'
import { compareToControl, conversionStats, pFromChance } from './flagsmithStats'
import { fmtChance, fmtInterval, fmtLift, fmtP } from './format'

const metrics = MEASURED_ORDER.flatMap((id) => {
  const a = analyse(SCENARIOS[id])
  return [{ id, m: a.primary }, ...(a.guardrail ? [{ id, m: a.guardrail }] : [])]
})

describe('display at the decision thresholds', () => {
  it('chance rounds into its labels only at the stated cut-offs', () => {
    expect(fmtChance(0.004999)).toBe('< 1%')
    expect(fmtChance(0.005)).toBe('1%')
    expect(fmtChance(0.994999)).toBe('99%')
    expect(fmtChance(0.995)).toBe('> 99%')
    expect(fmtChance(0.5)).toBe('50%')
  })

  it('p rounds to "< 0.001" only below 0.001, and never prints exponent form', () => {
    expect(fmtP(0.000999)).toBe('< 0.001')
    expect(fmtP(0.001)).toBe('0.001')
    expect(fmtP(0.0015)).toBe('0.0015')
    for (const p of [0.001, 0.0012345, 0.01, 0.5, 0.99999]) expect(fmtP(p)).not.toMatch(/e/i)
  })

  it('a value just under a threshold can print as the threshold, so no scenario sits in that band', () => {
    // fmtP(0.0496) is "0.05" and fmtChance(0.9496) is "95%": a reader can't tell which side they are on.
    expect(fmtP(0.0496)).toBe('0.05')
    expect(fmtChance(0.9496)).toBe('95%')
    // A scenario is ambiguous if rounding moves its printed value onto, or across, a threshold the Rules mention.
    const pct = (c: number) => Number(fmtChance(c).replace(/[^0-9]/g, ''))
    for (const { id, m } of metrics) {
      const { pValue, chanceToWin } = m.inference
      expect(['0.05', '0.1'], `${id} ${m.spec.name} p prints as ${fmtP(pValue)}`).not.toContain(fmtP(pValue))
      if (!/[<>]/.test(fmtChance(chanceToWin))) {
        expect(fmtChance(chanceToWin), `${id} ${m.spec.name}`).not.toBe('95%')
        expect(fmtChance(chanceToWin), `${id} ${m.spec.name}`).not.toBe('5%')
        for (const t of [0.95, 0.975, 0.05, 0.025]) expect(chanceToWin >= t, `${id} ${m.spec.name} vs ${t}`).toBe(pct(chanceToWin) >= t * 100)
      }
    }
  })

  it('the printed interval always shows the side of zero the analysis uses', () => {
    for (const { id, m } of metrics) {
      const { ciLow, ciHigh } = m.inference
      const [lo, hi] = fmtInterval(ciLow, ciHigh).split(' to ')
      const crosses = ciLow < 0 && ciHigh > 0
      if (crosses) {
        expect(lo, id).toMatch(/^−/)
        expect(hi, id).toMatch(/^\+/)
      } else {
        // Clear of zero: both ends carry the same sign and neither rounds to 0.0%.
        expect(lo!.charAt(0), id).toBe(hi!.charAt(0))
        expect([lo, hi], id).not.toContain('0.0%')
      }
    }
  })

  it('a tiny negative lift never prints as "−0.0%"', () => {
    expect(fmtLift(-0.00049)).toBe('0.0%')
    expect(fmtLift(0.00049)).toBe('0.0%')
    expect(fmtLift(-0.0005)).toBe('−0.1%')
  })
})

describe('the formulas at their extremes', () => {
  const finite = (r: ReturnType<typeof compareToControl>) =>
    r !== null && [r.lift, r.ciLow, r.ciHigh, r.chanceToWin, r.pValue].every((x) => Number.isFinite(x))

  it('zero conversions in the variant, or every user converting, still gives finite numbers', () => {
    expect(finite(compareToControl(conversionStats(1000, 100), conversionStats(1000, 0)))).toBe(true)
    expect(finite(compareToControl(conversionStats(1000, 100), conversionStats(1000, 1000)))).toBe(true)
  })

  it('a control with no conversions has no lift (null), never a division by zero on a card', () => {
    expect(compareToControl(conversionStats(1000, 0), conversionStats(1000, 10))).toBeNull()
  })

  it('swapping the arms mirrors the side of 0.5, but not the p-value (relative lift is not symmetric)', () => {
    const a = conversionStats(3000, 360)
    const b = conversionStats(3000, 400)
    const ab = compareToControl(a, b)!
    const ba = compareToControl(b, a)!
    expect(Math.sign(ab.chanceToWin - 0.5)).toBe(-Math.sign(ba.chanceToWin - 0.5))
    // Flagsmith's delta-method SE is for the lift relative to control, so which arm is control changes z. Readout
    // always shows the configured control as control, as Flagsmith does; this pins the asymmetry so nobody "fixes" it.
    expect(ab.pValue).not.toBeCloseTo(ba.pValue, 2)
  })

  it('tiny samples: n = 2 is the smallest compared; the interval is wide, never narrower than a big sample’s', () => {
    expect(compareToControl(conversionStats(1, 1), conversionStats(1, 0))).toBeNull()
    const small = compareToControl(conversionStats(20, 2), conversionStats(20, 4))!
    const big = compareToControl(conversionStats(20000, 2000), conversionStats(20000, 4000))!
    expect(small.ciHigh - small.ciLow).toBeGreaterThan(big.ciHigh - big.ciLow)
  })

  it('the 95% chance bar is a two-sided p of about 0.10, and 97.5% about 0.05 (Rule 6)', () => {
    expect(pFromChance(0.95, 1)).toBeCloseTo(0.1, 10)
    expect(pFromChance(0.975, 1)).toBeCloseTo(0.05, 10)
  })
})
