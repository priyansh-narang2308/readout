#!/usr/bin/env node
/**
 * The pre-registered sample-ratio (SRM) check, EXPERIMENT.md §10 rule 1 (amended 17 Nov, before any Production data).
 *
 * Why it exists: Flagsmith 2.291.0 takes SRM's expected split from the flag's environment default, where
 * `chance_to_win` has weight 0 by design (the experiment sets the 50/50), so it never computes `srm_p_value` for this
 * experiment and never shows a warning (evidence/development/validation.md, "Why Flagsmith reports no SRM p-value").
 *
 * The test is Flagsmith's own (v2.291.0 `stats.srm_p_value`): Pearson chi-squared goodness of fit of the exposure
 * counts per arm against the configured 50/50 split, one degree of freedom. Inputs are the per-arm exposure counts
 * shown on Flagsmith's results page at the final refresh. Not assessed below 100 exposures in total (Flagsmith's
 * SRM_MIN_TOTAL_IDENTITIES). Warning at p < 0.001 (Flagsmith's convention).
 *
 *   node scripts/srm.mjs --control 140 --chance-to-win 150
 *
 * Exit codes: 0 no warning · 1 SRM WARNING (rule 1: no result is interpreted) · 2 bad input · 3 not assessed (< 100)
 */
export const MIN_TOTAL = 100
export const ALPHA = 0.001

/** Chi-squared survival for one degree of freedom: P(X ≥ x) = erfc(√(x/2)). */
function erfc(x) {
  // Numerical Recipes erfcc, fractional error < 1.2e-7 everywhere.
  const z = Math.abs(x)
  const t = 1 / (1 + 0.5 * z)
  const r =
    t *
    Math.exp(
      -z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    )
  return x >= 0 ? r : 2 - r
}

/** { statistic, p, verdict: 'ok' | 'warning' | 'not_assessed' } for two arms against 50/50. */
export function srmCheck(control, chanceToWin) {
  for (const n of [control, chanceToWin]) if (!Number.isInteger(n) || n < 0) throw new Error('counts must be whole numbers ≥ 0')
  const total = control + chanceToWin
  if (total < MIN_TOTAL) return { total, statistic: null, p: null, verdict: 'not_assessed' }
  const expected = total / 2
  const statistic = ((control - expected) ** 2 + (chanceToWin - expected) ** 2) / expected
  const p = statistic <= 0 ? 1 : erfc(Math.sqrt(statistic / 2))
  return { total, statistic, p, verdict: p < ALPHA ? 'warning' : 'ok' }
}

const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const args = process.argv.slice(2)
  const opt = (name) => {
    const i = args.indexOf(name)
    return i >= 0 ? Number(args[i + 1]) : NaN
  }
  let r
  try {
    r = srmCheck(opt('--control'), opt('--chance-to-win'))
  } catch (e) {
    console.error(`srm: ${e.message}. Usage: node scripts/srm.mjs --control <n> --chance-to-win <n>`)
    process.exit(2)
  }
  if (r.verdict === 'not_assessed') {
    console.log(`SRM: not assessed (${r.total} exposures in total, needs ${MIN_TOTAL}). Rule 2 applies: no conclusion.`)
    process.exit(3)
  }
  const p = r.p < 0.0001 ? r.p.toExponential(2) : r.p.toFixed(4)
  console.log(`SRM check (pre-registered, EXPERIMENT.md §10 rule 1): control ${opt('--control')} · chance_to_win ${opt('--chance-to-win')} · χ² = ${r.statistic.toFixed(3)} · p = ${p}`)
  if (r.verdict === 'warning') {
    console.log(`SRM WARNING (p < ${ALPHA}): traffic did not split 50/50 as configured. Rule 1: no result is interpreted.`)
    process.exit(1)
  }
  console.log(`No SRM warning (p ≥ ${ALPHA}). Continue with rule 2.`)
}
