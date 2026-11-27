#!/usr/bin/env node
// Sample-ratio check: Pearson chi-squared of two exposure counts against a 50/50 split, 1 degree of freedom.
// node srm.mjs --a 140 --b 150   →  one line.  Exit: 0 ok · 1 SRM warning (p < 0.001) · 2 bad input · 3 not assessed (< 100)
export const MIN_TOTAL = 100
export const ALPHA = 0.001

function erfc(x) {
  const z = Math.abs(x), t = 1 / (1 + 0.5 * z)
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 +
    t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))))
  return x >= 0 ? r : 2 - r
}

export function srm(a, b) {
  if (![a, b].every((n) => Number.isInteger(n) && n >= 0)) throw new Error('counts must be whole numbers ≥ 0')
  const total = a + b
  if (total < MIN_TOTAL) return { total, p: null, verdict: 'not_assessed' }
  const e = total / 2, chi = ((a - e) ** 2 + (b - e) ** 2) / e
  const p = chi <= 0 ? 1 : erfc(Math.sqrt(chi / 2))
  return { total, p, verdict: p < ALPHA ? 'warning' : 'ok' }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k) => { const v = process.argv[process.argv.indexOf(k) + 1]; return /^\d+$/.test(v ?? '') ? Number(v) : NaN }
  let r
  try { r = srm(arg('--a'), arg('--b')) } catch (e) { console.log(`srm: ${e.message}`); process.exit(2) }
  if (r.verdict === 'not_assessed') { console.log(`srm: not assessed (${r.total} < ${MIN_TOTAL} exposures)`); process.exit(3) }
  console.log(`srm: ${r.verdict === 'ok' ? 'ok' : 'WARNING broken split'} (n=${r.total}, p=${r.p.toPrecision(3)})`)
  process.exit(r.verdict === 'ok' ? 0 : 1)
}
