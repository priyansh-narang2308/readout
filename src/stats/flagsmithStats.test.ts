import reference from './__fixtures__/reference.json'
import {
  chanceFromZ,
  compareToControl,
  conversionStats,
  erfc,
  pFromChance,
  pFromZ,
  srm,
  type Direction,
} from './flagsmithStats'

type Ref = {
  input: { nc: number; cc: number; nt: number; ct: number; direction: Direction }
  expected: { lift: number; se: number; lo: number; hi: number; z: number; p: number; chance: number; chi: number; srm: number }
}
const vectors = reference as Record<string, Ref>

function closeRel(actual: number, expected: number, rel: number, abs = 0) {
  const tol = Math.max(abs, Math.abs(expected) * rel)
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol)
}

describe('T-STAT: matches the independent Python reference for every vector', () => {
  for (const [id, v] of Object.entries(vectors)) {
    it(id, () => {
      const { nc, cc, nt, ct, direction } = v.input
      const r = compareToControl(conversionStats(nc, cc), conversionStats(nt, ct), direction)!
      expect(r).not.toBeNull()
      closeRel(r.lift, v.expected.lift, 1e-12, 1e-12)
      closeRel(r.se, v.expected.se, 1e-10)
      closeRel(r.ciLow, v.expected.lo, 1e-10, 1e-12)
      closeRel(r.ciHigh, v.expected.hi, 1e-10, 1e-12)
      closeRel(r.z, v.expected.z, 1e-10, 1e-12)
      closeRel(r.chanceToWin, v.expected.chance, 1e-9, 1e-12)
      closeRel(r.pValue, v.expected.p, 1e-9, 1e-15)
      const s = srm([nc, nt], [0.5, 0.5])
      closeRel(s.chiSquare, v.expected.chi, 1e-10, 1e-12)
      closeRel(s.pValue, v.expected.srm, 1e-8, 1e-300)
    })
  }
})

describe('T-STAT: 27 §7 printed table (from Flagsmith stats.py @64c1ebe)', () => {
  const table: [string, number, number, number, number, Direction, number, number, number, number, number, number, number][] = [
    // id, nc, cc, nt, ct, dir, lift, se, lo, hi, z, p, chance
    ['S1', 4000, 160, 4000, 212, 'up', 0.325, 0.135575, 0.059277, 0.590723, 2.39719, 0.0165214, 0.991739],
    ['S2', 3000, 360, 3000, 291, 'up', -0.191667, 0.060216, -0.309688, -0.073645, -3.182978, 0.00145769, 0.000729],
    ['S3', 1500, 120, 1500, 138, 'up', 0.15, 0.137308, -0.119118, 0.419118, 1.092437, 0.274641, 0.862679],
    ['S4', 60, 6, 60, 11, 'up', 0.833333, 0.875487, -0.882591, 2.549257, 0.951851, 0.341173, 0.829414],
    ['S5', 9120, 456, 6400, 371, 'up', 0.159375, 0.07883, 0.004871, 0.313879, 2.021754, 0.0432017, 0.978399],
    ['S6p', 5000, 400, 5000, 470, 'up', 0.175, 0.076407, 0.025246, 0.324754, 2.290376, 0.0219995, 0.989],
    ['S6g', 5000, 50, 5000, 95, 'down', 0.9, 0.329815, 0.253575, 1.546425, 2.728805, 0.00635643, 0.003178],
  ]
  for (const [id, nc, cc, nt, ct, d, lift, se, lo, hi, z, p, chance] of table) {
    it(id, () => {
      const r = compareToControl(conversionStats(nc, cc), conversionStats(nt, ct), d)!
      expect(Math.abs(r.lift - lift)).toBeLessThan(1e-6)
      expect(Math.abs(r.se - se)).toBeLessThan(1e-6)
      expect(Math.abs(r.ciLow - lo)).toBeLessThan(1e-6)
      expect(Math.abs(r.ciHigh - hi)).toBeLessThan(1e-6)
      expect(Math.abs(r.z - z)).toBeLessThan(1e-5)
      expect(Math.abs(r.chanceToWin - chance)).toBeLessThan(1e-6)
      closeRel(r.pValue, p, 1e-4)
    })
  }
})

