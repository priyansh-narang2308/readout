/**
 * Upgrade C: impact evidence from real event data (random browser IDs, no names) (35 §7). Which traps catch developers, which rule they
 * break most, how many took the Rules away.
 *
 * Rules this module enforces, because the numbers it prints may end up in the README:
 * - **Input is real exported events only.** It never creates, fills in or extrapolates data. Anything it can't read is
 *   counted as rejected, with the reason, never repaired.
 * - **Pooled, never per arm.** The arm comparison belongs to Flagsmith's experiment and the pre-registered decision
 *   rule (EXPERIMENT.md §10). The score events carry no arm, and this report never tries to recover one.
 * - **One player = one attempt.** A batch re-sent on a later visit (`send: 2`) is the same attempt and counts once.
 * - **Labelled.** Production output says "Production · real players · as of"; Development output says it is not a
 *   finding. A Production file containing any Development check event is refused whole.
 *
 * Not part of the app bundle: nothing in the app imports it. `npm run impact` runs it on an export file.
 */
import { CALL_LABEL, CALLS, MEASURED_ORDER, SCENARIO_SET, SCENARIOS, type Call, type ScenarioId } from '../content/scenarios.v1'
import { RULES } from '../content/rules'
import { isCorrect, patterns, type Answers } from '../content/scoring'

export type RawEvent = { event?: unknown; identifier?: unknown; value?: unknown; metadata?: unknown }
export type Env = 'production' | 'development'

export type Player = { attemptId: string; answers: Required<Answers>; ref: string | null; totalSeconds: number | null }

export type Parsed = {
  players: Player[]
  rulesCopied: number
  rejected: Record<string, number>
  duplicateSends: number
}

const CALL_SET = new Set<string>(CALLS)
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)

/** "S3:collecting,S1:ship,…" in the fixed measured order, all six answered, or null. */
export function parseAnswers(s: unknown): Required<Answers> | null {
  if (typeof s !== 'string') return null
  const parts = s.split(',').map((p) => p.split(':'))
  if (parts.length !== MEASURED_ORDER.length) return null
  const out: Partial<Record<ScenarioId, Call>> = {}
  for (const [i, part] of parts.entries()) {
    const [id, call] = part
    if (part.length !== 2 || id !== MEASURED_ORDER[i] || !call || !CALL_SET.has(call)) return null
    out[id as ScenarioId] = call as Call
  }
  return out as Required<Answers>
}

/** Reads an export: score events become players, rules-copied events are counted per attempt. */
export function parseEvents(events: RawEvent[], env: Env): Parsed {
  const rejected: Record<string, number> = {}
  const reject = (why: string) => (rejected[why] = (rejected[why] ?? 0) + 1)
  const devCheck = events.some(
    (e) =>
      e.event === 'readout_dev_check' ||
      (typeof e.identifier === 'string' && /^(dev-check-|synthetic-dev-)/.test(e.identifier)) ||
      (isObj(e.metadata) && e.metadata.synthetic === true),
  )
  if (env === 'production' && devCheck)
    throw new Error('This file contains Development check or synthetic events, so it is not a Production export. Nothing was read.')

  const players = new Map<string, Player>()
  const copied = new Set<string>()
  let duplicateSends = 0
  for (const e of events) {
    if (e.event !== 'readout_score' && e.event !== 'readout_rules_copied') continue
    const m = e.metadata
    if (!isObj(m)) {
      reject('no metadata')
      continue
    }
    if (m.scenarioSet !== SCENARIO_SET) {
      reject('another scenario set')
      continue
    }
    if (typeof m.attemptId !== 'string' || !m.attemptId) {
      reject('no attempt id')
      continue
    }
    if (e.event === 'readout_rules_copied') {
      copied.add(m.attemptId)
      continue
    }
    const answers = parseAnswers(m.answers)
    if (!answers) {
      reject('unreadable answers')
      continue
    }
    if (players.has(m.attemptId)) {
      duplicateSends++
      continue
    }
    players.set(m.attemptId, {
      attemptId: m.attemptId,
      answers,
      ref: typeof m.ref === 'string' ? m.ref : null,
      totalSeconds: typeof m.totalSeconds === 'number' ? m.totalSeconds : null,
    })
  }
  // A copy counts only for a player in this export (M5 is sent after that player's scores).
  const rulesCopied = [...copied].filter((id) => players.has(id)).length
  return { players: [...players.values()], rulesCopied, rejected, duplicateSends }
}

export type ScenarioImpact = {
  id: ScenarioId
  title: string
  trap: string
  correct: number
  /** Wrong calls, most common first. */
  wrong: { call: Call; count: number }[]
}

export type Impact = {
  n: number
  scenarios: ScenarioImpact[]
  /** Per rule: wrong calls on results that test it, over the chances to break it. */
  rules: { n: number; title: string; misses: number; chances: number }[]
  patterns: { id: string; title: string; count: number }[]
  allDefensible: number
  rulesCopied: number
}

