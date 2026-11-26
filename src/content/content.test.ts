import { analyse, defensibleCall } from './analysis'
import { answersString, lossCall, nearMissCall, patterns, score, shuffled, ALL_DEFENSIBLE_TEXT, type Answers } from './scoring'
import { CALLS, MEASURED_ORDER, PREVIEW_SCENARIO, SCENARIOS, type Call, type ScenarioId } from './scenarios.v1'
import { RESULTS_MIN_CONVERSIONS_PER_VARIANT, RESULTS_MIN_IDENTITIES_PER_VARIANT } from '../stats/flagsmithStats'
import { rulesMarkdown, RULES } from './rules'

const ids = Object.keys(SCENARIOS) as ScenarioId[]

describe('T-KEY: answer key is derived from the Rules', () => {
  it.each(ids)('%s: defensibleCall equals the authored key', (id) => {
    expect(defensibleCall(SCENARIOS[id])).toBe(SCENARIOS[id].key)
  })
  it('measured order is exactly [S3, S1, S5, S2, S4, S6] (corrected 14 Nov; see DEVLOG)', () => {
    expect(MEASURED_ORDER).toEqual(['S3', 'S1', 'S5', 'S2', 'S4', 'S6'])
  })
  it('answer balance is ship 1, control 2, collecting 2, distrust 1', () => {
    const count = (c: Call) => ids.filter((id) => SCENARIOS[id].key === c).length
    expect([count('ship'), count('control'), count('collecting'), count('distrust')]).toEqual([1, 2, 2, 1])
  })
  it('no two adjacent measured results share an answer', () => {
    for (let i = 1; i < MEASURED_ORDER.length; i++) {
      expect(SCENARIOS[MEASURED_ORDER[i]!].key).not.toBe(SCENARIOS[MEASURED_ORDER[i - 1]!].key)
    }
  })
  it('a constant answer scores at most 2/6', () => {
    for (const c of CALLS) {
      const a: Answers = Object.fromEntries(ids.map((id) => [id, c]))
      expect(score(a)).toBeLessThanOrEqual(2 / 6)
    }
  })
})

describe('U-6: guardrail logic', () => {
  it('S6 guardrail uses the lower-is-better convention (chance near 0)', () => {
    const a = analyse(SCENARIOS.S6)
    expect(a.guardrail!.inference.chanceToWin).toBeLessThan(0.01)
  })
  it('if the guardrail interval crossed zero, S6 would be a ship', () => {
    const s = { ...SCENARIOS.S6, guardrail: { ...SCENARIOS.S6.guardrail!, variant: { users: 5000, conversions: 55 } } }
    expect(defensibleCall(s)).toBe('ship')
  })
  it('an improved lower-is-better guardrail does not block', () => {
    const s = { ...SCENARIOS.S6, guardrail: { ...SCENARIOS.S6.guardrail!, variant: { users: 5000, conversions: 20 } } }
    expect(defensibleCall(s)).toBe('ship')
  })
})

describe('T-ZONE and T-FLOOR', () => {
  it.each(ids.filter((id) => id !== 'S5'))('%s primary |z| outside (1.4, 2.2)', (id) => {
    const z = Math.abs(analyse(SCENARIOS[id]).primary.inference.z)
    expect(z <= 1.4 || z >= 2.2).toBe(true)
  })
  it.each(ids)('%s meets the Flagsmith display floors', (id) => {
    const s = SCENARIOS[id]
    for (const m of [s.primary, s.guardrail].filter(Boolean)) {
      for (const arm of [m!.control, m!.variant]) {
        expect(arm.users).toBeGreaterThanOrEqual(RESULTS_MIN_IDENTITIES_PER_VARIANT)
        expect(arm.conversions).toBeGreaterThanOrEqual(RESULTS_MIN_CONVERSIONS_PER_VARIANT)
      }
    }
  })
  it('the preview card is not one of the six and computes cleanly', () => {
    expect(ids.map((id) => SCENARIOS[id].title)).not.toContain(PREVIEW_SCENARIO.title)
    expect(analyse(PREVIEW_SCENARIO).primary.inference.lift).toBeCloseTo(0.1, 10)
  })
})

describe('T-SCORE', () => {
  const allCorrect: Answers = Object.fromEntries(ids.map((id) => [id, SCENARIOS[id].key]))
  const all = (c: Call): Answers => Object.fromEntries(ids.map((id) => [id, c]))
  it('all correct → (1, 1, 1)', () => {
    expect([score(allCorrect), lossCall(allCorrect), nearMissCall(allCorrect)]).toEqual([1, 1, 1])
  })
  it('all ship → (1/6, 0, 0)', () => {
    expect([score(all('ship')), lossCall(all('ship')), nearMissCall(all('ship'))]).toEqual([1 / 6, 0, 0])
  })
  it('all collecting → (2/6, 0, 1)', () => {
    expect([score(all('collecting')), lossCall(all('collecting')), nearMissCall(all('collecting'))]).toEqual([2 / 6, 0, 1])
  })
  it('unanswered counts as incorrect; answers string is in play order', () => {
    expect(score({})).toBe(0)
    expect(answersString(allCorrect)).toBe('S3:collecting,S1:ship,S5:distrust,S2:control,S4:collecting,S6:control')
  })
})

describe('T-PATTERN', () => {
  const allCorrect: Answers = Object.fromEntries(ids.map((id) => [id, SCENARIOS[id].key]))
  it('6/6 → no patterns (the all-defensible message is shown instead)', () => {
    expect(patterns(allCorrect)).toEqual([])
    expect(ALL_DEFENSIBLE_TEXT).toMatch(/Every call was defensible/)
  })
  it('S3 and S4 both ship → "repeated"', () => {
    const p = patterns({ ...allCorrect, S3: 'ship', S4: 'ship' })
    expect(p.map((x) => x.id)).toEqual(['early-repeated'])
  })
  it('each pattern triggers exactly under its rule', () => {
    expect(patterns({ ...allCorrect, S2: 'ship' }).map((x) => x.id)).toEqual(['significant-good'])
    expect(patterns({ ...allCorrect, S5: 'collecting' }).map((x) => x.id)).toEqual(['broken-split'])
    expect(patterns({ ...allCorrect, S6: 'ship' }).map((x) => x.id)).toEqual(['guardrail'])
    expect(patterns({ ...allCorrect, S3: 'ship' }).map((x) => x.id)).toEqual(['early'])
    expect(patterns({ ...allCorrect, S2: 'collecting' }).map((x) => x.id)).toEqual(['waiting-loss'])
    expect(patterns({ ...allCorrect, S1: 'control' }).map((x) => x.id)).toEqual(['over-caution'])
    expect(patterns({ ...allCorrect, S4: 'distrust' }).map((x) => x.id)).toEqual(['distrust-clean'])
  })
})

describe('T-COPY and rules', () => {
  it('S6 guardrail label carries the team rule', () => {
    expect(SCENARIOS.S6.guardrail!.rule).toMatch(/don’t ship if refunds get clearly worse/)
  })
  it('rules markdown is a six-item checklist', () => {
    const md = rulesMarkdown()
    expect(md.match(/^- \[ \] /gm)).toHaveLength(6)
    expect(RULES.map((r) => r.n)).toEqual([1, 2, 3, 4, 5, 6])
  })
  it('practice shuffle is a permutation', () => {
    expect([...shuffled(MEASURED_ORDER)].sort()).toEqual([...MEASURED_ORDER].sort())
  })
})
