/**
 * scripts/srm.mjs: the pre-registered SRM check equals Flagsmith v2.291.0 `stats.srm_p_value` for two arms at 50/50
 * (reference values computed with Python's math.erfc, the function Flagsmith uses for one degree of freedom).
 */
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain ESM script without types
import { srmCheck } from '../../scripts/srm.mjs'
import { SRM_ALPHA, SRM_MIN_TOTAL_IDENTITIES, srm } from './flagsmithStats'

describe('SRM check (EXPERIMENT.md §10 rule 1)', () => {
  it.each([
    [140, 150, 0.3448275862068966, 0.5570558144094062, 'ok'],
    [480, 520, 1.6, 0.2059032107320683, 'ok'],
    [45, 60, 2.142857142857143, 0.14323490752466966, 'ok'],
    [100, 200, 33.333333333333336, 7.764036537930662e-9, 'warning'],
  ])('control %i vs chance_to_win %i matches Flagsmith’s formula', (c, t, stat, p, verdict) => {
    const r = srmCheck(c, t)
    expect(r.statistic).toBeCloseTo(stat, 10)
    expect(r.p).toBeCloseTo(p, 6)
    expect(Math.abs(r.p - p) / p).toBeLessThan(1e-5)
    expect(r.verdict).toBe(verdict)
  })

  it('agrees with the app’s own (frozen) SRM implementation and constants on 500 splits', () => {
    for (let i = 0; i < 500; i++) {
      const c = 50 + ((i * 7919) % 400)
      const t = 50 + ((i * 104729) % 400)
      const mine = srmCheck(c, t)
      const app = srm([c, t], [0.5, 0.5])
      expect(mine.statistic).toBeCloseTo(app.chiSquare, 10)
      expect(Math.abs(mine.p - app.pValue)).toBeLessThan(1e-6 * Math.max(app.pValue, 1e-12) + 1e-12)
      expect(mine.verdict).toBe(app.pValue < SRM_ALPHA ? 'warning' : 'ok')
    }
    expect(SRM_MIN_TOTAL_IDENTITIES).toBe(100)
  })

  it('a perfect split is p = 1; under 100 in total is not assessed; bad input is refused', () => {
    expect(srmCheck(60, 60)).toMatchObject({ p: 1, verdict: 'ok' })
    expect(srmCheck(40, 59).verdict).toBe('not_assessed')
    expect(() => srmCheck(1.5, 100)).toThrow()
    expect(() => srmCheck(-1, 100)).toThrow()
  })

  it('the command line exits 0 / 1 / 2 / 3 and names the rule', () => {
    const run = (...a: string[]) => spawnSync('node', ['scripts/srm.mjs', ...a], { encoding: 'utf8' })
    const ok = run('--control', '140', '--chance-to-win', '150')
    expect(ok.status).toBe(0)
    expect(ok.stdout).toMatch(/χ² = 0\.345 · p = 0\.5571/)
    const warn = run('--control', '100', '--chance-to-win', '200')
    expect(warn.status).toBe(1)
    expect(warn.stdout).toMatch(/SRM WARNING.*Rule 1: no result is interpreted/)
    expect(run('--control', 'x').status).toBe(2)
    expect(run('--control', '10', '--chance-to-win', '20').status).toBe(3)
  })
})
