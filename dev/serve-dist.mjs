#!/usr/bin/env node
/**
 * Serves a production build the way the host will: the headers and the SPA rewrite are read from vercel.json (which
 * deploy.test.ts keeps identical to netlify.toml). Files that exist are served as they are; any other path gets
 * index.html with status 200, so deep links such as /readout/3 load the app.
 *
 * Used by `npm run check:browser:prod`; also runnable by hand:  node dev/serve-dist.mjs [dir=dist] [port=4173]
 */
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
}

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
// Vercel source patterns used here are plain paths with "(.*)" groups.
const toRe = (source) => new RegExp(`^${source.split('(.*)').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(.*)')}$`)
const HEADER_RULES = config.headers.map((h) => ({ re: toRe(h.source), headers: h.headers }))
const REWRITES = config.rewrites.map((r) => ({ re: toRe(r.source), to: r.destination }))

export function serveDist(dir, port) {
  const root = resolve(dir)
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    let path = decodeURIComponent(url.pathname)
    let file = normalize(join(root, path))
    if (!file.startsWith(root)) {
      res.writeHead(403).end()
      return
    }
    if (!existsSync(file) || statSync(file).isDirectory()) {
      const indexInDir = join(file, 'index.html')
      if (existsSync(indexInDir)) file = indexInDir
      else {
        const rw = REWRITES.find((r) => r.re.test(path))
        if (!rw) {
          res.writeHead(404).end('not found')
          return
        }
        path = rw.to
        file = join(root, rw.to)
      }
    }
    const headers = { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' }
    for (const rule of HEADER_RULES) if (rule.re.test(path)) for (const h of rule.headers) headers[h.key] = h.value
    res.writeHead(200, headers)
    createReadStream(file).pipe(res)
  })
  return new Promise((ok) => server.listen(port, () => ok(server)))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir = 'dist', port = '4173'] = process.argv.slice(2)
  await serveDist(dir, Number(port))
  console.log(`Serving ${dir} at http://localhost:${port} with the vercel.json headers and SPA rewrite`)
}
