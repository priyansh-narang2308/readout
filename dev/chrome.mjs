/**
 * The Chrome binary for the browser checks. `CHROME_PATH` wins; otherwise the usual install paths on macOS and Linux
 * (CI). Fails with a clear message rather than guessing.
 */
import { existsSync } from 'node:fs'

const CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
]

export function chromePath() {
  const fromEnv = process.env.CHROME_PATH
  if (fromEnv) {
    if (!existsSync(fromEnv)) throw new Error(`CHROME_PATH points to a missing file: ${fromEnv}`)
    return fromEnv
  }
  const found = CANDIDATES.find((p) => existsSync(p))
  if (!found) throw new Error(`No Chrome found. Install Google Chrome or set CHROME_PATH. Looked in: ${CANDIDATES.join(', ')}`)
  return found
}
