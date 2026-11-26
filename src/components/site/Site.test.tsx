/**
 * Site chrome and shared controls (26 §5–§6, 25 §3–§4, 28 §11).
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Framing } from '../../content/scenarios.v1'
import {
  COPIED_MS,
  CopyButton,
  EnvTag,
  FramingToggle,
  PracticeBadge,
  ProgressRule,
  SiteLayout,
  copyText,
  pageTitle,
  repoUrl,
} from './Site'

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function setClipboard(writeText: ((t: string) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: writeText ? { writeText } : undefined,
  })
}

const flush = () => act(async () => {})

describe('repoUrl', () => {
  it('accepts a plain GitHub repository URL and drops a trailing slash', () => {
    expect(repoUrl('https://github.com/owner/readout/')).toBe('https://github.com/owner/readout')
  })
  it.each([undefined, '', '  ', 'https://github.com/', 'https://github.com/owner', 'http://github.com/o/r', 'https://evil.example/o/r', 'javascript:alert(1)'])(
    'rejects %j',
    (v) => {
      expect(repoUrl(v)).toBeNull()
    },
  )
})

describe('SiteLayout', () => {
  const renderAt = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <SiteLayout>
          <h1>Page</h1>
        </SiteLayout>
      </MemoryRouter>,
    )

  it('has a skip link to main, one banner, one main, one contentinfo', () => {
    renderAt('/')
    const skip = screen.getByRole('link', { name: 'Skip to content' })
    expect(skip.getAttribute('href')).toBe('#main')
    expect(screen.getByRole('main').id).toBe('main')
    expect(screen.getAllByRole('banner')).toHaveLength(1)
    expect(screen.getAllByRole('contentinfo')).toHaveLength(1)
  })

  it('header: wordmark links home and the nav has exactly Rules, Team, About', () => {
    renderAt('/')
    expect(screen.getByRole('link', { name: 'Readout home' }).getAttribute('href')).toBe('/')
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect([...nav.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Rules', '/rules'],
      ['Team', '/team'],
      ['About', '/about'],
    ])
  })

  it('marks the current section with aria-current', () => {
    renderAt('/rules')
    expect(screen.getByRole('link', { name: 'Rules' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Team' }).getAttribute('aria-current')).toBeNull()
  })

  it('footer: fictional notice, Flagsmith credit, Privacy link; no GitHub link until VITE_REPO_URL is set', () => {
    vi.stubEnv('VITE_REPO_URL', '')
    renderAt('/')
    const footer = screen.getByRole('contentinfo')
    expect(footer.textContent).toContain('All results in Readout are fictional teaching scenarios.')
    expect(footer.textContent).toContain('Built with Flagsmith for WeMakeDevs Toggle Wars')
    expect(screen.getByRole('link', { name: 'Privacy' }).getAttribute('href')).toBe('/about#privacy')
    expect(screen.queryByText('GitHub')).toBeNull()
  })

  it('footer: shows the GitHub link when VITE_REPO_URL is a valid repository', () => {
    vi.stubEnv('VITE_REPO_URL', 'https://github.com/owner/readout')
    renderAt('/')
    expect(screen.getByRole('link', { name: 'GitHub' }).getAttribute('href')).toBe('https://github.com/owner/readout')
  })
})

describe('EnvTag (28 §11, gate G-3)', () => {
  it('development: visible tag that says it is not part of the study', () => {
    vi.stubEnv('VITE_FLAGSMITH_ENV_NAME', 'development')
    const { container } = render(<EnvTag />)
    const el = container.querySelector('[data-env]')!
    expect(el.getAttribute('data-env')).toBe('development')
    expect(el.textContent).toBe('DEV · not part of the study')
    expect((el as HTMLElement).hidden).toBe(false)
  })

  it('production: only a hidden marker, no visible text and never the key', () => {
    vi.stubEnv('VITE_FLAGSMITH_ENV_NAME', 'production')
    vi.stubEnv('VITE_FLAGSMITH_ENV_KEY', 'test-key-should-never-render')
    const { container } = render(<EnvTag />)
    const el = container.querySelector('[data-env]') as HTMLElement
    expect(el.getAttribute('data-env')).toBe('production')
    expect(el.hidden).toBe(true)
    expect(container.textContent).toBe('')
    expect(container.innerHTML).not.toContain('test-key')
  })
})

describe('PracticeBadge and ProgressRule', () => {
  it('practice badge text', () => {
    render(<PracticeBadge />)
    expect(screen.getByText('Practice · not part of the study')).toBeTruthy()
  })

  it.each([
    [0, 0, 'Result 1 of 6', ['current', '', '', '', '', '']],
    [2, 2, 'Result 3 of 6', ['done', 'done', 'current', '', '', '']],
    [6, 6, 'Result 6 of 6', ['done', 'done', 'done', 'done', 'done', 'done']],
  ] as const)('current %i, done %i → "%s"', (current, done, label, segs) => {
    render(<ProgressRule current={current} done={done} />)
    const rule = screen.getByRole('img', { name: label })
    const states = [...rule.children].map((c) => {
      const st = (c as HTMLElement).dataset.state
      return st === 'todo' ? '' : st
    })
    expect(states).toEqual(segs)
  })
})

describe('FramingToggle', () => {
  function Harness({ onChange, compact }: { onChange?: (f: Framing) => void; compact?: boolean }) {
    const [v, setV] = useState<Framing>('p_value')
    return (
      <div
        onKeyDown={() => {
          outer()
        }}
      >
        <FramingToggle
          value={v}
          compact={compact}
          label="Show this line as"
          onChange={(f) => {
            setV(f)
            onChange?.(f)
          }}
        />
      </div>
    )
  }
  const outer = vi.fn()
  const opts = () => screen.getAllByRole('radio')
  const checked = () => opts().find((o) => o.getAttribute('aria-checked') === 'true')!

  it('is a labelled radiogroup with one tab stop on the selected option', () => {
    render(<Harness />)
    expect(screen.getByRole('radiogroup', { name: 'Show this line as' })).toBeTruthy()
    expect(opts().map((o) => o.textContent)).toEqual(['p-value', 'chance to beat control'])
    expect(opts().map((o) => o.tabIndex)).toEqual([0, -1])
  })

  it('click selects; clicking the selected option does not fire onChange', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    fireEvent.click(opts()[0]!)
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(opts()[1]!)
    expect(onChange).toHaveBeenCalledWith('chance_to_win')
    expect(opts().map((o) => o.tabIndex)).toEqual([-1, 0])
  })

  it('arrows move selection and focus, wrap, and never bubble to page handlers', () => {
    outer.mockClear()
    render(<Harness />)
    opts()[0]!.focus()
    fireEvent.keyDown(opts()[0]!, { key: 'ArrowRight' })
    expect(checked().textContent).toBe('chance to beat control')
    expect(document.activeElement).toBe(opts()[1])
    fireEvent.keyDown(opts()[1]!, { key: 'ArrowRight' })
    expect(checked().textContent).toBe('p-value')
    fireEvent.keyDown(opts()[0]!, { key: 'ArrowLeft' })
    expect(checked().textContent).toBe('chance to beat control')
    fireEvent.keyDown(opts()[1]!, { key: 'Home' })
    expect(checked().textContent).toBe('p-value')
    expect(outer).not.toHaveBeenCalled()
    // Unrelated keys still reach the page.
    fireEvent.keyDown(opts()[0]!, { key: 'f' })
    expect(outer).toHaveBeenCalledTimes(1)
  })

  it('compact labels keep the full meaning as the accessible name', () => {
    render(<Harness compact />)
    expect(opts().map((o) => o.textContent)).toEqual(['p-value', 'chance'])
    expect(screen.getByRole('radio', { name: 'chance to beat control' })).toBeTruthy()
  })
})

describe('copyText', () => {
  it('resolves true when the clipboard write succeeds', async () => {
    const w = vi.fn().mockResolvedValue(undefined)
    setClipboard(w)
    expect(await copyText('x')).toBe(true)
    expect(w).toHaveBeenCalledWith('x')
  })
  it('resolves false when the clipboard API is missing or rejects', async () => {
    setClipboard(undefined)
    expect(await copyText('x')).toBe(false)
    setClipboard(() => Promise.reject(new DOMException('denied', 'NotAllowedError')))
    expect(await copyText('x')).toBe(false)
  })
})

describe('CopyButton', () => {
  const btn = () => screen.getByRole('button')
  const visibleLabel = () =>
    [...btn().querySelectorAll<HTMLElement>('[data-copy-label]')].find((s) => s.style.visibility === 'visible')!.textContent

  it('success: copies the exact text, shows Copied for 1.6 s, announces it, calls onCopied once', async () => {
    vi.useFakeTimers()
    const w = vi.fn().mockResolvedValue(undefined)
    setClipboard(w)
    const onCopied = vi.fn()
    render(<CopyButton text={'- [ ] one\n- [ ] two'} label="Copy as Markdown" onCopied={onCopied} />)
    expect(visibleLabel()).toBe('Copy as Markdown')
    fireEvent.click(btn())
    await flush()
    expect(w).toHaveBeenCalledWith('- [ ] one\n- [ ] two')
    expect(visibleLabel()).toBe('Copied')
    expect(screen.getByRole('status').textContent).toBe('Copied to clipboard')
    expect(onCopied).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(COPIED_MS - 1))
    expect(visibleLabel()).toBe('Copied')
    act(() => vi.advanceTimersByTime(1))
    expect(visibleLabel()).toBe('Copy as Markdown')
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('a second copy restarts the 1.6 s window', async () => {
    vi.useFakeTimers()
    setClipboard(vi.fn().mockResolvedValue(undefined))
    render(<CopyButton text="t" label="Copy" />)
    fireEvent.click(btn())
    await flush()
    act(() => vi.advanceTimersByTime(1000))
    fireEvent.click(btn())
    await flush()
    act(() => vi.advanceTimersByTime(1000))
    expect(visibleLabel()).toBe('Copied')
    act(() => vi.advanceTimersByTime(COPIED_MS - 1000))
    expect(visibleLabel()).toBe('Copy')
  })

  it('ignores a click while a copy is still in flight', async () => {
    let resolve!: () => void
    const w = vi.fn(() => new Promise<void>((r) => (resolve = r)))
    setClipboard(w)
    const onCopied = vi.fn()
    render(<CopyButton text="t" label="Copy" onCopied={onCopied} />)
    fireEvent.click(btn())
    fireEvent.click(btn())
    await act(async () => resolve())
    expect(w).toHaveBeenCalledTimes(1)
    expect(onCopied).toHaveBeenCalledTimes(1)
  })

  it('blocked: shows the exact text selected in a box, focuses it, never calls onCopied', async () => {
    setClipboard(() => Promise.reject(new Error('blocked')))
    const onCopied = vi.fn()
    render(<CopyButton text={'line 1\nline 2'} label="Copy share text" onCopied={onCopied} />)
    fireEvent.click(btn())
    await flush()
    const box = screen.getByRole('textbox', { name: 'Text to copy' }) as HTMLTextAreaElement
    expect(box.value).toBe('line 1\nline 2')
    expect(box.readOnly).toBe(true)
    expect(document.activeElement).toBe(box)
    expect(screen.getByText('Your browser blocked the clipboard. Copy this text:')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toMatch(/blocked/i)
    expect(onCopied).not.toHaveBeenCalled()
    expect(visibleLabel()).toBe('Copy share text')
  })

  it('a later successful copy replaces the fallback box', async () => {
    const w = vi.fn().mockRejectedValueOnce(new Error('blocked')).mockResolvedValue(undefined)
    setClipboard(w)
    render(<CopyButton text="t" label="Copy" />)
    fireEvent.click(btn())
    await flush()
    expect(screen.queryByRole('textbox')).toBeTruthy()
    fireEvent.click(btn())
    await flush()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(visibleLabel()).toBe('Copied')
  })
})

describe('pageTitle', () => {
  it('landing gets the full title; other pages get "<Page> · Readout"', () => {
    expect(pageTitle('Readout')).toBe('Readout — Would you ship it?')
    expect(pageTitle('Rules')).toBe('Rules · Readout')
  })
})
