#!/usr/bin/env node
/**
 * No-secrets check (29 §11, 33 §6). Scans every file that could be committed or deployed: the project tree minus
 * node_modules and the git-ignored local files, plus the built dist/ when present. It fails on:
 *   - credential shapes: Flagsmith server-side keys (ser.…), Admin API tokens ("Api-Key …" / "Token <40 hex>"),
 *     private keys, and common cloud/VCS tokens;
 *   - the client env key's actual value anywhere except .env and dist/ (it may ship in the bundle, by Flagsmith's
 *     design, but it is never committed to source);
 *   - an email address in source, docs or the bundle (no personal data in the app or repo);
 *   - a frontend-visible (VITE_*) variable whose name says it is secret, in .env or .env.example;
 *   - a .gitignore that doesn't keep .env*, node_modules and dist out of the repo (while keeping .env.example).
 * It never prints a matched value: only the file, the line and the kind of match.
 *
 * Usage: node scripts/check-secrets.mjs [--root <dir>]   (exit 0 = clean, 1 = problems)
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const rootArg = process.argv.indexOf('--root')
const ROOT = rootArg > 0 ? process.argv[rootArg + 1] : process.cwd()

const SKIP_DIRS = new Set(['node_modules', '.git', 'coverage', 'playwright-report', 'test-results', '.vercel', '.netlify'])
const LOCAL_FILE = (name) => name === '.env' || (name.startsWith('.env.') && name !== '.env.example') || name.endsWith('.local')
const BINARY = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf|zip|gz)$/i

const SHAPES = [
  { kind: 'Flagsmith server-side environment key', re: /\bser\.[A-Za-z0-9]{16,}/ },
  { kind: 'Flagsmith Admin API token', re: /\bApi-Key\s+[A-Za-z0-9._-]{16,}|\bToken\s+[a-f0-9]{40}\b/ },
  { kind: 'private key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { kind: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { kind: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{30,}/ },
  { kind: 'Slack token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { kind: 'API secret key', re: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { kind: 'Vercel/Netlify token', re: /\b(VERCEL|NETLIFY)_(AUTH_)?TOKEN\s*=\s*\S{8,}/ },
]
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g
// Placeholder addresses used only as format examples are fine.
const EMAIL_OK = /@(example\.(com|org|net)|users\.noreply\.github\.com|anthropic\.com)$/i

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(p, out)
    } else if (!LOCAL_FILE(name) && !BINARY.test(name)) out.push(p)
  }
  return out
}

function parseEnv(path) {
  if (!existsSync(path)) return {}
  const env = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return env
}

const problems = []
const rel = (p) => relative(ROOT, p).split(sep).join('/')

// 1. The ignore rules.
const gi = existsSync(join(ROOT, '.gitignore')) ? readFileSync(join(ROOT, '.gitignore'), 'utf8').split('\n').map((l) => l.trim()) : []
for (const need of ['.env', '.env.*', '!.env.example', 'node_modules', 'dist']) {
  if (!gi.includes(need)) problems.push(`.gitignore  missing "${need}"`)
}

// 2. Frontend-visible names that claim to be secret.
for (const file of ['.env', '.env.example']) {
  for (const name of Object.keys(parseEnv(join(ROOT, file)))) {
    if (/^VITE_/.test(name) && /SECRET|ADMIN|SERVER|TOKEN|PASSWORD|PRIVATE|SDK_KEY/.test(name)) {
      problems.push(`${file}  ${name}: a VITE_ variable is inlined into the public bundle; secrets must not be VITE_`)
    }
  }
}
const example = parseEnv(join(ROOT, '.env.example'))
if (example.VITE_FLAGSMITH_ENV_KEY) problems.push('.env.example  VITE_FLAGSMITH_ENV_KEY has a value; the example must leave it empty')

// 3. Every committable or deployable file.
const clientKey = (parseEnv(join(ROOT, '.env')).VITE_FLAGSMITH_ENV_KEY ?? '').trim()
const files = walk(ROOT)
for (const file of files) {
  const r = rel(file)
  const inDist = r.startsWith('dist/')
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    for (const s of SHAPES) if (s.re.test(line)) problems.push(`${r}:${i + 1}  ${s.kind}`)
    if (clientKey.length >= 8 && !inDist && line.includes(clientKey)) {
      problems.push(`${r}:${i + 1}  the client env key's value (belongs in .env only)`)
    }
    if (r !== 'package-lock.json') {
      for (const m of line.matchAll(EMAIL)) if (!EMAIL_OK.test(m[0])) problems.push(`${r}:${i + 1}  email address`)
    }
  })
}

if (problems.length) {
  console.error(`No-secrets check: ${problems.length} problem(s) (values are never printed)`)
  for (const p of problems) console.error(`  ${p}`)
  process.exit(1)
}
const scope = existsSync(join(ROOT, 'dist')) ? 'including dist/' : 'no dist/ yet'
console.log(`No-secrets check: ok (${files.length} files, ${scope}; .gitignore and env names ok)`)
