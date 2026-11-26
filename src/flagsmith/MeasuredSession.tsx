/**
 * MeasuredSession: the ONLY place that calls Flagsmith's useExperiment (29 §3). FROZEN at tag measured-v1.
 *
 * Rendered by the challenge route only while a measured attempt is in_progress and a result card is on screen.
 * useExperiment records Flagsmith's `$flag_exposure` (feature readout_framing, value = the variant, metadata
 * experiment_id) for an identity enrolled in the running experiment, with flags from the server. It fires on
 * Result 1 and again on a resumed session (Flagsmith keeps the first exposure per identity). Evaluating the flag at
 * Start is NOT the exposure; this is.
 *
 * It mounts its own FlagsmithProvider around the shared, already-initialised instance (no `options`, so the
 * provider never initialises anything itself). Practice and every other page never mount it (AC-6, AC-7).
 */
import { useEffect, useRef } from 'react'
import { FlagsmithProvider, useExperiment } from '@flagsmith/flagsmith/react'
import { flagsmith, FLAG_KEY } from './client'
import { flushExposure } from './measurement'
import type { Variant } from '../run/attemptStore'

type Props = {
  persistedVariant: Variant
  onVariantMismatch: () => void
  onExposed?: (variant: string | undefined) => void
}

export function MeasuredSession(props: Props) {
  return (
    <FlagsmithProvider flagsmith={flagsmith}>
      <Exposure {...props} />
    </FlagsmithProvider>
  )
}

function Exposure({ persistedVariant, onVariantMismatch, onExposed }: Props) {
  const flag = useExperiment(FLAG_KEY)
  const flushed = useRef(false)

  useEffect(() => {
    if (!flag || !flag.experiment?.inExperiment || flushed.current) return
    flushed.current = true
    // The arm on screen is the one saved at Start. If Flagsmith now says otherwise, record it (never switch arms).
    if (flag.variant !== persistedVariant) onVariantMismatch()
    // useExperiment's effect (declared before ours in the hook) has buffered the exposure; flush it now so an
    // early abandoner still counts (28 §5).
    flushExposure()
    onExposed?.(flag.variant)
  }, [flag, persistedVariant, onVariantMismatch, onExposed])

  return null
}
