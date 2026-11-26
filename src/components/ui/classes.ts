/**
 * Shared Tailwind class strings (26 §2, §5): the type scale, page layout, buttons, links, chips and notices.
 * Components compose these instead of global CSS classes. Each string is written out in full so Tailwind finds it.
 *
 * Rule for composing: never put two utilities for the same property on one element (Tailwind does not promise which
 * wins). That is why the button helpers below take options instead of being concatenated with overrides.
 */

/** Joins class strings, skipping falsy parts. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

// ---------- layout ----------
/** Centred page column: 1120 px of content plus a 16 / 32 / 48 px gutter (phone / tablet / desktop). */
export const page =
  'mx-auto w-full px-(--gutter) max-w-[calc(var(--container-page)+2*var(--gutter))] [--gutter:16px] sm:[--gutter:32px] lg:[--gutter:48px]'

// ---------- type (mobile size first, desktop from 640 px) ----------
export const type = {
  displayXl: 'font-display font-medium text-display-xl-m sm:text-display-xl',
  displayL: 'font-display font-medium text-display-l-m sm:text-display-l',
  titleL: 'font-semibold text-title-l-m sm:text-title-l',
  titleM: 'font-semibold text-title-m-m sm:text-title-m',
  bodyL: 'max-w-[62ch] text-body-l-m text-ink-2 sm:text-body-l',
  body: 'max-w-[68ch] text-body',
  /** Small print in --ink-3. Use `bodySize` when the colour differs. */
  bodyS: 'text-body-s text-ink-3',
  bodySize: 'text-body-s',
  /** Eyebrow in --ink-3. Use `eyebrowBase` + a size when the size differs (compact card). */
  eyebrow: 'font-mono font-medium text-eyebrow uppercase text-ink-3',
  eyebrowBase: 'font-mono font-medium uppercase tracking-[0.08em] text-ink-3',
  data: 'font-mono tabular-nums text-data-m sm:text-data',
  dataXl: 'font-mono font-medium tabular-nums text-data-xl-m sm:text-data-xl',
} as const

// ---------- buttons ----------
const btnBase =
  'items-center justify-center gap-2 h-11 px-5 rounded-control border font-sans text-[15px] leading-none no-underline whitespace-nowrap cursor-pointer transition-colors duration-120 ease-out'

const BTN_VARIANT = {
  primary:
    'border-transparent bg-accent font-semibold text-accent-ink hover:bg-accent-hover active:bg-accent-press disabled:cursor-not-allowed disabled:bg-bg-3 disabled:text-ink-3 aria-disabled:cursor-not-allowed aria-disabled:bg-bg-3 aria-disabled:text-ink-3 max-sm:h-13',
  secondary: 'border-line-2 bg-transparent font-medium text-ink-1 hover:bg-bg-2 active:bg-bg-3',
} as const

/**
 * Primary (52 px tall on phones, 26 §5) or secondary button.
 * `blockMobile`: full width and 52 px on phones. `grid`: inline-grid instead of inline-flex (stacked labels).
 */
export function btn(
  variant: keyof typeof BTN_VARIANT,
  { blockMobile = false, grid = false }: { blockMobile?: boolean; grid?: boolean } = {},
): string {
  return cx(
    grid ? 'inline-grid place-items-center' : 'inline-flex',
    btnBase,
    BTN_VARIANT[variant],
    blockMobile && 'max-sm:w-full max-sm:h-13',
  )
}

/** Text-only button or link: ink-2, underline on hover and keyboard focus. Inherits its font size. */
export const btnGhost =
  'cursor-pointer font-medium text-ink-2 no-underline underline-offset-3 hover:text-ink-1 hover:underline focus-visible:text-ink-1 focus-visible:underline'

export const spinner =
  'size-3.5 animate-spin-fast rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none motion-reduce:border-r-current motion-reduce:opacity-60'

// ---------- inline parts ----------
export const link = 'text-ink-1 underline decoration-line-3 underline-offset-3 hover:decoration-ink-1'

/** Footer link: dimmer at rest. */
export const linkMuted =
  'text-ink-2 underline decoration-line-3 underline-offset-3 hover:text-ink-1 hover:decoration-ink-1'

/** Chip outline follows the text colour; set the colour on the chip itself. */
export const chip =
  'inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-chip border border-current/40 px-2 font-mono text-[11px] font-medium uppercase tracking-[0.06em]'

export const kbd =
  'inline-flex h-5 min-w-5 items-center justify-center rounded-chip border border-line-3 px-[5px] font-mono text-[11px] text-ink-2'

export function notice(warn = false): string {
  return cx(
    'flex items-start gap-3 rounded-r-control border-l-2 bg-bg-1 px-4 py-3 text-[14px] leading-[22px] text-ink-2',
    warn ? 'border-accent' : 'border-line-3',
  )
}

export const srOnly = 'sr-only'

export const skipLink =
  'absolute -top-[100px] left-4 z-100 rounded-control bg-accent px-4 py-2 font-semibold text-accent-ink no-underline focus:top-2'

/** Evidence annotation (debrief and presenter only): accent outline and wash, fading in. Pass the outline offset. */
export function evidence(offset: 'outline-offset-3' | 'outline-offset-4' | 'outline-offset-6' = 'outline-offset-3'): string {
  // Muted text inside the amber wash would drop below 4.5:1 (axe, task 34), so it steps up to ink-2 there.
  return cx('rounded-[3px] bg-accent-wash outline outline-accent animate-evidence-in [&_.text-ink-3]:text-ink-2', offset)
}
