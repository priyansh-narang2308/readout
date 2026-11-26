/**
 * The Flagsmith setup files (flagsmith/*.json) are what an operator pastes into the console or the API. They must
 * name exactly the events the app sends, with the pre-registered aggregation and directions (EXPERIMENT.md §6), and
 * use only values Flagsmith accepts (research 03: Metric.direction, ExpectedDirection).
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EVENT } from './measurement'

const read = (f: string) => JSON.parse(readFileSync(`flagsmith/${f}`, 'utf8')) as Record<string, unknown>
const METRICS = ['m1', 'm2', 'm3', 'm4', 'm5'].map((m) => read(`${m}.json`)) as {
  name: string
  aggregation: string
  direction: string
  definition: { version: number; event: string }
}[]
const EXP = read('experiment.template.json') as {
  name: string
  metrics: { metric: string; expected_direction: string }[]
  experiment_rollout: {
    rollout_percentage: number
    feature_state_value: { value: string }
    multivariate_feature_state_values: { percentage_allocation: number }[]
  }
}

// What EXPERIMENT.md §6 pre-registers, in order.
const PLAN = [
  { event: EVENT.score, aggregation: 'mean', expected: 'increase' },
  { event: EVENT.completed, aggregation: 'occurrence', expected: 'not_decrease' },
  { event: EVENT.lossCall, aggregation: 'mean', expected: 'increase' },
  { event: EVENT.nearMissCall, aggregation: 'mean', expected: 'not_decrease' },
  { event: EVENT.rulesCopied, aggregation: 'occurrence', expected: 'increase' },
]

describe('flagsmith/ setup files', () => {
  it('one metric per event the app sends, with the pre-registered aggregation, all direction up', () => {
    expect(METRICS.map((m) => m.definition.event)).toEqual(PLAN.map((p) => p.event))
    expect(new Set(METRICS.map((m) => m.definition.event))).toEqual(new Set(Object.values(EVENT)))
    METRICS.forEach((m, i) => {
      expect(m.aggregation).toBe(PLAN[i]!.aggregation)
      expect(m.direction).toBe('up')
      expect(m.definition.version).toBe(1)
    })
  })

  it('only values Flagsmith accepts', () => {
    for (const m of METRICS) {
      expect(['occurrence', 'count', 'sum', 'mean']).toContain(m.aggregation)
      expect(['up', 'down', 'informational']).toContain(m.direction)
    }
    for (const m of EXP.metrics) expect(['increase', 'decrease', 'not_increase', 'not_decrease']).toContain(m.expected_direction)
  })

  it('the experiment: M1–M5 with the pre-registered directions (M5 increase, exploratory), 100% rollout, 50/50', () => {
    expect(EXP.metrics.map((m) => m.expected_direction)).toEqual(PLAN.map((p) => p.expected))
    expect(EXP.metrics.map((m) => m.metric)).toEqual(['<M1_ID>', '<M2_ID>', '<M3_ID>', '<M4_ID>', '<M5_ID>'])
    expect(EXP.experiment_rollout.rollout_percentage).toBe(100)
    expect(EXP.experiment_rollout.feature_state_value.value).toBe('p_value')
    expect(EXP.experiment_rollout.multivariate_feature_state_values.map((v) => v.percentage_allocation)).toEqual([50])
  })

  it('EXPERIMENT.md §6 states the same directions', () => {
    const md = readFileSync('EXPERIMENT.md', 'utf8')
    for (const [i, p] of PLAN.entries()) {
      const row = md.split('\n').find((l) => l.startsWith(`| M${i + 1} |`))
      expect(row, `M${i + 1} row`).toContain(`\`${p.event}\``)
      expect(row).toContain(p.expected)
      if (p.expected === 'increase') expect(row).not.toContain('not_decrease')
    }
  })
})
