/**
 * Task 33: the two repo checks are themselves tested. Each runs on the real tree (must pass), then on a throwaway
 * copy of a minimal tree with one violation planted (must fail and name it). Planted credentials are built from
 * pieces at run time so this file never contains a full credential shape itself.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const run = (script: string, root?: string) => {
  const r = spawnSync(process.execPath, [join('scripts', script), ...(root ? ['--root', root] : [])], { encoding: 'utf8' })
  return { code: r.status, out: `${r.stdout}${r.stderr}` }
}

let dirs: string[] = []
afterEach(() => {
  dirs.forEach((d) => rmSync(d, { recursive: true, force: true }))
  dirs = []
})

function tree(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'readout-check-'))
  dirs.push(root)
  for (const [p, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true })
    writeFileSync(join(root, p), text)
  }
  return root
}

const HOMES = {
  'src/flagsmith/measurement.ts': 'export function s(f: any) { f.trackEvent("x", {}); void f.flushEvents() }\n',
  'src/flagsmith/MeasuredSession.tsx': "import { useExperiment } from '@flagsmith/flagsmith/react'\nexport const M = () => { useExperiment('k'); return null }\n",
  'src/flagsmith/client.ts': "import { createFlagsmithInstance } from '@flagsmith/flagsmith'\nexport const c = createFlagsmithInstance()\n",
  'src/flagsmith/deliveryMonitor.ts': 'export const m = (u: string) => fetch(u)\n',
  'src/routes/About.tsx': '// a comment may say flagsmith.trackEvent(...)\nexport const A = () => <code>useExperiment</code>\n',
  'index.html': '<script type="module" src="/src/main.tsx"></script>\n',
}

describe('check-isolation', () => {
  it('passes on the real source tree', () => {
    const r = run('check-isolation.mjs')
    expect(r.out).toMatch(/Measurement isolation: ok/)
    expect(r.code).toBe(0)
  })

  it('passes on a minimal clean tree (comments and JSX text mentioning the calls are fine)', () => {
    expect(run('check-isolation.mjs', tree(HOMES)).code).toBe(0)
  })

  it.each([
    ['trackEvent', 'src/routes/Rules.tsx', 'export const r = (f: any) => f.trackEvent("readout_rules_copied")\n'],
    ['flushEvents', 'src/run/StudyContext.tsx', 'export const r = (f: any) => f.flushEvents()\n'],
    ['useExperiment', 'src/routes/Run.tsx', "import { useExperiment } from '@flagsmith/flagsmith/react'\n"],
    ['Flagsmith SDK import', 'src/routes/Landing.tsx', "import flagsmith from '@flagsmith/flagsmith'\n"],
    ['Flagsmith SDK import', 'src/app/App.tsx', "const f = () => import('@flagsmith/flagsmith')\n"],
    ['fetch(', 'src/routes/Team.tsx', "export const t = () => window.fetch('https://example.com')\n"],
    ['trackExposureEvent', 'src/flagsmith/measurement.ts', HOMES['src/flagsmith/measurement.ts'] + 'export const e = (f: any) => f.trackExposureEvent()\n'],
    ['other network API', 'src/run/controller.ts', "export const b = () => navigator.sendBeacon('/x')\n"],
  ])('fails on %s outside its home (%s)', (rule, file, text) => {
    const r = run('check-isolation.mjs', tree({ ...HOMES, [file]: text }))
    expect(r.code).toBe(1)
    expect(r.out).toContain(`${file}:`)
    expect(r.out).toContain(rule)
  })

  it('fails when a home no longer holds its call (a rename would otherwise pass vacuously)', () => {
    const r = run('check-isolation.mjs', tree({ ...HOMES, 'src/flagsmith/MeasuredSession.tsx': 'export const M = () => null\n' }))
    expect(r.code).toBe(1)
    expect(r.out).toMatch(/useExperiment: expected in src\/flagsmith\/MeasuredSession.tsx/)
  })

  it('fails on an external script in index.html', () => {
    const r = run('check-isolation.mjs', tree({ ...HOMES, 'index.html': '<script src="https://cdn.example.com/a.js"></script>\n' }))
    expect(r.code).toBe(1)
    expect(r.out).toMatch(/index.html:1 {2}external resource/)
  })
})

const IGNORE = 'node_modules\ndist\n.env\n.env.*\n!.env.example\n'
const BASE = { '.gitignore': IGNORE, '.env.example': 'VITE_FLAGSMITH_ENV_KEY=\nVITE_FLAGSMITH_ENV_NAME=development\n', 'src/a.ts': 'export const a = 1\n' }
const KEY = ['Xq7', 'pLm2', 'Rt9w', 'Kd4z'].join('')
const SER = ['ser', '.', 'AbCdEfGhIjKlMnOpQrStUv'].join('')

describe('check-secrets', () => {
  it('passes on the real project tree (source, docs and dist/), printing no values', () => {
    const r = run('check-secrets.mjs')
    expect(r.out).toMatch(/No-secrets check: ok/)
    expect(r.code).toBe(0)
  })

  it('passes on a clean tree; the client key may sit in .env and the built bundle', () => {
    const root = tree({ ...BASE, '.env': `VITE_FLAGSMITH_ENV_KEY=${KEY}\n`, 'dist/assets/index.js': `const k="${KEY}"\n` })
    expect(run('check-secrets.mjs', root).code).toBe(0)
  })

  it.each([
    ['Flagsmith server-side environment key', 'src/b.ts', `const k = "${SER}"\n`],
    ['Flagsmith Admin API token', 'README.md', `curl -H "Authorization: ${['Api', 'Key'].join('-')} ${'a1B2'.repeat(6)}"\n`],
    ['private key', 'deploy/key.pem', `${'-----BEGIN'} RSA PRIVATE KEY-----\n`],
    ["the client env key's value", 'src/b.ts', `const k = "${KEY}"\n`],
    ['email address', 'src/b.ts', `const who = "${['someone', 'gmail.com'].join('@')}"\n`],
    ['email address', 'dist/assets/index.js', `"${['a.person', 'outlook.com'].join('@')}"\n`],
  ])('fails on a planted %s (%s), without printing it', (kind, file, text) => {
    const root = tree({ ...BASE, '.env': `VITE_FLAGSMITH_ENV_KEY=${KEY}\n`, [file]: text })
    const r = run('check-secrets.mjs', root)
    expect(r.code).toBe(1)
    expect(r.out).toContain(`${file}:1  ${kind}`)
    expect(r.out).not.toContain(KEY)
    expect(r.out).not.toContain(SER)
    expect(r.out).not.toMatch(/gmail|outlook/)
  })

  it('fails on a secret-looking VITE_ variable, a filled-in example, and a .gitignore that would commit .env', () => {
    const root = tree({
      ...BASE,
      '.gitignore': 'node_modules\ndist\n',
      '.env': 'VITE_FLAGSMITH_SERVER_KEY=x\n',
      '.env.example': `VITE_FLAGSMITH_ENV_KEY=${KEY}\n`,
    })
    const r = run('check-secrets.mjs', root)
    expect(r.code).toBe(1)
    expect(r.out).toContain('.gitignore  missing ".env"')
    expect(r.out).toContain('.gitignore  missing "!.env.example"')
    expect(r.out).toContain('VITE_FLAGSMITH_SERVER_KEY: a VITE_ variable')
    expect(r.out).toContain('.env.example  VITE_FLAGSMITH_ENV_KEY has a value')
    expect(r.out).not.toContain(KEY)
  })

  it('ignores node_modules and the local env files themselves', () => {
    const root = tree({ ...BASE, 'node_modules/x/index.js': `"${SER}"\n`, '.env.local': `X=${SER}\n` })
    expect(run('check-secrets.mjs', root).code).toBe(0)
  })
})
