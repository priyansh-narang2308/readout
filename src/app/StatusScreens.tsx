/**
 * Not-found and error screens (26 §8.11, 29 §10): a short centred message and a way back to a working page.
 * Title L → Body; focus lands on the heading so a screen reader hears what happened first. Never a stack trace.
 *
 * The error screen links with plain <a href>, not router links: after a render error a full page load is the
 * reliable way out, and it works even when the router itself is what failed.
 */
import { Component, useEffect, useRef, type ErrorInfo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { usePageTitle } from '../components/site/Site'
import { btn, cx, page, type } from '../components/ui/classes'
import { envName } from '../flagsmith/client'

function Screen({ eyebrow, title, body, children }: { eyebrow: string; title: string; body: string; children: ReactNode }) {
  const h = useRef<HTMLHeadingElement>(null)
  useEffect(() => h.current?.focus(), [])
  return (
    <div className={cx(page, 'flex flex-1 items-center py-20 sm:py-28')}>
      <div className="mx-auto w-full max-w-read text-center" data-status-screen>
        <p className={type.eyebrow}>{eyebrow}</p>
        <h1 ref={h} tabIndex={-1} className={cx(type.titleL, 'mt-3 outline-none')}>
          {title}
        </h1>
        <p className={cx(type.body, 'mx-auto mt-3 max-w-[48ch] text-ink-2')}>{body}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">{children}</div>
      </div>
    </div>
  )
}

export function NotFoundRoute() {
  usePageTitle('Page not found')
  return (
    <Screen
      eyebrow="404"
      title="No result at this address"
      body="The link may be mistyped, or the page has moved. Everything in Readout is one of these two clicks away."
    >
      <Link to="/" className={btn('primary')}>
        Back to Readout
      </Link>
      <Link to="/rules" className={btn('secondary')}>
        Read the Rules
      </Link>
    </Screen>
  )
}

export function ErrorScreen() {
  usePageTitle('Something went wrong')
  return (
    <Screen
      eyebrow="Error"
      title="Something went wrong on this page."
      body="Reloading usually fixes it. If it doesn’t, start again from the home page or go to the Rules."
    >
      <button type="button" className={btn('primary')} onClick={() => window.location.reload()}>
        Reload the page
      </button>
      <a href="/" className={btn('secondary')}>
        Back to Readout
      </a>
      <a href="/rules" className={btn('secondary')}>
        Read the Rules
      </a>
    </Screen>
  )
}

/** Development logging only (29 §10): production keeps the console quiet and there is no error tracking. */
export function logRenderError(error: unknown, info?: ErrorInfo): void {
  if (envName() === 'production') return
  console.error('[readout] render error', error, info?.componentStack ?? '')
}

type BoundaryProps = { children: ReactNode; resetKey?: string }

/**
 * One per layout (29 §10). `resetKey` is the pathname: navigating away from a broken page clears the error, so the
 * header links keep working without a reload.
 */
export class ErrorBoundary extends Component<BoundaryProps, { error: unknown }> {
  state: { error: unknown } = { error: null }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    logRenderError(error, info)
  }

  componentDidUpdate(prev: BoundaryProps) {
    if (this.state.error !== null && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    return this.state.error !== null ? <ErrorScreen /> : this.props.children
  }
}
