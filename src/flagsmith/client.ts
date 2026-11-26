/**
 * The single Flagsmith instance, its init options (28 §4) and the enrolment gate.
 *
 * Nothing here runs at import time: the SDK is initialised only after the player presses Start
 * (or on load when an already-consented measured attempt exists). 34 §4.1.
 */
import { createFlagsmithInstance } from '@flagsmith/flagsmith'
import type { IFlagsmith, IFlagsmithFeature } from '@flagsmith/flagsmith/types'
import { createMonitoredFetch } from './deliveryMonitor'
import type { EnvName, Variant } from '../run/attemptStore'
import type { Framing } from '../content/scenarios.v1'

export const FLAG_KEY = 'readout_framing'
export const VARIANTS: Variant[] = ['control', 'chance_to_win']
export const GATE_TIMEOUT_MS = 4000

export const flagsmith: IFlagsmith = createFlagsmithInstance()

export function envName(): EnvName {
  return import.meta.env.VITE_FLAGSMITH_ENV_NAME === 'production' ? 'production' : 'development'
}

export function envKey(): string | undefined {
  const k = import.meta.env.VITE_FLAGSMITH_ENV_KEY
  return k && k.trim() ? k.trim() : undefined
}

export function initOptions(identity: string, fetchImpl = createMonitoredFetch()) {
  return {
    environmentID: envKey(),
    identity,
    cacheFlags: false,
    realtime: false,
    enableAnalytics: false,
    enableLogs: envName() !== 'production' && import.meta.env.MODE !== 'test',
    enableEvents: true,
    fetch: fetchImpl,
    // `api` not set: the SDK's default Edge API (remote evaluation). No defaultFlags: nothing renders before the server.
  }
}

export type GateReason =
  | 'not-configured'
  | 'sdk-error'
  | 'timeout'
  | 'not-server'
  | 'flag-missing'
  | 'flag-disabled'
  | 'not-in-experiment'
  | 'unknown-variant'

export type GateResult =
  | { enrolled: true; variant: Variant; experimentId: number; experimentName: string; value: unknown }
  | { enrolled: false; reason: GateReason; detail?: string; rollout?: Framing }

/**
 * The environment's own value for the flag, outside an experiment (12 §6 "ship the winner with the same flag"). Only
 * the two framing values are accepted; anything else is not a rollout and the caller keeps its default.
 */
export function rolloutFraming(value: unknown): Framing | undefined {
  return value === 'p_value' || value === 'chance_to_win' ? value : undefined
}

/** Evaluate the four-part readiness gate on an initialised instance (28 §4). */
export function evaluateGate(fs: Pick<IFlagsmith, 'getAllFlags' | 'loadingState'>): GateResult {
  if (fs.loadingState?.source !== 'SERVER') return { enrolled: false, reason: 'not-server' }
  const flag = fs.getAllFlags()?.[FLAG_KEY] as IFlagsmithFeature | undefined
  if (!flag) return { enrolled: false, reason: 'flag-missing' }
  if (!flag.enabled) return { enrolled: false, reason: 'flag-disabled' }
  if (!flag.experiment || flag.experiment.inExperiment !== true) {
    // No running experiment for this identity (not started yet, or ended and rolled out): never measured, but the
    // server's value is the environment's current framing, which practice and the presenter may use as their default.
    const rollout = rolloutFraming(flag.value)
    return { enrolled: false, reason: 'not-in-experiment', ...(rollout ? { rollout } : {}) }
  }
  if (!flag.variant || !VARIANTS.includes(flag.variant as Variant))
    return { enrolled: false, reason: 'unknown-variant', detail: String(flag.variant) }
  return {
    enrolled: true,
    variant: flag.variant as Variant,
    experimentId: flag.experiment.id,
    experimentName: flag.experiment.name,
    value: flag.value,
  }
}

let initPromise: Promise<void> | null = null
let initIdentity: string | null = null
let initError: Error | null = null
let initDone = false

/** Initialise once per page load with this identity. */
export function initFlagsmith(identity: string, fetchImpl?: ReturnType<typeof createMonitoredFetch>): Promise<void> {
  if (initPromise && initIdentity === identity) return initPromise
  initIdentity = identity
  initError = null
  initDone = false
  initPromise = flagsmith
    .init({
      ...initOptions(identity, fetchImpl),
      onError: (e: Error) => {
        initError = e
      },
    })
    .catch((e: unknown) => {
      initError = e instanceof Error ? e : new Error(String(e))
    })
    .finally(() => {
      initDone = true
    })
  return initPromise
}

/**
 * True when the SDK finished initialising for `identity` without an error and its events pipeline is on, i.e. a
 * trackEvent now will really be buffered and posted. Score events are only claimed and sent when this is true;
 * otherwise the attempt stays scored_pending and is sent on the next visit.
 */
export function isReady(identity: string): boolean {
  return initDone && !initError && initIdentity === identity && flagsmith.eventsEnabled === true
}

export function isInitialised(): boolean {
  return initPromise !== null
}

/** Start → init → gate, capped at GATE_TIMEOUT_MS. Never resolves enrolled on a cache or default source. */
export async function enrol(identity: string, fetchImpl?: ReturnType<typeof createMonitoredFetch>): Promise<GateResult> {
  if (!envKey()) return { enrolled: false, reason: 'not-configured' }
  const timeout = new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), GATE_TIMEOUT_MS))
  const result = await Promise.race([initFlagsmith(identity, fetchImpl).then(() => 'done' as const), timeout])
  if (result === 'timeout') return { enrolled: false, reason: 'timeout' }
  if (initError) return { enrolled: false, reason: 'sdk-error', detail: initError.message }
  return evaluateGate(flagsmith)
}

/** Test helper: reset module state between tests. */
export function __resetClient() {
  initPromise = null
  initIdentity = null
  initError = null
  initDone = false
}
