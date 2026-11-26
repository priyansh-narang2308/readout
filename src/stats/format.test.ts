import { fmtChance, fmtCount, fmtInterval, fmtLift, fmtP, fmtRate, fmtSplit } from './format'

describe('T-FMT', () => {
  it.each([
    [0.274641, '0.27'],
    [0.00145769, '0.0015'],
    [0.0004, '< 0.001'],
    [0.0432017, '0.043'],
    [0.0165214, '0.017'],
    [0.341173, '0.34'],
  ])('p %s → %s', (p, s) => expect(fmtP(p)).toBe(s))
  it.each([
    [0.862679, '86%'],
    [0.000729, '< 1%'],
    [0.996, '> 99%'],
    [0.991739, '99%'],
    [0.003178, '< 1%'],
    [0.5, '50%'],
  ])('chance %s → %s', (c, s) => expect(fmtChance(c)).toBe(s))
  it('lift uses the true minus sign', () => {
    expect(fmtLift(-0.191667)).toBe('−19.2%')
    expect(fmtLift(0.325)).toBe('+32.5%')
    expect(fmtLift(0)).toBe('0.0%')
    expect(fmtLift(-0.0004)).toBe('0.0%')
  })
  it('interval S4', () => expect(fmtInterval(-0.882591, 2.549257)).toBe('−88.3% to +254.9%'))
  it('split S5', () => expect(fmtSplit([9120 / 15520, 6400 / 15520], [0.5, 0.5])).toBe('58.8 / 41.2 (configured 50 / 50)'))
  it('rate and count', () => {
    expect(fmtRate(0.04)).toBe('4.0%')
    expect(fmtRate(11 / 60)).toBe('18.3%')
    expect(fmtCount(9120)).toBe('9,120')
  })
})
