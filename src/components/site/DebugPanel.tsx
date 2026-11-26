/**
 * Development-only debug panel (28 §10 V-2). Never rendered in production builds.
 * Shows real state only: the gate result, the stored attempt and the observed HTTP outcome of each events POST.
 */
import { useEffect, useState } from 'react'
import { envKey, envName, flagsmith, FLAG_KEY } from '../../flagsmith/client'
import { deliveryLog, outcome, subscribe } from '../../flagsmith/deliveryMonitor'
import { exposureKey } from '../../flagsmith/measurement'
import { KEYS, read, readAttempt } from '../../run/attemptStore'
import { useStudy } from '../../run/StudyContext'
import { chip, cx, type } from '../ui/classes'

export function DebugPanel() {
  const { gate } = useStudy()
  const [open, setOpen] = useState(false)
  const [, tick] = useState(0)
  useEffect(() => subscribe(() => tick((x) => x + 1)), [])
  useEffect(() => {
    if (!open) return
    const t = setInterval(() => tick((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [open])
  if (envName() === 'production') return null
  const r = readAttempt()
  const uid = read(KEYS.uid)
  const flag = flagsmith.getAllFlags?.()?.[FLAG_KEY]
  return (
    <div className="fixed right-3 bottom-3 z-50 flex flex-col-reverse items-end gap-2 print:hidden">
      <button
        type="button"
        className={cx(chip, 'cursor-pointer bg-bg-1 text-accent')} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        DEV
      </button>
      {open && (
        <div
          className={cx(type.data, 'max-h-[60vh] w-[min(420px,calc(100vw-24px))] overflow-auto rounded-control border border-line-2 bg-bg-1 p-3 text-ink-2')}
          role="region" aria-label="Development debug panel">
          <p>env: {envName()} · key: {envKey() ? 'set' : 'missing'}</p>
          <p>sdk source: {flagsmith.loadingState?.source ?? '—'}</p>
          {/* V-5: the identifier in every POST must equal this. A random browser ID, shown in Development only. */}
          <p data-debug-uid>identity: {uid ?? '—'}</p>
          <p>
            gate:{' '}
            {gate ? (gate.enrolled ? `enrolled · ${gate.variant} · exp ${gate.experimentId}` : `practice · ${gate.reason}`) : '—'}
          </p>
          <p>
            flag: {flag ? `${String(flag.value)} · variant ${flag.variant ?? '—'} · in ${String(flag.experiment?.inExperiment ?? '—')}` : '—'}
          </p>
          <p>
            attempt:{' '}
            {r.kind === 'ok'
              ? `${r.attempt.status} · ${r.attempt.variant} · ${r.attempt.index}/6 · send1 ${r.attempt.delivery.send1 ?? '—'} · send2 ${r.attempt.delivery.send2 ?? '—'}`
              : r.kind}
          </p>
          {/* V-4: the exposure's own delivery, observed on the wire, not assumed from flushEvents(). */}
          <p data-debug-exposure>exposure: {uid ? (outcome(exposureKey(uid)) ?? 'not sent') : '—'}</p>
          <p className={cx(type.eyebrow, 'mt-2')}>events POSTs (observed)</p>
          {deliveryLog().length === 0 && <p className="text-ink-3">none</p>}
          {deliveryLog().map((l, i) => (
            <p key={i}>
              {new Date(l.at).toLocaleTimeString()} · {String(l.status)} · {l.events.join(', ')}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
