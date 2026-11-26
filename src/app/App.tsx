/**
 * App wiring (29 §7): one StudyProvider (the real Flagsmith layer), the route table, an error boundary per layout,
 * scroll handling and, outside production, the debug panel.
 *
 * Layouts:
 *   site  — header, main, footer: landing, readout, rules, team, about, not-found
 *   bare  — the runs (their own RunHeader) and the presenter stage (full screen)
 */
import { lazy, Suspense, useEffect, useRef } from 'react'
import { BrowserRouter, Outlet, Route, Routes, useLocation, useNavigationType } from 'react-router-dom'
import { SiteLayout } from '../components/site/Site'
import { AboutRoute } from '../routes/About'
import { Landing } from '../routes/Landing'
import { DebriefRoute, FlipRoute, SummaryRoute } from '../routes/Readout'
import { RulesRoute } from '../routes/Rules'
import { ChallengeRoute, PracticeRoute } from '../routes/Run'
import { PresenterRoute, TeamRoute } from '../routes/Team'
import { StudyProvider } from '../run/StudyContext'
import { ErrorBoundary, NotFoundRoute } from './StatusScreens'

// Statically false in a production build, so the panel's code is left out of the bundle entirely (28 §10 V-2).
const DebugPanel =
  import.meta.env.VITE_FLAGSMITH_ENV_NAME !== 'production'
    ? lazy(() => import('../components/site/DebugPanel').then((m) => ({ default: m.DebugPanel })))
    : null

function SiteShell() {
  const { pathname } = useLocation()
  return (
    <SiteLayout>
      <ErrorBoundary resetKey={pathname}>
        <Outlet />
      </ErrorBoundary>
    </SiteLayout>
  )
}

function BareShell() {
  const { pathname } = useLocation()
  return (
    <ErrorBoundary resetKey={pathname}>
      <Outlet />
    </ErrorBoundary>
  )
}

/**
 * New page → top; `#id` → that element (e.g. the footer's /about#privacy), also on first load. Back/forward is left
 * to the browser.
 * Pages that own their hash (Rules: #rule-3 and #3) run their effect after this one, so they win.
 */
export function ScrollManager() {
  const { pathname, hash } = useLocation()
  const nav = useNavigationType()
  // The first render is a POP too, but a link opened from outside (/about#privacy) still needs its jump: the section
  // didn't exist yet when the browser tried. A reload without a hash keeps the browser's own scroll position.
  const first = useRef(true)
  useEffect(() => {
    const initial = first.current
    first.current = false
    if (nav === 'POP' && !(initial && hash)) return
    if (hash) {
      const id = decodeURIComponent(hash.slice(1))
      document.getElementById(id)?.scrollIntoView({ block: 'start' })
      return
    }
    window.scrollTo(0, 0)
  }, [pathname, hash, nav])
  return null
}

/** The route table, without a router, so tests can drive it with a MemoryRouter. */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<SiteShell />}>
        <Route index element={<Landing />} />
        <Route path="readout" element={<FlipRoute kind="measured" />} />
        <Route path="readout/summary" element={<SummaryRoute kind="measured" />} />
        <Route path="readout/:n" element={<DebriefRoute kind="measured" />} />
        <Route path="practice/readout" element={<FlipRoute kind="practice" />} />
        <Route path="practice/readout/summary" element={<SummaryRoute kind="practice" />} />
        <Route path="practice/readout/:n" element={<DebriefRoute kind="practice" />} />
        <Route path="rules" element={<RulesRoute />} />
        <Route path="team" element={<TeamRoute />} />
        <Route path="about" element={<AboutRoute />} />
        <Route path="*" element={<NotFoundRoute />} />
      </Route>
      <Route element={<BareShell />}>
        <Route path="challenge" element={<ChallengeRoute />} />
        <Route path="practice" element={<PracticeRoute />} />
        <Route path="team/present" element={<PresenterRoute />} />
      </Route>
    </Routes>
  )
}

export function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <StudyProvider>
          <ScrollManager />
          <AppRoutes />
          {DebugPanel && (
            <Suspense fallback={null}>
              <DebugPanel />
            </Suspense>
          )}
        </StudyProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