export function impact(p: Parsed): Impact {
  const n = p.players.length
  const scenarios = MEASURED_ORDER.map((id): ScenarioImpact => {
    const wrong = new Map<Call, number>()
    let correct = 0
    for (const pl of p.players) {
      const call = pl.answers[id]
      if (isCorrect(id, call)) correct++
      else wrong.set(call, (wrong.get(call) ?? 0) + 1)
    }
    return {
      id,
      title: SCENARIOS[id].shortTitle,
      trap: SCENARIOS[id].trap.name,
      correct,
      wrong: [...wrong].map(([call, count]) => ({ call, count })).sort((a, b) => b.count - a.count || a.call.localeCompare(b.call)),
    }
  })
  const rules = RULES.map((r) => {
    const tested = MEASURED_ORDER.filter((id) => SCENARIOS[id].rules.includes(r.n))
    const misses = tested.reduce((s, id) => s + p.players.filter((pl) => !isCorrect(id, pl.answers[id])).length, 0)
    return { n: r.n, title: r.title, misses, chances: tested.length * n }
  })
  const counts = new Map<string, { title: string; count: number }>()
  let allDefensible = 0
  for (const pl of p.players) {
    const pats = patterns(pl.answers)
    if (pats.length === 0) allDefensible++
    for (const pt of pats) counts.set(pt.id, { title: pt.title, count: (counts.get(pt.id)?.count ?? 0) + 1 })
  }
  return {
    n,
    scenarios,
    rules,
    patterns: [...counts].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id)),
    allDefensible,
    rulesCopied: p.rulesCopied,
  }
}

const pct = (a: number, b: number) => (b === 0 ? '—' : `${Math.round((100 * a) / b)}%`)

export const DEV_LABEL = 'Development environment — pipeline and team plays — not a finding'
export const prodLabel = (asOf: string) => `Production · real players · as of ${asOf}`

/** The Markdown report. Every number is a count from the file, with its share; nothing is estimated. */
export function report(p: Parsed, i: Impact, o: { env: Env; asOf: string; source: string }): string {
  if (!o.asOf.trim() || !o.source.trim()) throw new Error('A report needs the as-of time and where the export came from.')
  const label = o.env === 'production' ? prodLabel(o.asOf) : `${DEV_LABEL} · as of ${o.asOf}`
  const L: string[] = [`## Impact evidence`, '', `**${label}**`, '', `Source: ${o.source}.`]
  L.push(
    `Players: ${i.n} finished measured runs, both arms pooled. Descriptive counts only: this is not the experiment's result, which is read in Flagsmith (EXPERIMENT.md §10).`,
  )
  const rej = Object.entries(p.rejected)
  if (rej.length || p.duplicateSends)
    L.push(
      `Not counted: ${[...rej.map(([why, c]) => `${c} ${why}`), ...(p.duplicateSends ? [`${p.duplicateSends} re-sent batches (same attempt, counted once)`] : [])].join('; ')}.`,
    )
  if (i.n === 0) {
    L.push('', 'No finished runs in this file, so there is nothing to report.')
    return L.join('\n')
  }
  L.push('', '### Where the traps caught people', '', '| Result | Trap | Defensible call made | Most common other call |', '|---|---|---|---|')
  for (const s of i.scenarios) {
    const top = s.wrong[0]
    L.push(
      `| ${s.title} | ${s.trap} | ${s.correct} of ${i.n} (${pct(s.correct, i.n)}) | ${top ? `${CALL_LABEL[top.call]}: ${top.count} (${pct(top.count, i.n)})` : '—'} |`,
    )
  }
  const broken = [...i.rules].filter((r) => r.chances > 0).sort((a, b) => b.misses / b.chances - a.misses / a.chances || a.n - b.n)
  L.push('', '### Rules broken', '', '| Rule | Broken | Of chances |', '|---|---|---|')
  for (const r of broken) L.push(`| ${r.n}. ${r.title} | ${r.misses} (${pct(r.misses, r.chances)}) | ${r.chances} |`)
  const worst = broken[0]
  if (worst && worst.misses > 0) L.push('', `Most broken: rule ${worst.n}, "${worst.title}" (${pct(worst.misses, worst.chances)} of chances).`)
  L.push('', '### Mistake patterns', '')
  for (const pt of i.patterns) L.push(`- ${pt.title}: ${pt.count} of ${i.n} (${pct(pt.count, i.n)})`)
  L.push(`- Every call defensible: ${i.allDefensible} of ${i.n} (${pct(i.allDefensible, i.n)})`)
  L.push('', `Copied the Readout Rules after finishing: ${i.rulesCopied} of ${i.n} (${pct(i.rulesCopied, i.n)}).`)
  return L.join('\n')
}

/** Accepts a JSON array, `{ "events": [...] }` (the events API body shape) or JSON lines. */
export function readExport(text: string): RawEvent[] {
  const t = text.trim()
  if (!t) return []
  try {
    const j: unknown = JSON.parse(t)
    if (Array.isArray(j)) return j as RawEvent[]
    if (isObj(j) && Array.isArray(j.events)) return j.events as RawEvent[]
  } catch {
    return t.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as RawEvent)
  }
  throw new Error('Expected a JSON array, { "events": [...] } or JSON lines.')
}
