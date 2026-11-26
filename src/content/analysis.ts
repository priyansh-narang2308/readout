/**
 * Derived statistics per scenario and the answer key derived from the Readout Rules (27 §6). FROZEN at tag measured-v1.
 * The authored key in scenarios.v1.ts must equal defensibleCall(); a test enforces it.
 */
import {
  compareToControl,
  conversionStats,
  srm,
  SRM_ALPHA,
  type Inference,
  type SrmResult,
} from '../stats/flagsmithStats'
import type { Call, MetricSpec, Scenario } from './scenarios.v1'

export type MetricAnalysis = {
  spec: MetricSpec
  controlRate: number
  variantRate: number
  inference: Inference
}

export type ScenarioAnalysis = {
  primary: MetricAnalysis
  guardrail?: MetricAnalysis
  srm: SrmResult
  totalUsers: number
}

export function analyseMetric(spec: MetricSpec): MetricAnalysis {
  const c = conversionStats(spec.control.users, spec.control.conversions)
  const v = conversionStats(spec.variant.users, spec.variant.conversions)
  const inference = compareToControl(c, v, spec.direction)
  if (!inference) throw new Error(`No inference for ${spec.name}`)
  return {
    spec,
    controlRate: spec.control.conversions / spec.control.users,
    variantRate: spec.variant.conversions / spec.variant.users,
    inference,
  }
}

export function analyse(s: Pick<Scenario, 'primary' | 'guardrail' | 'checks'>): ScenarioAnalysis {
  const primary = analyseMetric(s.primary)
  return {
    primary,
    guardrail: s.guardrail ? analyseMetric(s.guardrail) : undefined,
    srm: srm([s.primary.control.users, s.primary.variant.users], s.checks.configured),
    totalUsers: s.primary.control.users + s.primary.variant.users,
  }
}

/** Interval entirely on the metric's bad side. */
export function entirelyBad(m: MetricAnalysis): boolean {
  return m.spec.direction === 'up' ? m.inference.ciHigh < 0 : m.inference.ciLow > 0
}

/** Interval entirely on the metric's good side. */
export function entirelyGood(m: MetricAnalysis): boolean {
  return m.spec.direction === 'up' ? m.inference.ciLow > 0 : m.inference.ciHigh < 0
}

export type Decision = Call | 'undecidable'

/** The Rules ladder applied to raw data (27 §6). */
export function defensibleCall(s: Pick<Scenario, 'primary' | 'guardrail' | 'checks'>): Decision {
  const a = analyse(s)
  if (a.srm.pValue < SRM_ALPHA) return 'distrust' // Rule 1
  if (a.totalUsers < s.checks.usersPlanned) return 'collecting' // Rule 2
  if (entirelyBad(a.primary)) return 'control' // Rule 3
  if (!entirelyGood(a.primary)) return 'control' // Rule 4: crosses zero at the full sample
  if (a.guardrail && entirelyBad(a.guardrail)) return 'control' // Rule 5
  if (a.primary.inference.chanceToWin >= 0.975 && entirelyGood(a.primary)) return 'ship' // Rule 6
  return 'undecidable'
}
