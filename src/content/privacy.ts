/**
 * The disclosed measurement (34 §4.2–4.3). A unit test asserts this list equals what measurement.ts sends.
 */
export const DISCLOSED_EVENTS = [
  '$flag_exposure',
  'readout_score',
  'readout_completed',
  'readout_loss_call',
  'readout_near_miss_call',
  'readout_rules_copied',
] as const

/**
 * What each event is for, in words a player can check before playing. Spoiler-free: none of these says what the
 * versions differ in (a test runs the recruitment spoiler check over them).
 */
export const EVENT_PURPOSE: Record<(typeof DISCLOSED_EVENTS)[number], string> = {
  $flag_exposure: 'which version of the results you were shown, so the two versions can be compared',
  readout_score: 'how many of your six calls were defensible: the main measure',
  readout_completed: 'that you finished all six, to check neither version makes people give up',
  readout_loss_call: 'your call on one particular result, a secondary measure',
  readout_near_miss_call: 'your call on another particular result, to check neither version causes a new mistake',
  readout_rules_copied: 'that you copied the Rules afterwards, to see whether people take the checklist away (exploratory)',
}

export const DISCLOSED_METADATA = [
  'scenarioSet',
  'attemptId',
  'answers',
  'totalSeconds',
  'ref',
  'variantMismatch',
  'send',
] as const

/**
 * Metadata the Flagsmith SDK itself adds to what it sends (observed on the wire with the pinned 12.4.0, see
 * flagsmith/integration.test.tsx): the experiment's ID on the exposure, and the SDK version on every event.
 */
export const SDK_METADATA = ['experiment_id', 'sdk_version'] as const

/** Plain-language list shown in the consent block. */
export const RECORDED_PLAIN = [
  'that a result was shown to you, and which version you saw',
  'your six calls',
  'how long you took',
  'whether you finished',
  'whether you later copy the Rules',
  'which shared link brought you here, if any',
]