describe('T-SRM', () => {
  it('S5 is a near-impossible imbalance', () => {
    const s = srm([9120, 6400], [0.5, 0.5])
    expect(Math.abs(s.chiSquare - 476.701)).toBeLessThan(1e-3)
    expect(s.pValue).toBeLessThan(1e-100)
    closeRel(s.pValue, 1.115827546449067e-105, 1e-6)
  })
  it('balanced splits give χ² = 0, p = 1', () => {
    expect(srm([4000, 4000], [0.5, 0.5])).toMatchObject({ chiSquare: 0, pValue: 1 })
  })
  it('three arms, equal shares: p = 1', () => {
    expect(srm([100, 100, 100], [1 / 3, 1 / 3, 1 / 3]).pValue).toBeCloseTo(1, 12)
  })
  it('three arms, df=2 closed form exp(-x/2)', () => {
    const s = srm([120, 100, 80], [1 / 3, 1 / 3, 1 / 3])
    closeRel(s.pValue, Math.exp(-s.chiSquare / 2), 1e-12)
  })
  it('mild imbalance at 100 is not flagged at p < 0.001 (only gross ones are)', () => {
    expect(srm([60, 40], [0.5, 0.5]).pValue).toBeGreaterThan(0.001)
    expect(srm([70, 30], [0.5, 0.5]).pValue).toBeLessThan(0.001)
  })
})

describe('T-EDGE (matches stats.py)', () => {
  it('n < 2 in either arm → null', () => {
    expect(compareToControl(conversionStats(1, 1), conversionStats(10, 1))).toBeNull()
    expect(compareToControl(conversionStats(10, 1), conversionStats(1, 1))).toBeNull()
  })
  it('control mean 0 → null', () => {
    expect(compareToControl(conversionStats(10, 0), conversionStats(10, 1))).toBeNull()
  })
  it('SE = 0 with lift 0 → chance 0.5', () => {
    const r = compareToControl(conversionStats(10, 10), conversionStats(10, 10))!
    expect(r).toMatchObject({ lift: 0, ciLow: 0, ciHigh: 0, chanceToWin: 0.5 })
  })
  it('SE = 0 with lift > 0 → chance 1; lift < 0 → chance 0', () => {
    const up = compareToControl({ n: 10, sum: 10, sumSquares: 10 }, { n: 10, sum: 20, sumSquares: 40 })!
    expect(up.se).toBe(0)
    expect(up.chanceToWin).toBe(1)
    const down = compareToControl({ n: 10, sum: 20, sumSquares: 40 }, { n: 10, sum: 10, sumSquares: 10 })!
    expect(down.chanceToWin).toBe(0)
  })
  it('direction down flips chance only; p unchanged', () => {
    const up = compareToControl(conversionStats(1000, 100), conversionStats(1000, 80), 'up')!
    const down = compareToControl(conversionStats(1000, 100), conversionStats(1000, 80), 'down')!
    expect(up.chanceToWin).toBeCloseTo(0.040475, 6)
    expect(down.chanceToWin).toBeCloseTo(0.959525, 6)
    expect(down.pValue).toBe(up.pValue)
    expect(down.lift).toBe(up.lift)
  })
  it('zero effect: lift 0, chance 0.5, p 1', () => {
    const r = compareToControl(conversionStats(2000, 200), conversionStats(2000, 200))!
    expect(r.lift).toBe(0)
    expect(r.chanceToWin).toBeCloseTo(0.5, 12)
    expect(r.pValue).toBeCloseTo(1, 12)
  })
})

describe('T-THRESH and erfc accuracy', () => {
  it('chance at z=1.6448536 is 0.95; p at z=1.959964 is 0.05', () => {
    expect(chanceFromZ(1.6448536)).toBeCloseTo(0.95, 7)
    expect(pFromZ(1.959964)).toBeCloseTo(0.05, 7)
  })
  it('pFromChance identity (27 §4.1)', () => {
    expect(pFromChance(0.86268, 1)).toBeCloseTo(0.27464, 5)
    expect(pFromChance(0.000729, -1)).toBeCloseTo(0.001458, 6)
  })
  it('erfc known values', () => {
    expect(erfc(0)).toBe(1)
    closeRel(erfc(0.5), 0.4795001221869535, 1e-14)
    closeRel(erfc(1), 0.15729920705028513, 1e-14)
    closeRel(erfc(3), 2.209049699858544e-5, 1e-13)
    closeRel(erfc(10), 2.088487583762545e-45, 1e-12)
    closeRel(erfc(-1), 1.8427007929497148, 1e-14)
  })
})
