/**
 * Site chrome and shared controls (26 §5–§6, 25 §3–§4): wordmark, site header and footer, the non-production env
 * tag, the practice badge, the run progress rule, the framing toggle and the copy button.
 * Nothing here talks to Flagsmith; a copy only reports success through `onCopied`.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import type { Framing } from '../../content/scenarios.v1'
import { envName } from '../../flagsmith/client'
import { btn, btnGhost, chip, cx, linkMuted, page, skipLink, type } from '../ui/classes'

/**
 * The public repository link for the footer. Set VITE_REPO_URL once the repository exists; until then (or if the
 * value is not a plain https://github.com/<owner>/<repo> URL) the footer shows no GitHub link rather than a dead one.
 */
export function repoUrl(raw: string | undefined = import.meta.env.VITE_REPO_URL): string | null {
  const v = raw?.trim()
  if (!v) return null
  return /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(v) ? v.replace(/\/$/, '') : null
}

export function Wordmark({ link = true }: { link?: boolean }) {
  const mark = (
    <span className="inline-flex items-center gap-2 whitespace-nowrap font-sans text-[15px] font-semibold tracking-[-0.005em] text-ink-1">
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
        <rect x="1" y="9" width="18" height="2" className="fill-ink-3" />
        <rect x="9" y="3" width="2" height="14" className="fill-ink-1" />
        <circle cx="13.5" cy="10" r="3" className="fill-accent" />
      </svg>
      Readout
    </span>
  )
  return link ? (
    <Link to="/" className="inline-flex rounded-chip no-underline" aria-label="Readout home">
      {mark}
    </Link>
  ) : (
    mark
  )
}

// 44 px tall hit area (py-3 around a 20 px line) without changing the visual line height.
const NAV_LINK = cx(
  btnGhost,
  'py-3 text-[14px] leading-5 aria-[current=page]:text-ink-1 aria-[current=page]:underline aria-[current=page]:decoration-accent aria-[current=page]:decoration-2 aria-[current=page]:underline-offset-6',
)

const NAV = [
  { to: '/rules', label: 'Rules' },
  { to: '/team', label: 'Team' },
  { to: '/about', label: 'About' },
] as const

export function SiteHeader() {
  // 26 §4 PracticeBadge: on every practice screen, so the practice flip, debrief and readout carry it too.
  const practice = useLocation().pathname.startsWith('/practice')
  return (
    <header className="sticky top-0 z-20 border-b print:hidden border-line-1 bg-bg-0/88 backdrop-blur-[8px] backdrop-saturate-140">
      <div className={cx(page, 'flex h-12 items-center justify-between gap-4 sm:h-14')}>
        <Wordmark />
        {/* 26 §8.1 item 11: three text links on every width, no hamburger. */}
        <nav aria-label="Main" className="flex items-center gap-4 sm:gap-6">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={NAV_LINK}>
              {n.label}
            </NavLink>
          ))}
        </nav>
      </div>
      {practice && (
        <div className={cx(page, 'pb-2.5')} data-practice-strip>
          <PracticeBadge />
        </div>
      )}
    </header>
  )
}

export function SiteFooter() {
  const repo = repoUrl()
  return (
    <footer className="mt-16 border-t border-line-1 pt-8 pb-12 sm:mt-24 print:hidden">
      <div className={cx(page, 'flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3 max-sm:flex-col max-sm:items-start')}>
        <p className={type.bodyS}>All results in Readout are fictional teaching scenarios.</p>
        <p className={cx(type.bodyS, 'flex flex-wrap gap-x-6 gap-y-2')}>
          <span>Built with Flagsmith for WeMakeDevs Toggle Wars</span>
          {repo && (
            <a href={repo} className={linkMuted} rel="noreferrer">
              GitHub
            </a>
          )}
          <Link to="/about#privacy" className={linkMuted}>
            Privacy
          </Link>
        </p>
      </div>
      <div className={cx(page, 'has-[p]:mt-4')}>
        <EnvTag />
      </div>
    </footer>
  )
}

/**
 * Non-production builds only (28 §11). Production renders a hidden marker whose data-env attribute gate G-3 reads;
 * the key itself is never rendered anywhere.
 */
