#!/usr/bin/env node
/**
 * Sample Ratio Mismatch (SRM) Chi-Square Test.
 * Zero external dependencies. Fast and token-efficient.
 *
 * Usage:
 *   node srm_check.mjs --control 104 --treatment 96 [--ratio 50/50]
 */

const args = process.argv.slice(2)
const getArg = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

const nC = Number(getArg('--control') ?? getArg('-c'))
const nT = Number(getArg('--treatment') ?? getArg('-t'))
const ratioStr = getArg('--ratio') ?? '50/50'

if (Number.isNaN(nC) || Number.isNaN(nT) || nC < 0 || nT < 0) {
  console.error('Usage: node srm_check.mjs --control <n> --treatment <n> [--ratio 50/50]')
  process.exit(2)
}

const [rC, rT] = ratioStr.split('/').map(Number)
if (!rC || !rT) {
  console.error('Invalid ratio format. Use 50/50, 1/1, etc.')
  process.exit(2)
}

const total = nC + nT
if (total === 0) {
  console.log(JSON.stringify({ total: 0, srm: false, reason: 'zero-exposures' }))
  process.exit(0)
}

const probC = rC / (rC + rT)
const probT = rT / (rC + rT)
const expC = total * probC
const expT = total * probT

// Pearson's chi-square test with 1 degree of freedom
const chiSquare = Math.pow(nC - expC, 2) / expC + Math.pow(nT - expT, 2) / expT

// Approximation of p-value for chi-square with df=1: p = erfc(sqrt(chiSquare / 2))
function erfc(x) {
  // Complementary error function approximation (Abramowitz and Stegun)
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911
  const sign = x < 0 ? -1 : 1
  const absX = Math.abs(x)
  const t = 1.0 / (1.0 + p * absX)
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX)
  return sign === 1 ? 1 - y : 1 + y
}

const pValue = erfc(Math.sqrt(chiSquare / 2))
const hasSRM = pValue < 0.001

const result = {
  control: nC,
  treatment: nT,
  total,
  expectedRatio: `${rC}:${rT}`,
  chiSquare: Number(chiSquare.toFixed(4)),
  pValue: Number(pValue.toFixed(6)),
  hasSRM,
  verdict: hasSRM
    ? 'CRITICAL WARNING: Sample Ratio Mismatch detected (p < 0.001). Do not evaluate winner.'
    : 'PASS: No SRM detected (p >= 0.001). Sample distribution is valid.',
}

if (args.includes('--json')) {
  console.log(JSON.stringify(result, null, 2))
} else {
  console.log(`SRM Audit: Control=${nC}, Treatment=${nT} (Total=${total})`)
  console.log(`Expected Ratio: ${rC}:${rT} | Chi-Square: ${result.chiSquare} | p-value: ${result.pValue}`)
  console.log(`Verdict: ${result.verdict}`)
}

if (hasSRM) process.exit(1)
