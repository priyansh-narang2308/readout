/// <reference types="vitest" />
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Build-time assertion (29 §9): a production deploy must be built with VITE_FLAGSMITH_ENV_NAME=production,
// and the env name must always be one of the two known values.
function envAssertion(mode: string, command: 'build' | 'serve') {
  const env = loadEnv(mode, process.cwd(), '')
  const name = env.VITE_FLAGSMITH_ENV_NAME
  if (mode === 'test') return
  if (command === 'build' && !name) {
    throw new Error('VITE_FLAGSMITH_ENV_NAME is missing. Build with "development" or "production" (see .env.example).')
  }
  if (name && name !== 'development' && name !== 'production') {
    throw new Error(`VITE_FLAGSMITH_ENV_NAME must be "development" or "production", got "${name}"`)
  }
  const hostContext = env.CONTEXT /* Netlify */ ?? env.VERCEL_ENV /* Vercel */
  if (hostContext === 'production' && name !== 'production') {
    throw new Error('Production deploy context but VITE_FLAGSMITH_ENV_NAME is not "production". Refusing to build.')
  }
  if (name === 'production' && hostContext && hostContext !== 'production') {
    throw new Error('VITE_FLAGSMITH_ENV_NAME=production in a non-production deploy context. Refusing to build.')
  }
  // A production deploy must carry the Production client key, given to the build itself (the host's environment
  // variables). Without this, a local .env (the Development configuration) silently supplies the Development key.
  // Neither key is ever printed.
  if (command === 'build' && hostContext === 'production') {
    const key = (env.VITE_FLAGSMITH_ENV_KEY ?? '').trim()
    if (!key) throw new Error('Production deploy context but no VITE_FLAGSMITH_ENV_KEY. Set the Production key on the host. Refusing to build.')
    const devFile = resolve(process.cwd(), '.env')
    const devKey = existsSync(devFile) ? (/^VITE_FLAGSMITH_ENV_KEY=(.*)$/m.exec(readFileSync(devFile, 'utf8'))?.[1] ?? '').trim() : ''
    if (devKey && key === devKey) throw new Error('Production deploy context but VITE_FLAGSMITH_ENV_KEY is the Development key from .env. Refusing to build.')
  }
}

export default defineConfig(({ mode, command }) => {
  envAssertion(mode, command)
  return {
    plugins: [react(), tailwindcss()],
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test-setup.ts'],
    },
  }
})
