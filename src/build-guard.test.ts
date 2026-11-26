/**
 * vite.config.ts build guard: a production deploy context must be built with VITE_FLAGSMITH_ENV_NAME=production and
 * its own (Production) client key, never the Development key a local .env would supply. Uses throwaway project
 * folders with a copy of the config, so this repo's .env is never read by the test.
 */
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const DEV_KEY = 'DevKeyForGuardTest0000001'
function project(withDevEnv: boolean) {
  const dir = mkdtempSync(join(tmpdir(), 'guard-'))
  cpSync('vite.config.ts', join(dir, 'vite.config.ts'))
  writeFileSync(join(dir, 'package.json'), '{"type":"module","private":true}\n')
  symlinkSync(join(process.cwd(), 'node_modules'), join(dir, 'node_modules'))
  writeFileSync(join(dir, 'index.html'), '<!doctype html><script type="module" src="/main.js"></script>')
  writeFileSync(join(dir, 'main.js'), 'document.title = import.meta.env.VITE_FLAGSMITH_ENV_KEY + import.meta.env.VITE_FLAGSMITH_ENV_NAME\n')
  if (withDevEnv) writeFileSync(join(dir, '.env'), `VITE_FLAGSMITH_ENV_KEY=${DEV_KEY}\nVITE_FLAGSMITH_ENV_NAME=development\n`)
  const build = (env: Record<string, string>) =>
    spawnSync(join(process.cwd(), 'node_modules/.bin/vite'), ['build', '--logLevel', 'error'], { cwd: dir, encoding: 'utf8', env: { PATH: process.env.PATH ?? '', ...env } })
  const bundle = () => readdirSync(join(dir, 'dist/assets')).map((f) => readFileSync(join(dir, 'dist/assets', f), 'utf8')).join('')
  return { build, bundle, done: () => rmSync(dir, { recursive: true, force: true }) }
}

describe('production build guard', () => {
  it('refuses a production deploy with no key, or with the Development key from .env, and never prints the key', () => {
    const p = project(true)
    try {
      const none = p.build({ CONTEXT: 'production', VITE_FLAGSMITH_ENV_NAME: 'production' }) // .env would supply the Dev key
      expect(none.status).not.toBe(0)
      expect(none.stderr + none.stdout).toMatch(/is the Development key from \.env/)
      const same = p.build({ CONTEXT: 'production', VITE_FLAGSMITH_ENV_NAME: 'production', VITE_FLAGSMITH_ENV_KEY: DEV_KEY })
      expect(same.status).not.toBe(0)
      for (const r of [none, same]) expect(r.stderr + r.stdout).not.toContain(DEV_KEY)
      const vercel = p.build({ VERCEL_ENV: 'production', VITE_FLAGSMITH_ENV_NAME: 'production' })
      expect(vercel.status).not.toBe(0)
    } finally {
      p.done()
    }
    const host = project(false) // a host build: no .env at all
    try {
      const r = host.build({ CONTEXT: 'production', VITE_FLAGSMITH_ENV_NAME: 'production' })
      expect(r.status).not.toBe(0)
      expect(r.stderr + r.stdout).toMatch(/no VITE_FLAGSMITH_ENV_KEY/)
    } finally {
      host.done()
    }
  }, 30000)

  it('builds with the Production key given to the build, and the Development key is not in the bundle', () => {
    const p = project(true)
    try {
      const r = p.build({ CONTEXT: 'production', VITE_FLAGSMITH_ENV_NAME: 'production', VITE_FLAGSMITH_ENV_KEY: 'ProdKeyForGuardTest00002' })
      expect(r.status).toBe(0)
      expect(p.bundle()).toContain('ProdKeyForGuardTest00002')
      expect(p.bundle()).not.toContain(DEV_KEY)
    } finally {
      p.done()
    }
  }, 30000)
})
