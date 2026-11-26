/**
 * TypeScript port of Flagsmith's experiment statistics (api/experimentation/stats.py, read at commit 64c1ebe),
 * plus Readout's own two-sided p-value derived from the same z.
 *
 * One model, two presentations: chance to beat control and the p-value both come from the same z.
 * Readout does NOT compare two statistical engines.
 *
 * FROZEN at tag measured-v1.
 */

export const Z_95 = 1.959963984540054

export type VariantStats = { n: number; sum: number; sumSquares: number }

export type Direction = 'up' | 'down'

export type Inference = {
  lift: number
  ciLow: number
  ciHigh: number
  /** Flagsmith's chance to beat control, already flipped for lower-is-better metrics. */
  chanceToWin: number
  se: number
  z: number
  /** Two-sided Wald p-value from the same z. Readout's derivation; Flagsmith does not display p-values. */
  pValue: number
}

/** Conversion metric: each user contributes 0 or 1, so sum = sumSquares = conversions. */
export function conversionStats(n: number, conversions: number): VariantStats {
  return { n, sum: conversions, sumSquares: conversions }
}

export function mean(s: VariantStats): number {
  return s.sum / s.n
}

/** Sample variance as in stats.py: max(0, (ss − s²/n) / (n − 1)). */
export function variance(s: VariantStats): number {
  if (s.n < 2) return 0
  return Math.max(0, (s.sumSquares - (s.sum * s.sum) / s.n) / (s.n - 1))
}

// ---------- normal distribution ----------

/**
 * Complementary error function, accurate to about 1e-15 relative.
 * Small |x|: Maclaurin series of erf. Larger |x|: Lentz continued fraction.
 */
export function erfc(x: number): number {
  if (Number.isNaN(x)) return NaN
  if (x < 0) return 2 - erfc(-x)
  if (x < 0.5) return 1 - erfSeries(x)
  if (x > 27) return 0
  // erfc(x) = exp(-x²)/√π · 1/(x + (1/2)/(x + 1/(x + (3/2)/(x + 2/(x + ...)))))
  const tiny = 1e-300
  let f = x
  let C = x
  let D = 0
  for (let i = 1; i < 5000; i++) {
    const a = i / 2
    D = x + a * D
    D = Math.abs(D) < tiny ? tiny : D
    C = x + a / C
    C = Math.abs(C) < tiny ? tiny : C
    D = 1 / D
    const delta = C * D
    f *= delta
    if (Math.abs(delta - 1) < 1e-16) break
  }
  return Math.exp(-x * x) / Math.sqrt(Math.PI) / f
}

function erfSeries(x: number): number {
  // erf(x) = 2/√π · Σ (−1)^n x^(2n+1) / (n! (2n+1))
  let term = x
  let sum = x
  const x2 = x * x
  for (let n = 1; n < 200; n++) {
    term *= -x2 / n
    const add = term / (2 * n + 1)
    sum += add
    if (Math.abs(add) < 1e-17 * Math.abs(sum)) break
  }
  return (2 / Math.sqrt(Math.PI)) * sum
}

/** Standard normal CDF Φ(x) = ½·erfc(−x/√2). */
export function normalCdf(x: number): number {
  return 0.5 * erfc(-x / Math.SQRT2)
}

export function chanceFromZ(z: number): number {
  return normalCdf(z)
}

/** Two-sided p from z: 2·(1 − Φ(|z|)) = erfc(|z|/√2). */
export function pFromZ(z: number): number {
  return erfc(Math.abs(z) / Math.SQRT2)
}

/** The identity in 27 §4.1: for a higher-is-better metric, chance = 1 − p/2 when z > 0 and p/2 when z < 0. */
export function pFromChance(chance: number, sign: 1 | -1): number {
  return sign > 0 ? 2 * (1 - chance) : 2 * chance
}

// ---------- compare_to_control ----------

/**
 * Port of stats.py `compare_to_control` with the direction handling of `services._infer_treatment`.
 * Returns null if either arm has n < 2 or the control mean is ≤ 0 (as in the source).
 */
export function compareToControl(
  control: VariantStats,
  treatment: VariantStats,
  direction: Direction = 'up',
): Inference | null {
  if (control.n < 2 || treatment.n < 2) return null
  const mc = mean(control)
  const mt = mean(treatment)
  if (mc <= 0) return null
  const vc = variance(control)
  const vt = variance(treatment)
  const lift = (mt - mc) / mc
  const se = Math.sqrt(vt / (treatment.n * mc * mc) + (mt * mt * vc) / (control.n * mc ** 4))
  let chance: number
  let z: number
  if (se === 0) {
    z = lift === 0 ? 0 : lift > 0 ? Infinity : -Infinity
    chance = lift === 0 ? 0.5 : lift > 0 ? 1 : 0
  } else {
    z = lift / se
    chance = normalCdf(z)
  }
  if (direction === 'down') chance = 1 - chance
  return {
    lift,
    ciLow: lift - Z_95 * se,
    ciHigh: lift + Z_95 * se,
    chanceToWin: chance,
    se,
    z,
    pValue: se === 0 ? (lift === 0 ? 1 : 0) : pFromZ(z),
  }
}

// ---------- sample-ratio mismatch ----------

/** Upper tail of the χ² distribution with integer df (closed-form recurrence). */
export function chiSquareSurvival(x: number, df: number): number {
  if (x <= 0) return 1
  if (df % 2 === 0) {
    let term = 1
    let sum = 1
    for (let i = 1; i < df / 2; i++) {
      term *= x / 2 / i
      sum += term
    }
    return Math.exp(-x / 2) * sum
  }
  let p = erfc(Math.sqrt(x / 2))
  if (df > 1) {
    let term = Math.sqrt((2 * x) / Math.PI) * Math.exp(-x / 2)
    let sum = term
    for (let k = 3; k < df; k += 2) {
      term *= x / k
      sum += term
    }
    p += sum
  }
  return Math.min(1, Math.max(0, p))
}

export type SrmResult = { chiSquare: number; df: number; pValue: number; observedShares: number[] }

/** χ² goodness of fit of observed exposure counts against configured shares (stats.py `srm_p_value`). */
export function srm(observed: number[], expectedShares: number[]): SrmResult {
  const total = observed.reduce((a, b) => a + b, 0)
  let chi = 0
  observed.forEach((o, i) => {
    const e = total * (expectedShares[i] ?? 0)
    if (e > 0) chi += ((o - e) * (o - e)) / e
  })
  const df = observed.length - 1
  return {
    chiSquare: chi,
    df,
    pValue: chiSquareSurvival(chi, df),
    observedShares: observed.map((o) => (total > 0 ? o / total : 0)),
  }
}

/** Flagsmith's SRM warning threshold (statistics glossary). */
export const SRM_ALPHA = 0.001
/** Flagsmith's display floors (source constants). */
export const RESULTS_MIN_IDENTITIES_PER_VARIANT = 50
export const RESULTS_MIN_CONVERSIONS_PER_VARIANT = 5
export const SRM_MIN_TOTAL_IDENTITIES = 100
