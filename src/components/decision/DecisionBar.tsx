/**
 * DecisionBar + Lock in (25 §4.2–4.3). Identical in both arms. FROZEN at tag measured-v1.
 * Keys: 1–4 select, ↑/↓/←/→ move within the group, Enter locks in.
 *
 * Lock fires at most ONCE per mounted bar: a held Enter (key repeat) or a double click must never submit a
 * second answer onto the next result. Callers mount a fresh bar per result (key by scenario id).
 */
import { useCallback, useEffect, useRef } from 'react'
import { CALLS, CALL_LABEL, type Call } from '../../content/scenarios.v1'
import { btn, cx, kbd, type } from '../ui/classes'

const OPTION =
  'relative flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-control border border-line-2 bg-transparent px-4 text-left text-[16px] font-medium leading-[22px] transition-[background-color,border-color] duration-120 ease-out hover:not-disabled:bg-bg-2 disabled:cursor-default disabled:text-ink-3 aria-checked:border-ink-2 aria-checked:bg-bg-2 aria-checked:shadow-[inset_3px_0_0_var(--color-accent)] aria-checked:disabled:text-ink-1'

// On phones the actions stick to the bottom of the card, edge to edge, over a fade of the card surface.
const ACTIONS =
  'mt-3 flex flex-wrap items-center gap-4 max-sm:sticky max-sm:bottom-0 max-sm:-mx-6 max-sm:-mb-6 max-sm:mt-4 max-sm:rounded-b-card max-sm:border-t max-sm:border-line-1 max-sm:bg-linear-to-b max-sm:from-bg-1/85 max-sm:to-bg-1 max-sm:to-30% max-sm:px-6 max-sm:pt-3 max-sm:pb-[calc(12px+env(safe-area-inset-bottom))]'

export function DecisionBar({
  selected,
  onSelect,
  onLock,
  locked = false,
  name,
}: {
  selected: Call | null
  onSelect: (c: Call) => void
  onLock: () => void
  locked?: boolean
  name: string
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const fired = useRef(false)

  const lockOnce = useCallback(() => {
    if (fired.current || locked || !selected) return
    fired.current = true
    onLock()
  }, [locked, onLock, selected])

  useEffect(() => {
    if (locked) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || fired.current) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      const n = Number(e.key)
      if (n >= 1 && n <= 4) {
        e.preventDefault()
        onSelect(CALLS[n - 1]!)
        return
      }
      if (e.key === 'Enter' && selected) {
        // Let Enter on other buttons/links behave normally.
        if (t && (t.tagName === 'A' || (t.tagName === 'BUTTON' && !t.dataset.decision && !t.dataset.lock))) return
        e.preventDefault()
        lockOnce()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [locked, lockOnce, onSelect, selected])

  const onArrow = (e: React.KeyboardEvent, i: number) => {
    const dir = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0
    if (!dir) return
    e.preventDefault()
    const next = (i + dir + CALLS.length) % CALLS.length
    onSelect(CALLS[next]!)
    refs.current[next]?.focus()
  }

  const focusIndex = selected ? CALLS.indexOf(selected) : 0

  return (
    <div className="mt-4 border-t border-line-1 pt-4">
      <p className={cx(type.eyebrow, 'mb-2')} id={`${name}-legend`}>
        Your call
      </p>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-labelledby={`${name}-legend`}>
        {CALLS.map((c, i) => (
          <button
            key={c}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={selected === c}
            tabIndex={i === focusIndex ? 0 : -1}
            className={OPTION}
            disabled={locked}
            data-decision={c}
            onClick={() => onSelect(c)}
            onKeyDown={(e) => onArrow(e, i)}
          >
            <span
              className="inline-flex size-6 flex-none items-center justify-center rounded-chip border border-line-3 font-mono text-[12px] text-ink-2"
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <span>{CALL_LABEL[c]}</span>
            {selected === c && (
              <svg className="ml-auto size-4 flex-none text-accent" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" />
              </svg>
            )}
          </button>
        ))}
      </div>
      <div className={ACTIONS}>
        <button
          type="button"
          className={btn('primary', { blockMobile: true })}
          disabled={!selected || locked} onClick={lockOnce} data-lock="1">
          Lock in call
        </button>
        <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-3 max-sm:hidden">
          <span className={kbd}>1</span>–<span className={kbd}>4</span> to choose, <span className={kbd}>Enter</span> to lock in.
          A locked call can’t be changed.
        </span>
      </div>
    </div>
  )
}
