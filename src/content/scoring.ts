/**
 * Metric values and report patterns (27 T-SCORE, 25 §7). FROZEN at tag measured-v1 (scripts/check-frozen.mjs).
 */
import { MEASURED_ORDER, SCENARIOS, type Call, type ScenarioId } from './scenarios.v1'

export type Answers = Partial<Record<ScenarioId, Call>>

export function isCorrect(id: ScenarioId, call: Call | undefined): boolean {
  return call !== undefined && SCENARIOS[id].key === call
}

export function correctCount(answers: Answers): number {
  return MEASURED_ORDER.filter((id) => isCorrect(id, answers[id])).length
}

/** M1 readout_score = correct / 6 (unanswered counts as incorrect). */
export function score(answers: Answers): number {
  return correctCount(answers) / 6
}

/** M3 readout_loss_call: 1 if S2 = Keep the control. */
export function lossCall(answers: Answers): 0 | 1 {
  return answers.S2 === 'control' ? 1 : 0
}

/** M4 readout_near_miss_call: 1 if S3 = Keep collecting. */
export function nearMissCall(answers: Answers): 0 | 1 {
  return answers.S3 === 'collecting' ? 1 : 0
}

/** Metadata `answers` string in play order, e.g. "S3:collecting,S1:ship,...". */
export function answersString(answers: Answers, order: ScenarioId[] = MEASURED_ORDER): string {
  return order.map((id) => `${id}:${answers[id] ?? 'none'}`).join(',')
}

export type Pattern = { id: string; title: string; text: string }

/** Report patterns, most costly first; at most three shown (25 §7). */
export function patterns(answers: Answers): Pattern[] {
  const out: Pattern[] = []
  if (MEASURED_ORDER.every((id) => isCorrect(id, answers[id]))) return []
  if (answers.S2 === 'ship')
    out.push({
      id: 'significant-good',
      title: 'Significant ≠ good',
      text: 'You shipped a result that was significantly worse. Significance tells you the effect is probably real, not that it’s good. Check direction first.',
    })
  if (answers.S5 !== 'distrust')
    out.push({
      id: 'broken-split',
      title: 'Missed a broken split',
      text: 'A 59/41 split on a 50/50 test means something is broken in assignment or logging. Don’t interpret; investigate.',
    })
  if (answers.S6 === 'ship')
    out.push({
      id: 'guardrail',
      title: 'Missed the guardrail',
      text: 'Orders went up but refunds nearly doubled. A clearly worse guardrail blocks a ship.',
    })
  const early = (answers.S3 === 'ship' ? 1 : 0) + (answers.S4 === 'ship' ? 1 : 0)
  if (early === 2)
    out.push({
      id: 'early-repeated',
      title: 'Calling it early',
      text: 'Twice, you shipped before the planned sample. This was your most repeated pattern.',
    })
  else if (early === 1)
    out.push({
      id: 'early',
      title: 'Calling it early',
      text: 'You shipped before the planned sample was reached.',
    })
  if (answers.S2 === 'collecting')
    out.push({
      id: 'waiting-loss',
      title: 'Waiting on a clear loss',
      text: 'The loss was already clear at the full planned sample. More data wouldn’t change the call.',
    })
  if (answers.S1 !== 'ship')
    out.push({
      id: 'over-caution',
      title: 'Over-caution',
      text: 'The one clean, complete, significant win didn’t get shipped. Caution has a cost too.',
    })
  if ((Object.keys(answers) as ScenarioId[]).some((id) => id !== 'S5' && answers[id] === 'distrust'))
    out.push({
      id: 'distrust-clean',
      title: 'Distrusting clean data',
      text: 'You distrusted data that had no quality problem. Reserve “don’t trust” for a broken split or broken logging.',
    })
  return out
}

export const ALL_DEFENSIBLE_TEXT =
  'Every call was defensible. The Rules below are how to keep it that way in a real review.'

/** Fisher–Yates shuffle for practice order. */
export function shuffled<T>(items: T[], rand: () => number = Math.random): T[] {
  const a = items.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j] as T, a[i] as T]
  }
  return a
}