export function EnvTag() {
  const env = envName()
  if (env === 'production') return <span hidden data-env="production" />
  return (
    <p className={cx(chip, 'text-accent')} data-env={env}>
      DEV · not part of the study
    </p>
  )
}

/** 25 §4.1: persistent in the run header. Plain text, not a live region: it never changes while shown. */
export function PracticeBadge() {
  return <span className={cx(chip, 'bg-accent-wash text-accent')}>Practice · not part of the study</span>
}

const SEG = 'h-1 rounded-[2px] transition-[background-color,box-shadow] duration-180 ease-out'
const SEG_STATE = {
  done: 'bg-ink-2',
  current: 'bg-transparent shadow-[inset_0_0_0_1px_var(--color-accent)]',
  todo: 'bg-bg-3 shadow-[inset_0_0_0_1px_var(--color-line-2)]',
} as const

export function ProgressRule({ current, done, total = 6 }: { current: number; done: number; total?: number }) {
  const shown = Math.min(Math.max(current, 0) + 1, total)
  return (
    <div className="grid w-[132px] grid-cols-6 gap-1" role="img" aria-label={`Result ${shown} of ${total}`}>
      {Array.from({ length: total }, (_, i) => {
        const state = i < done ? 'done' : i === current ? 'current' : 'todo'
        return <span key={i} data-state={state} className={cx(SEG, SEG_STATE[state])} aria-hidden="true" />
      })}
    </div>
  )
}

const FRAMING_OPTS: { v: Framing; full: string; short: string }[] = [
  { v: 'p_value', full: 'p-value', short: 'p-value' },
  { v: 'chance_to_win', full: 'chance to beat control', short: 'chance' },
]

const SEG_OPT =
  'cursor-pointer appearance-none whitespace-nowrap rounded-[4px] bg-transparent font-mono font-medium leading-none text-ink-2 transition-colors duration-120 ease-out hover:text-ink-1 focus-visible:outline-offset-0 aria-checked:bg-bg-2 aria-checked:text-ink-1 aria-checked:shadow-[inset_0_0_0_1px_var(--color-line-2)]'
// 44 px touch targets on coarse pointers (29 §12.4): the frame grows, the text does not.
const SEG_SIZE = {
  full: 'h-8 px-3 text-[12px] pointer-coarse:h-11',
  compact: 'h-[26px] px-2 text-[11px] pointer-coarse:h-11 pointer-coarse:px-3',
} as const

