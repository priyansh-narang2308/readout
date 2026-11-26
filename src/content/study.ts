/**
 * Why a run is practice, and what the player is told (25 §3, 26 §8.1 item 10, 26 §8.2 item 10, 34 §4.5).
 * One line each, honest, never blaming the player. `chosen` (the "Practise without being measured" route) shows no
 * notice: the player picked it.
 */
import type { GateReason } from '../flagsmith/client'

export type PracticeReason = 'chosen' | 'storage' | 'unsupported' | 'done' | 'void' | 'save_failed' | GateReason

const UNAVAILABLE = 'The study isn’t available right now, so this run is practice and isn’t recorded.'
const NOT_RUNNING = 'The study isn’t running right now, so this run is practice.'

export const PRACTICE_COPY: Record<PracticeReason, string | null> = {
  chosen: null,
  storage: 'This browser is blocking storage, so a run here can only be practice and isn’t recorded.',
  unsupported: 'This browser can’t keep a recorded challenge safe across tabs, so a run here is practice and isn’t recorded.',
  done: 'You’ve already completed the measured challenge in this browser.',
  void: 'We couldn’t restore your challenge, so this run continues as practice.',
  save_failed: 'This browser couldn’t save your challenge, so this run is practice and isn’t recorded.',
  'not-configured': UNAVAILABLE,
  'sdk-error': UNAVAILABLE,
  timeout: UNAVAILABLE,
  'not-server': UNAVAILABLE,
  'flag-missing': UNAVAILABLE,
  'unknown-variant': UNAVAILABLE,
  'flag-disabled': NOT_RUNNING,
  'not-in-experiment': NOT_RUNNING,
}
