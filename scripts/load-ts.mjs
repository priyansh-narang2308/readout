/** Loads the app's own TypeScript modules from a Node script (via Vite, so the scripts and the app share one source). */
import { createServer } from 'vite'

export async function loadTs(...paths) {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })
  try {
    return await Promise.all(paths.map((p) => vite.ssrLoadModule(p)))
  } finally {
    await vite.close()
  }
}