/** Segmented toggle (26 §5). A two-option radiogroup: arrows move and select, one tab stop. */
export function FramingToggle({
  value,
  onChange,
  label = 'Inference line',
  compact = false,
}: {
  value: Framing
  onChange: (f: Framing) => void
  label?: string
  compact?: boolean
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const pick = (f: Framing) => {
    if (f !== value) onChange(f)
  }
  return (
    <div className="inline-flex gap-0.5 rounded-control border border-line-2 bg-bg-0 p-0.5" role="radiogroup" aria-label={label}>
      {FRAMING_OPTS.map((o, i) => (
        <button
          key={o.v}
          ref={(el) => {
            refs.current[i] = el
          }}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          tabIndex={value === o.v ? 0 : -1}
          className={cx(SEG_OPT, SEG_SIZE[compact ? 'compact' : 'full'])}
          // The short label keeps the full meaning for assistive tech.
          aria-label={compact ? o.full : undefined}
          onClick={() => pick(o.v)}
          onKeyDown={(e) => {
            const k = e.key
            let next: number | null = null
            if (k === 'ArrowLeft' || k === 'ArrowUp') next = (i + FRAMING_OPTS.length - 1) % FRAMING_OPTS.length
            else if (k === 'ArrowRight' || k === 'ArrowDown') next = (i + 1) % FRAMING_OPTS.length
            else if (k === 'Home') next = 0
            else if (k === 'End') next = FRAMING_OPTS.length - 1
            if (next === null) return
            // Never let the arrows reach page-level handlers (debrief ←/→ navigation, presenter keys).
            e.preventDefault()
            e.stopPropagation()
            pick(FRAMING_OPTS[next]!.v)
            refs.current[next]?.focus()
          }}
        >
          {compact ? o.short : o.full}
        </button>
      ))}
    </div>
  )
}

/** Clipboard write. Resolves false (never throws) when the API is missing, blocked or denied. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export const COPIED_MS = 1600

const COPY_LABEL = 'col-start-1 row-start-1 inline-flex items-center gap-2'

/**
 * Copy button (26 §5, 25 §7). Success: the label reads "Copied" with ✓ for 1.6 s and is announced.
 * Failure: the text appears in a selectable box (26 §8.6 item 10) and focus moves there so ⌘C/Ctrl+C works at once.
 */
export function CopyButton({
  text,
  label,
  primary = false,
  onCopied,
  className = '',
}: {
  text: string
  label: string
  primary?: boolean
  onCopied?: () => void
  className?: string
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  // Bumped on every success so a second copy restarts the 1.6 s window instead of inheriting the first one's.
  const [nonce, setNonce] = useState(0)
  const busy = useRef(false)
  const fallbackRef = useRef<HTMLTextAreaElement>(null)
  const mounted = useRef(true)
  useEffect(() => () => void (mounted.current = false), [])

  useEffect(() => {
    if (state !== 'copied') return
    const t = setTimeout(() => setState('idle'), COPIED_MS)
    return () => clearTimeout(t)
  }, [state, nonce])

  useEffect(() => {
    if (state !== 'failed') return
    const el = fallbackRef.current
    if (!el) return
    el.focus()
    el.select()
  }, [state])

  const onClick = async () => {
    if (busy.current) return
    busy.current = true
    const ok = await copyText(text)
    busy.current = false
    if (!mounted.current) return
    if (ok) {
      setState('copied')
      setNonce((n) => n + 1)
      onCopied?.()
    } else {
      setState('failed')
    }
  }

  const copied = state === 'copied'
  return (
    <div className={cx('inline-flex max-w-full flex-col items-start gap-3 max-sm:w-full', className)}>
      <button
        type="button"
        className={btn(primary ? 'primary' : 'secondary', { grid: true, blockMobile: true })}
        onClick={onClick}
        data-state={state}
      >
        {/* Both labels share one grid cell so the button never changes width; visibility hides the inactive one
            from assistive tech too, so the accessible name is whichever is shown. */}
        <span data-copy-label className={COPY_LABEL} style={{ visibility: copied ? 'hidden' : 'visible' }}>
          {label}
        </span>
        <span data-copy-label className={COPY_LABEL} style={{ visibility: copied ? 'visible' : 'hidden' }}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
            <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
          Copied
        </span>
      </button>
      <span className="sr-only" role="status">
        {copied ? 'Copied to clipboard' : state === 'failed' ? 'Copy blocked. The text is selected below.' : ''}
      </span>
      {state === 'failed' && (
        <div className="w-[min(560px,100%)]">
          <p className={cx(type.bodyS, 'mb-2')}>Your browser blocked the clipboard. Copy this text:</p>
          <textarea
            ref={fallbackRef}
            readOnly
            value={text}
            // Long lines wrap, so size for the wrapped text, within a scrollable 8–14 row box.
            rows={Math.min(14, Math.max(8, text.split('\n').length + 2))}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Text to copy"
            className="block w-full resize-y rounded-control border border-line-2 bg-bg-1 p-3 font-mono text-[13px] leading-5 text-ink-1"
            spellCheck={false}
          />
        </div>
      )}
    </div>
  )
}

/** Paper only: where a printed page came from, in place of the hidden header and footer. */
function PrintSource() {
  const { pathname } = useLocation()
  return (
    <p className={cx(page, type.bodyS, 'mt-6 hidden border-t border-line-1 pt-3 print:block')} data-print-source>
      Readout · {window.location.origin}
      {pathname} · All results in Readout are fictional teaching scenarios.
    </p>
  )
}

export function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a href="#main" className={skipLink}>
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <PrintSource />
      <SiteFooter />
    </>
  )
}

/** Sets document.title for the route: "Readout — Would you ship it?" on the landing page, "<Page> · Readout" elsewhere. */
export function pageTitle(title: string): string {
  return title === 'Readout' ? 'Readout — Would you ship it?' : `${title} · Readout`
}

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = pageTitle(title)
  }, [title])
}
