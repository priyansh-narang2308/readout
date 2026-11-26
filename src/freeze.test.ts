/**
 * The measured-v1 freeze check, run on throwaway git repositories (never this one): before the tag, with the tag,
 * and with each kind of change after it.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SCRIPT = join(process.cwd(), 'scripts/check-frozen.mjs')
const FROZEN = /export const FROZEN = \[([\s\S]*?)\]/.exec(readFileSync(SCRIPT, 'utf8'))![1]!.match(/'[^']+'/g)!.map((s) => s.slice(1, -1))

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'freeze-'))
  const g = (...a: string[]) =>
    execFileSync('git', ['-C', dir, '-c', 'user.name=test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...a], {
      encoding: 'utf8',
    }).trim()
  g('init', '-q')
  for (const f of FROZEN) {
    mkdirSync(dirname(join(dir, f)), { recursive: true })
    writeFileSync(join(dir, f), `// ${f}\n`)
  }
  writeFileSync(join(dir, 'other.ts'), 'x\n')
  g('add', '-A')
  g('commit', '-q', '-m', 'measured implementation')
  return { dir, g, run: (...a: string[]) => spawnSync('node', [SCRIPT, '--root', dir, ...a], { encoding: 'utf8' }), done: () => rmSync(dir, { recursive: true, force: true }) }
}

describe('check-frozen', () => {
  it('lists exactly the authoritative frozen files, and they all exist here', () => {
    expect(FROZEN).toEqual(
      expect.arrayContaining([
        'src/stats/flagsmithStats.ts',
        'src/stats/format.ts',
        'src/content/scenarios.v1.ts',
        'src/components/result/ResultCard.tsx',
        'src/components/decision/DecisionBar.tsx',
        'src/flagsmith/MeasuredSession.tsx',
        'src/flagsmith/measurement.ts',
        // widened 16 Nov: assignment, identity, attempts, delivery, the run screen, styles, the lockfile
        'src/flagsmith/client.ts',
        'src/flagsmith/deliveryMonitor.ts',
        'src/run/attemptStore.ts',
        'src/run/controller.ts',
        'src/run/StudyContext.tsx',
        'src/routes/Run.tsx',
        'src/styles/index.css',
        'package-lock.json',
        // widened 17 Nov: imported by frozen files, and the entry points
        'src/components/site/Site.tsx',
        'src/content/study.ts',
        'src/main.tsx',
        'src/app/App.tsx',
        // widened 17 Nov (M5 trace): the pages that wire the Rules copy to M5, and what they import
        'src/routes/Rules.tsx',
        'src/routes/Team.tsx',
        'src/routes/Readout.tsx',
        'src/content/rules.ts',
        'src/content/team.ts',
        'src/content/recruitment.ts',
        // the analysis plan and its guards
        'EXPERIMENT.md',
        'src/content/outcomes.ts',
        'scripts/srm.mjs',
        'scripts/check-frozen.mjs',
        '.github/workflows/ci.yml',
      ]),
    )
    for (const f of FROZEN) expect(() => readFileSync(f)).not.toThrow()
  })

  it('is closed under local imports: no frozen file imports an unfrozen source file (entry points excepted)', () => {
    // App.tsx mounts every page; the pages it routes to outside the measured run are deliberately not frozen.
    const ENTRY = new Set(['src/main.tsx', 'src/app/App.tsx'])
    const frozen = new Set(FROZEN)
    const resolve = (from: string, spec: string) => {
      const base = join(dirname(from), spec)
      for (const ext of ['', '.ts', '.tsx', '/index.ts']) {
        try {
          if (statSync(base + ext).isFile()) return base + ext
        } catch {
          /* try the next extension */
        }
      }
      return null
    }
    const leaks: string[] = []
    for (const f of FROZEN.filter((x) => /\.(ts|tsx)$/.test(x) && !ENTRY.has(x))) {
      for (const m of readFileSync(f, 'utf8').matchAll(/(?:from|import)\s+'(\.[^']+)'/g)) {
        const target = resolve(f, m[1]!)
        if (target && /\.(ts|tsx)$/.test(target) && !frozen.has(target)) leaks.push(`${f} -> ${target}`)
      }
    }
    expect(leaks).toEqual([])
  })

  it('before the freeze: passes with a notice, but --require (the release gate) fails', () => {
    const r = repo()
    try {
      const a = r.run()
      expect(a.status).toBe(0)
      expect(a.stdout).toMatch(/no measured-v1 tag yet/)
      const b = r.run('--require')
      expect(b.status).toBe(1)
      expect(b.stderr).toMatch(/does not exist/)
    } finally {
      r.done()
    }
  })

  it('with the tag and no change: ok, also with --require; other files may change freely', () => {
    const r = repo()
    try {
      r.g('tag', 'measured-v1')
      writeFileSync(join(r.dir, 'other.ts'), 'changed\n')
      expect(r.run('--require').status).toBe(0)
    } finally {
      r.done()
    }
  })

  it.each([
    ['an uncommitted edit', (r: ReturnType<typeof repo>) => writeFileSync(join(r.dir, FROZEN[0]!), 'edited\n')],
    [
      'a committed edit',
      (r: ReturnType<typeof repo>) => {
        writeFileSync(join(r.dir, FROZEN[1]!), 'edited\n')
        r.g('commit', '-q', '-am', 'tweak')
      },
    ],
    ['a deleted file', (r: ReturnType<typeof repo>) => rmSync(join(r.dir, FROZEN[2]!))],
    [
      'a staged edit',
      (r: ReturnType<typeof repo>) => {
        writeFileSync(join(r.dir, FROZEN[4]!), 'staged\n')
        r.g('add', FROZEN[4]!)
      },
    ],
    [
      'a staged edit later reverted in the working tree only',
      (r: ReturnType<typeof repo>) => {
        const f = FROZEN[5]!
        const orig = readFileSync(join(r.dir, f), 'utf8')
        writeFileSync(join(r.dir, f), 'staged\n')
        r.g('add', f)
        writeFileSync(join(r.dir, f), orig)
      },
    ],
    ['a renamed (moved) file', (r: ReturnType<typeof repo>) => r.g('mv', FROZEN[6]!, `${FROZEN[6]!}.moved`)],
    [
      'a lockfile change (a dependency bump)',
      (r: ReturnType<typeof repo>) => writeFileSync(join(r.dir, 'package-lock.json'), '{"bumped":true}\n'),
    ],
    // The analysis plan is immutable after the tag too.
    ['an edit to the pre-registration', (r: ReturnType<typeof repo>) => writeFileSync(join(r.dir, 'EXPERIMENT.md'), 'rule 1 relaxed\n')],
    [
      'a committed change to the SRM threshold',
      (r: ReturnType<typeof repo>) => {
        writeFileSync(join(r.dir, 'scripts/srm.mjs'), 'export const ALPHA = 0.05\n')
        r.g('commit', '-q', '-am', 'loosen srm')
      },
    ],
    ['an edit to the pre-written outcome wording', (r: ReturnType<typeof repo>) => writeFileSync(join(r.dir, 'src/content/outcomes.ts'), 'reworded\n')],
    ['dropping the freeze step from CI', (r: ReturnType<typeof repo>) => writeFileSync(join(r.dir, '.github/workflows/ci.yml'), 'jobs: {}\n')],
    ['an edit to an M5 call site', (r: ReturnType<typeof repo>) => writeFileSync(join(r.dir, 'src/routes/Rules.tsx'), 'no onCopied\n')],
  ])('after the tag, %s fails', (_name, change) => {
    const r = repo()
    try {
      r.g('tag', 'measured-v1')
      change(r)
      const out = r.run()
      expect(out.status).toBe(1)
      expect(out.stderr).toMatch(/differs from measured-v1/)
    } finally {
      r.done()
    }
  })

  it('a frozen file missing from the tag fails', () => {
    const r = repo()
    try {
      r.g('rm', '-q', FROZEN[3]!)
      r.g('commit', '-q', '-m', 'drop one')
      r.g('tag', 'measured-v1')
      writeFileSync(join(r.dir, FROZEN[3]!), '// back, but untracked\n')
      const out = r.run()
      expect(out.status).toBe(1)
      expect(out.stderr).toMatch(/not in measured-v1/)
      expect(out.stderr).toMatch(/untracked/)
    } finally {
      r.done()
    }
  })

  it('once measured-v1.sha pins the commit, a moved tag fails even if the files match', () => {
    const r = repo()
    try {
      r.g('tag', 'measured-v1')
      writeFileSync(join(r.dir, 'measured-v1.sha'), `${r.g('rev-parse', 'measured-v1^{commit}')}\n`)
      r.g('add', 'measured-v1.sha')
      r.g('commit', '-q', '-m', 'pin')
      expect(r.run('--require').status).toBe(0)
      r.g('tag', '-f', 'measured-v1', 'HEAD')
      const out = r.run('--require')
      expect(out.status).toBe(1)
      expect(out.stderr).toMatch(/but measured-v1.sha pins/)
    } finally {
      r.done()
    }
  })

  it('outside a git checkout it says so and exits 2', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nogit-'))
    try {
      const out = spawnSync('node', [SCRIPT, '--root', dir], { encoding: 'utf8' })
      expect(out.status).toBe(2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
