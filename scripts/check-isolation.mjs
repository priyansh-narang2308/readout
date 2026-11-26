#!/usr/bin/env node
/**
 * Measurement isolation (29 §12.1 U-10, 33 §6). Fails if any app source outside its one home does something that
 * can send to Flagsmith or the network:
 *   - trackEvent / flushEvents      only in src/flagsmith/measurement.ts
 *   - useExperiment                 only in src/flagsmith/MeasuredSession.tsx
 *   - the Flagsmith SDK import      only in src/flagsmith/client.ts and MeasuredSession.tsx
 *   - fetch(                        only in src/flagsmith/deliveryMonitor.ts (the SDK's monitored fetch)
 *   - trackExposureEvent, getExperimentFlag, XMLHttpRequest, sendBeacon, WebSocket, EventSource: nowhere
 *   - index.html loads no external script, style or font
 * Tests and test utilities are exempt (they fake the network on purpose). Comments are ignored; string and JSX text
 * mentions (e.g. the About page naming useExperiment) don't match because every rule needs a call or an import.
 *
 * Usage: node scripts/check-isolation.mjs [--root <dir>]   (exit 0 = clean, 1 = violations)
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const rootArg = process.argv.indexOf('--root')
const ROOT = rootArg > 0 ? process.argv[rootArg + 1] : process.cwd()

const RULES = [
  { name: 'trackEvent', re: /\.\s*trackEvent\s*\(/, only: ['src/flagsmith/measurement.ts'] },
  { name: 'flushEvents', re: /\.\s*flushEvents\s*\(/, only: ['src/flagsmith/measurement.ts'] },
  { name: 'useExperiment', re: /\buseExperiment\s*\(|import\s*\{[^}]*\buseExperiment\b[^}]*\}/, only: ['src/flagsmith/MeasuredSession.tsx'] },
  {
    name: 'Flagsmith SDK import',
    re: /from\s+['"]@flagsmith\/flagsmith(?:\/[^'"]*)?['"]|import\(\s*['"]@flagsmith\/flagsmith/,
    only: ['src/flagsmith/client.ts', 'src/flagsmith/MeasuredSession.tsx'],
  },
  { name: 'fetch(', re: /(?<![\w$])fetch\s*\(/, only: ['src/flagsmith/deliveryMonitor.ts'] },
  { name: 'trackExposureEvent', re: /\btrackExposureEvent\b/, only: [] },
  { name: 'getExperimentFlag', re: /\bgetExperimentFlag\b/, only: [] },
  { name: 'other network API', re: /\bXMLHttpRequest\b|\bsendBeacon\s*\(|\bnew\s+WebSocket\s*\(|\bnew\s+EventSource\s*\(/, only: [] },
]

const isTest = (p) => /\.test\.[cm]?[jt]sx?$/.test(p) || /\.testutil\.[jt]sx?$/.test(p)

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.[cm]?[jt]sx?$/.test(name)) out.push(p)
  }
  return out
}

/** Blank out comments, keeping line numbers. Strings stay (a rule always needs code shape around them anyway). */
function stripComments(src) {
  let out = ''
  let i = 0
  let quote = null
  while (i < src.length) {
    const c = src[i]
    const n = src[i + 1]
    if (quote) {
      out += c
      if (c === '\\') {
        out += n ?? ''
        i += 2
        continue
      }
      if (c === quote) quote = null
      i++
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c
      out += c
      i++
    } else if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++
    } else if (c === '/' && n === '*') {
      i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') out += '\n'
        i++
      }
      i += 2
    } else {
      out += c
      i++
    }
  }
  return out
}

const problems = []
const files = walk(join(ROOT, 'src')).filter((p) => !isTest(p))
if (files.length === 0) problems.push(`no source files found under ${join(ROOT, 'src')}`)

for (const file of files) {
  const rel = relative(ROOT, file).split(sep).join('/')
  const lines = stripComments(readFileSync(file, 'utf8')).split('\n')
  for (const rule of RULES) {
    if (rule.only.includes(rel)) continue
    lines.forEach((line, i) => {
      if (rule.re.test(line)) problems.push(`${rel}:${i + 1}  ${rule.name} outside ${rule.only.join(' / ') || 'the app (never allowed)'}`)
    })
  }
}

// Each home must still hold its call: a rule that matches nothing anywhere would pass vacuously after a rename.
for (const rule of RULES.filter((r) => r.only.length)) {
  const found = rule.only.some((rel) => {
    const p = join(ROOT, rel)
    return existsSync(p) && rule.re.test(stripComments(readFileSync(p, 'utf8')))
  })
  if (!found) problems.push(`${rule.name}: expected in ${rule.only.join(' / ')} but not found (renamed or moved?)`)
}

const html = join(ROOT, 'index.html')
if (existsSync(html)) {
  readFileSync(html, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (/<(script|link)\b[^>]*\b(src|href)\s*=\s*["']?(https?:)?\/\//i.test(line)) problems.push(`index.html:${i + 1}  external resource`)
    })
}

if (problems.length) {
  console.error(`Measurement isolation: ${problems.length} problem(s)`)
  for (const p of problems) console.error(`  ${p}`)
  process.exit(1)
}
console.log(`Measurement isolation: ok (${files.length} source files, ${RULES.length} rules, index.html clean)`)
