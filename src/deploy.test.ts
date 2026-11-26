/**
 * Task 35: the deploy config (29 §11). vercel.json and netlify.toml must say the same thing; the CSP must allow
 * exactly the Flagsmith hosts the pinned SDK and the delivery monitor use, and nothing else outside the site; every
 * deep link must be served the app shell. `npm run check:browser:prod` runs the real build under these headers.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EVENTS_HOST } from './flagsmith/deliveryMonitor'

const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
  rewrites: { source: string; destination: string }[]
  headers: { source: string; headers: { key: string; value: string }[] }[]
}
const toml = readFileSync('netlify.toml', 'utf8')

/** The [[headers]] blocks of netlify.toml as { for: { key: value } } (enough TOML for this file). */
function netlifyHeaders() {
  const out: Record<string, Record<string, string>> = {}
  for (const block of toml.split('[[headers]]').slice(1)) {
    const path = /for\s*=\s*"([^"]+)"/.exec(block)![1]!
    out[path] = Object.fromEntries([...block.matchAll(/^\s*([A-Za-z-]+)\s*=\s*"([^"]*)"\s*$/gm)].filter(([, k]) => k !== 'for').map(([, k, v]) => [k!, v!]))
  }
  return out
}
const vercelHeaders = () =>
  Object.fromEntries(vercel.headers.map((h) => [h.source.replace('(.*)', '*'), Object.fromEntries(h.headers.map((x) => [x.key, x.value]))]))

const csp = () => vercelHeaders()['/*']!['Content-Security-Policy']!
const directive = (name: string) =>
  csp()
    .split(';')
    .map((d) => d.trim().split(/\s+/))
    .find(([n]) => n === name)
    ?.slice(1)

describe('deploy config', () => {
  it('Vercel and Netlify send identical headers for identical paths', () => {
    expect(netlifyHeaders()).toEqual(vercelHeaders())
  })

  it('both rewrite every path to the app shell, so deep links load (status 200, not a redirect)', () => {
    expect(vercel.rewrites).toEqual([{ source: '/(.*)', destination: '/index.html' }])
    expect(toml).toMatch(/\[\[redirects\]\]\s*from = "\/\*"\s*to = "\/index.html"\s*status = 200/)
  })

  it('the CSP allows scripts, styles and fonts from the site only, with no inline code or eval', () => {
    for (const d of ['default-src', 'script-src', 'style-src', 'font-src']) expect(directive(d)).toEqual(["'self'"])
    expect(csp()).not.toMatch(/unsafe-inline|unsafe-eval|\*/)
    expect(directive('object-src')).toEqual(["'none'"])
    expect(directive('frame-ancestors')).toEqual(["'none'"])
  })

  it('connect-src is the site plus exactly the Flagsmith Edge API and the events host the app monitors', () => {
    const sdk = readFileSync('node_modules/@flagsmith/flagsmith/index.js', 'utf8')
    expect(sdk).toContain('https://edge.api.flagsmith.com/api/v1/') // the pinned SDK's default API
    expect(directive('connect-src')).toEqual(["'self'", 'https://edge.api.flagsmith.com', `https://${EVENTS_HOST}`])
  })

  it('privacy and hardening headers are set; hashed assets are immutable and the shell is never stale', () => {
    const h = vercelHeaders()
    expect(h['/*']).toMatchObject({
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    })
    expect(h['/assets/*']!['Cache-Control']).toBe('public, max-age=31536000, immutable')
    expect(h['/index.html']!['Cache-Control']).toBe('no-cache')
  })

  it('builds with npm run build into dist on Netlify', () => {
    expect(toml).toMatch(/command = "npm run build"/)
    expect(toml).toMatch(/publish = "dist"/)
  })
})
