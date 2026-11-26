/**
 * App wiring (tasks 23–25): the real route table, not-found, the error boundary per layout, scroll handling, the
 * entry file and the print stylesheet. Flagsmith is a fake (StudyDeps); MeasuredSession is stubbed as in routes.test.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GateResult } from '../flagsmith/client'
import type { StudyDeps } from '../run/controller'
import { StudyProvider } from '../run/StudyContext'
import { AppRoutes, ScrollManager } from './App'
import { ErrorBoundary, logRenderError } from './StatusScreens'

vi.mock('../flagsmith/MeasuredSession', () => ({ MeasuredSession: () => null }))

// About throws while `boom` is set, to drive the boundary through the real layout.
let boom = false
vi.mock('../routes/About', async (orig) => {
  const real = await orig<typeof import('../routes/About')>()
  return {
    AboutRoute: () => {
      if (boom) throw new Error('secret stack detail')
      return <real.AboutRoute />
    },
  }
})

const ENROLLED: GateResult = { enrolled: true, variant: 'chance_to_win', experimentId: 42, experimentName: 'x', value: 'x' }
const deps = (): StudyDeps => ({
  enrol: vi.fn(async () => ENROLLED),
  init: vi.fn(async () => undefined),
  sendScores: vi.fn(async () => 'sent' as const),
  resend: vi.fn(async () => 'none' as const),
  envName: () => 'development',
  storageOk: () => true,
})

function Path() {
  const l = useLocation()
  return <output data-testid="path">{l.pathname + l.hash}</output>
}

let go: ReturnType<typeof useNavigate>
function Nav() {
  go = useNavigate()
  return null
}

function app(at: string) {
  return render(
    <MemoryRouter initialEntries={[at]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <StudyProvider deps={deps()}>
        <ScrollManager />
        <AppRoutes />
        <Path />
        <Nav />
      </StudyProvider>
    </MemoryRouter>,
  )
}

// The site header is the one holding the Main nav (the landing page and presenter have header elements of their own).
const banner = () => screen.queryByRole('navigation', { name: 'Main' })?.closest('header') ?? null
const h1 = () => screen.getByRole('heading', { level: 1 })

beforeEach(() => {
  localStorage.clear()
  boom = false
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('route table', () => {
  it.each([
    ['/', 'Would you ship it?'],
    ['/rules', 'The Readout Rules'],
    ['/team', 'Run it with your team'],
    ['/about', 'What Readout is'],
  ])('%s renders its page inside the site layout', (at, title) => {
    app(at)
    expect(h1().textContent).toBe(title)
    expect(banner()).not.toBeNull()
    expect(screen.getByRole('contentinfo')).toBeTruthy()
  })

  it('the presenter stage and the practice run have no site header or footer', () => {
    app('/team/present')
    expect(h1().textContent).toMatch(/^Presenter view, result 1 of 6/)
    expect(banner()).toBeNull()
    expect(screen.queryByRole('contentinfo')).toBeNull()
    cleanup()
    app('/practice')
    expect(h1().textContent).toBe('Practice — not part of the study')
    expect(screen.queryByRole('contentinfo')).toBeNull()
  })

  it('a readout link with no finished run goes back to the landing page, not to not-found', () => {
    app('/readout/3')
    expect(screen.getByTestId('path').textContent).toBe('/')
  })
})

describe('not found (26 §8.11)', () => {
  it('shows a short message, focuses the heading, sets the title and links home and to the Rules', () => {
    app('/no/such/page')
    expect(h1().textContent).toBe('No result at this address')
    expect(document.activeElement).toBe(h1())
    expect(document.title).toBe('Page not found · Readout')
    expect(banner()).not.toBeNull()
    expect(screen.getByRole('link', { name: 'Back to Readout' }).getAttribute('href')).toBe('/')
    expect(screen.getByRole('link', { name: 'Read the Rules' }).getAttribute('href')).toBe('/rules')
  })

  it('also catches a mistyped page under a real one', () => {
    app('/rules/extra')
    expect(h1().textContent).toBe('No result at this address')
  })
})

describe('error boundary (29 §10)', () => {
  it('a page that throws shows the error screen inside the layout, with no error text, and logs in development', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    boom = true
    app('/about')
    expect(h1().textContent).toBe('Something went wrong on this page.')
    expect(document.activeElement).toBe(h1())
    expect(document.body.textContent).not.toMatch(/secret stack detail|at AboutRoute/)
    expect(banner()).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Reload the page' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to Readout' }).getAttribute('href')).toBe('/')
    expect(log.mock.calls.some((c) => c[0] === '[readout] render error')).toBe(true)
  })

  it('navigating away from the broken page clears the error (header links keep working)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    boom = true
    app('/about')
    fireEvent.click(screen.getByRole('link', { name: 'Rules' }))
    expect(h1().textContent).toBe('The Readout Rules')
  })

  it('stays on the error screen while the path is the same, and resets when the key changes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const Bad = () => {
      throw new Error('x')
    }
    const r = render(
      <MemoryRouter>
        <ErrorBoundary resetKey="/a">
          <Bad />
        </ErrorBoundary>
      </MemoryRouter>,
    )
    r.rerender(
      <MemoryRouter>
        <ErrorBoundary resetKey="/a">
          <p>fine</p>
        </ErrorBoundary>
      </MemoryRouter>,
    )
    expect(screen.queryByText('fine')).toBeNull()
    r.rerender(
      <MemoryRouter>
        <ErrorBoundary resetKey="/b">
          <p>fine</p>
        </ErrorBoundary>
      </MemoryRouter>,
    )
    expect(screen.getByText('fine')).toBeTruthy()
  })

  it('never logs in production', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('VITE_FLAGSMITH_ENV_NAME', 'production')
    logRenderError(new Error('x'))
    expect(log).not.toHaveBeenCalled()
    vi.stubEnv('VITE_FLAGSMITH_ENV_NAME', 'development')
    logRenderError(new Error('x'))
    expect(log).toHaveBeenCalledTimes(1)
  })
})

describe('scroll on navigation', () => {
  it('a page opened from outside with a #hash lands on that section; one without a hash is left alone', () => {
    const top = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const into = vi.spyOn(Element.prototype, 'scrollIntoView')
    app('/about#limits')
    expect(into.mock.contexts).toContain(document.getElementById('limits'))
    cleanup()
    into.mockClear()
    app('/about')
    expect(top).not.toHaveBeenCalled()
    expect(into).not.toHaveBeenCalled()
  })

  it('a new page starts at the top; a #hash scrolls to that section; back/forward is left alone', () => {
    const top = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const into = vi.spyOn(Element.prototype, 'scrollIntoView')
    app('/rules')
    top.mockClear()
    act(() => go('/about#privacy'))
    const privacy = document.getElementById('privacy')!
    expect(into.mock.contexts).toContain(privacy)
    expect(top).not.toHaveBeenCalled()
    act(() => go('/team'))
    expect(top).toHaveBeenCalledWith(0, 0)
    top.mockClear()
    act(() => go('/about'))
    top.mockClear()
    act(() => go(-1))
    expect(screen.getByTestId('path').textContent).toBe('/team')
    expect(top).not.toHaveBeenCalled()
  })
})

const ROOT = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

describe('entry and print', () => {
  it('index.html loads src/main.tsx, which imports the one stylesheet and renders App', () => {
    expect(read('index.html')).toMatch(/<script type="module" src="\/src\/main\.tsx"><\/script>/)
    const main = read('src/main.tsx')
    expect(main).toMatch(/import '\.\/styles\/index\.css'/)
    expect(main).toMatch(/<App \/>/)
    expect(main).not.toMatch(/^import .*StrictMode/m)
  })

  it('print gives every colour token a paper value, with black ink on white', () => {
    const css = read('src/styles/index.css')
    const theme = css.slice(css.indexOf('@theme {'), css.indexOf('@layer base'))
    const print = css.slice(css.indexOf('@media print {'))
    const names = [...theme.matchAll(/--color-([a-z0-9-]+):/g)].map((m) => m[1])
    expect(names.length).toBeGreaterThan(10)
    for (const n of names) expect(print, n).toMatch(new RegExp(`--color-${n}:`))
    expect(print).toMatch(/--color-bg-0: #ffffff;/)
    expect(print).toMatch(/--color-ink-1: #000000;/)
  })

  it('the site header, footer and debug panel are hidden on paper; the print source line shows instead', () => {
    app('/rules')
    expect(banner()!.className).toMatch(/\bprint:hidden\b/)
    expect(screen.getByRole('contentinfo').className).toMatch(/\bprint:hidden\b/)
    const src = document.querySelector('[data-print-source]')!
    expect(src.className).toMatch(/\bhidden\b.*\bprint:block\b/)
    expect(src.textContent).toContain('/rules')
    expect(read('src/components/site/DebugPanel.tsx')).toMatch(/fixed right-3 bottom-3[^"]*print:hidden/)
  })

  it('the Rules copy buttons are hidden on paper, the rules themselves are not', () => {
    app('/rules')
    const copy = screen.getByRole('button', { name: 'Copy as Markdown' })
    expect(copy.closest('.print\\:hidden')).not.toBeNull()
    expect(screen.getByRole('list', { name: 'The six rules' }).closest('.print\\:hidden')).toBeNull()
  })

  it('the team guide on paper: section 2 stays (numbering 1-2-3) with the presenter address instead of the button', () => {
    app('/team')
    expect(screen.getByRole('heading', { name: '2 · Walk the six results' }).closest('.print\\:hidden')).toBeNull()
    expect(screen.getByRole('link', { name: 'Open presenter view →' }).className).toMatch(/\bprint:hidden\b/)
    const line = document.querySelector('[data-print-presenter]')!
    expect(line.className).toMatch(/\bhidden\b.*\bprint:block\b/)
    expect(line.textContent).toContain(`${window.location.origin}/team/present`)
    expect(screen.getByRole('button', { name: 'Print this guide' }).className).toMatch(/\bprint:hidden\b/)
  })
})
