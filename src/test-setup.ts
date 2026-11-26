// Vitest setup (jsdom).
//
// Node 25+ ships its own global Web Storage. Without --localstorage-file its `localStorage` is undefined, and it
// shadows jsdom's, so `window.localStorage` would be missing in tests. Point both storages (and the Storage class
// used for spies) at jsdom's real implementation. Browsers are unaffected: this file only runs under Vitest.
declare const jsdom: { window: Window & typeof globalThis } | undefined

if (typeof jsdom !== 'undefined') {
  for (const key of ['localStorage', 'sessionStorage', 'Storage'] as const) {
    Object.defineProperty(globalThis, key, { value: jsdom.window[key], configurable: true, writable: true })
  }
}

export {}

// jsdom does not implement scrolling; the run scrolls to the top of each new card.
window.scrollTo = (() => undefined) as typeof window.scrollTo
// jsdom has no scrollIntoView either; the Rules page scrolls a linked rule into view.
Element.prototype.scrollIntoView = function () {} as typeof Element.prototype.scrollIntoView

// jsdom has no Web Locks API. Every test realm is one "browser": an exclusive FIFO queue per lock name gives the
// same guarantee navigator.locks gives across that browser's tabs. Tests of the unsupported path remove it.
if (typeof navigator !== 'undefined' && !navigator.locks) {
  const tails = new Map<string, Promise<unknown>>()
  const locks = {
    request(name: string, a: unknown, b?: unknown) {
      const cb = (typeof a === 'function' ? a : b) as (lock: { name: string; mode: string }) => unknown
      const run = (tails.get(name) ?? Promise.resolve()).then(() => cb({ name, mode: 'exclusive' }))
      tails.set(name, run.catch(() => undefined))
      return run
    },
  }
  Object.defineProperty(navigator, 'locks', { value: locks, configurable: true })
}
