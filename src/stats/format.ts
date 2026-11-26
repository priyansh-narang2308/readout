/**
 * Display formatting (27 §3, 26 §2). FROZEN at tag measured-v1.
 * True minus sign U+2212. No thin space before %.
 */
export const MINUS = '−'

function signed(x: number, digits: number): string {
  const r = Number((x * 100).toFixed(digits))
  const s = Math.abs(r).toFixed(digits)
  if (r > 0) return `+${s}`
  if (r < 0) return `${MINUS}${s}`
  return s
}

/** Rate: 1 decimal place, %. 0.04 → "4.0%". */
export function fmtRate(p: number): string {
  return `${(p * 100).toFixed(1)}%`
}

/** Lift: signed, 1 dp. −0.191667 → "−19.2%". */
export function fmtLift(x: number): string {
  return `${signed(x, 1)}%`
}

/** Interval: "lo to hi", both signed. */
export function fmtInterval(lo: number, hi: number): string {
  return `${fmtLift(lo)} to ${fmtLift(hi)}`
}

/** p-value: 2 significant figures; "< 0.001" below 0.001. */
export function fmtP(p: number): string {
  if (p < 0.001) return '< 0.001'
  const s = Number(p.toPrecision(2))
  // toPrecision can give exponent form for tiny numbers; we are always ≥ 0.001 here.
  return s.toString()
}

/** Chance: whole percent; "< 1%" below 0.5%; "> 99%" at 99.5% or above. */
export function fmtChance(c: number): string {
  if (c < 0.005) return '< 1%'
  if (c >= 0.995) return '> 99%'
  return `${Math.round(c * 100)}%`
}

/** Thousands separator. */
export function fmtCount(n: number): string {
  return n.toLocaleString('en-US')
}

/** Split: "58.8 / 41.2 (configured 50 / 50)". */
export function fmtSplit(observedShares: number[], configured: number[]): string {
  const obs = observedShares.map((s) => (s * 100).toFixed(1)).join(' / ')
  const cfg = configured.map((s) => Math.round(s * 100).toString()).join(' / ')
  return `${obs} (configured ${cfg})`
}

/** Absolute difference in percentage points, signed, 1 dp. */
export function fmtPp(diff: number): string {
  return `${signed(diff, 1)} pp`
}
