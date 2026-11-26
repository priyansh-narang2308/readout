/**
 * The six measured scenarios (27 §5). ALL FICTIONAL TEACHING SCENARIOS: not Flagsmith results,
 * not data from any real company. Numbers here are raw counts; every displayed statistic is computed
 * by src/stats at runtime (never hard-coded).
 *
 * FROZEN at tag measured-v1 (data and measured-card copy). Debrief copy may change after the tag.
 */
import type { Direction } from '../stats/flagsmithStats'

export type ScenarioId = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6'
export type Call = 'ship' | 'control' | 'collecting' | 'distrust'
export type Framing = 'p_value' | 'chance_to_win'
export type EvidenceTarget = 'interval' | 'checks' | 'lift' | 'arms' | 'split' | 'guardrail'

export const CALLS: Call[] = ['ship', 'control', 'collecting', 'distrust']

export const CALL_LABEL: Record<Call, string> = {
  ship: 'Ship the variant',
  control: 'Keep the control',
  collecting: 'Keep collecting',
  distrust: "Don't trust these results",
}

export const CALL_STAMP: Record<Call, string> = {
  ship: 'SHIP',
  control: 'KEEP CONTROL',
  collecting: 'KEEP COLLECTING',
  distrust: "DON'T TRUST",
}

export type Arm = { users: number; conversions: number }

export type MetricSpec = {
  name: string
  /** Noun for the conversion column, e.g. "activated". */
  unit: string
  direction: Direction
  control: Arm
  variant: Arm
}

export type Scenario = {
  id: ScenarioId
  title: string
  shortTitle: string
  context: string
  hypothesis: string
  primary: MetricSpec
  guardrail?: MetricSpec & { rule: string }
  checks: { daysRun: number; daysPlanned: number; usersPlanned: number; configured: [number, number] }
  key: Call
  trap: { name: string; oneLiner: string }
  why: string
  whyNot: string
  misconception: string
  cost: string
  rules: number[]
  evidence: { target: EvidenceTarget; callout: string }[]
}

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  S1: {
    id: 'S1',
    title: 'Onboarding checklist',
    shortTitle: 'Onboarding checklist',
    context: 'A B2B analytics tool. New workspaces often stall before connecting their first data source.',
    hypothesis: 'A setup checklist on first login increases activation.',
    primary: {
      name: 'Activation rate',
      unit: 'activated',
      direction: 'up',
      control: { users: 4000, conversions: 160 },
      variant: { users: 4000, conversions: 212 },
    },
    checks: { daysRun: 14, daysPlanned: 14, usersPlanned: 8000, configured: [0.5, 0.5] },
    key: 'ship',
    trap: {
      name: 'Over-caution',
      oneLiner: 'A clean, complete, clearly positive result. Not shipping it has a cost too.',
    },
    why: 'The split is healthy and the planned sample was reached. The direction is up and the whole interval is above zero. It clears both the 95% and the 97.5% bars. No guardrail is at risk.',
    whyNot:
      'Keep the control ignores a clean result. Keep collecting: the planned sample is done, and extending a finished test for more certainty is peeking in reverse. Don’t trust: there’s no data-quality problem.',
    misconception:
      '“An interval this wide (+6% to +59%) means we don’t know anything.” The width tells you how much better is uncertain, not whether it’s better.',
    cost: 'Every extra week a proven win sits unshipped is value you’ve already paid to find.',
    rules: [6],
    evidence: [
      { target: 'interval', callout: 'Whole interval above zero' },
      { target: 'checks', callout: 'Planned sample reached' },
    ],
  },
  S2: {
    id: 'S2',
    title: 'Shorter pricing page',
    shortTitle: 'Shorter pricing page',
    context: 'A self-serve SaaS. The design team cut the pricing page from three sections to one.',
    hypothesis: 'A shorter pricing page increases upgrades.',
    primary: {
      name: 'Upgrade rate',
      unit: 'upgrades',
      direction: 'up',
      control: { users: 3000, conversions: 360 },
      variant: { users: 3000, conversions: 291 },
    },
    checks: { daysRun: 14, daysPlanned: 14, usersPlanned: 6000, configured: [0.5, 0.5] },
    key: 'control',
    trap: {
      name: 'Reading “significant” as “good”',
      oneLiner: 'A tiny p-value says the difference is probably real, not that it’s in the direction you wanted.',
    },
    why: 'The data is healthy and complete. The variant is clearly worse: the whole interval is below zero.',
    whyNot:
      'Ship ships a loss. Keep collecting: the loss is already clear at the planned sample. Don’t trust: there’s no quality problem.',
    misconception: '“p < 0.05, so the test succeeded.” Significance has no direction.',
    cost: 'Shipping this would cut upgrades by about a fifth.',
    rules: [3],
    evidence: [{ target: 'lift', callout: 'Clearly negative' }],
  },
  S3: {
    id: 'S3',
    title: 'Dark mode by default',
    shortTitle: 'Dark mode by default',
    context: 'A note-taking app’s mobile client. The team believes dark-mode-first users stick around longer.',
    hypothesis: 'Defaulting new users to dark mode increases 7-day retention.',
    primary: {
      name: '7-day retention',
      unit: 'retained',
      direction: 'up',
      control: { users: 1500, conversions: 120 },
      variant: { users: 1500, conversions: 138 },
    },
    checks: { daysRun: 6, daysPlanned: 14, usersPlanned: 7500, configured: [0.5, 0.5] },
    key: 'collecting',
    trap: {
      name: 'Calling it early',
      oneLiner:
        '86% sounds like a win. With the interval crossing zero at 40% of the sample, it’s a coin that’s landed heads a few more times.',
    },
    why: 'Only 40% of the planned sample has arrived, and the interval crosses zero. The test was planned to answer this question at 7,500 users, so it isn’t finished.',
    whyNot:
      'Ship calls a winner from noise. Keep the control gives up on a test that is running as planned, which is a decision for the end, not day 6. Don’t trust: nothing is broken.',
    misconception:
      '“86% chance it’s better means it’s probably a win, so ship.” It doesn’t clear even Flagsmith’s own 95% bar, and the test isn’t finished.',
    cost: 'Ship on day 6 and the “win” has a good chance of evaporating, with nobody noticing.',
    rules: [2, 4],
    evidence: [
      { target: 'interval', callout: 'Interval crosses zero' },
      { target: 'checks', callout: '40% of planned sample' },
    ],
  },
  S4: {
    id: 'S4',
    title: 'AI writing suggestions',
    shortTitle: 'AI writing suggestions',
    context: 'An email tool trialling inline AI suggestions in the composer. It is the first day of a two-week test.',
    hypothesis: 'Inline AI suggestions increase saved drafts.',
    primary: {
      name: 'Draft-save rate',
      unit: 'saved',
      direction: 'up',
      control: { users: 60, conversions: 6 },
      variant: { users: 60, conversions: 11 },
    },
    checks: { daysRun: 1, daysPlanned: 14, usersPlanned: 4000, configured: [0.5, 0.5] },
    key: 'collecting',
    trap: {
      name: 'Big lift, tiny numbers',
      oneLiner: 'The bigger the lift on a small sample, the more suspicious you should be.',
    },
    why: 'There are 17 conversions in total on day 1 of 14 (3% of the plan). The interval runs from −88% to +255%, so the data is consistent with a large loss or a huge win.',
    whyNot:
      'Ship: an +83% lift on 6 vs 11 events is exactly how noise looks. Keep the control: too early to decide anything. Don’t trust: the data is fine, just small.',
    misconception: '“+83% is so big it must be real.” Large early lifts on small counts usually shrink as data arrives.',
    cost: 'Day-one lifts are how teams end up announcing features that don’t move anything.',
    rules: [2],
    evidence: [
      { target: 'arms', callout: '17 conversions in total' },
      { target: 'checks', callout: 'Day 1 of 14' },
    ],
  },
  S5: {
    id: 'S5',
    title: 'One-page checkout',
    shortTitle: 'One-page checkout',
    context: 'An online store tested a single-page checkout. The variant loads a new payment script.',
    hypothesis: 'A one-page checkout increases purchases.',
    primary: {
      name: 'Purchase rate',
      unit: 'purchases',
      direction: 'up',
      control: { users: 9120, conversions: 456 },
      variant: { users: 6400, conversions: 371 },
    },
    checks: { daysRun: 14, daysPlanned: 14, usersPlanned: 15000, configured: [0.5, 0.5] },
    key: 'distrust',
    trap: {
      name: 'A broken split',
      oneLiner: 'If the traffic didn’t split the way you configured it, the result isn’t a comparison any more.',
    },
    why: 'About 1,360 users are “missing” from the variant. A split this far off almost never happens by chance; something is broken. The new payment script may be crashing before exposure is logged, for example. Whoever is missing is probably not random, so the +15.9% can’t be interpreted.',
    whyNot:
      'Ship trusts a broken comparison. Keep the control also interprets the broken result. Keep collecting: more data from a broken assignment is more broken data. Fix the cause and rerun.',
    misconception: '“A 59/41 split is close enough.” With 15,000 users, it’s a near-impossible imbalance by chance.',
    cost: 'A broken split can manufacture a winner out of a bug.',
    rules: [1],
    evidence: [{ target: 'split', callout: 'Traffic didn’t split as configured' }],
  },
  S6: {
    id: 'S6',
    title: 'Bigger Buy button',
    shortTitle: 'Bigger Buy button',
    context:
      'A consumer marketplace enlarged and recoloured the Buy button on product pages. Support has flagged accidental purchases before.',
    hypothesis: 'A bigger Buy button increases orders.',
    primary: {
      name: 'Order rate',
      unit: 'orders',
      direction: 'up',
      control: { users: 5000, conversions: 400 },
      variant: { users: 5000, conversions: 470 },
    },
    guardrail: {
      name: 'Refund rate',
      unit: 'refunds',
      direction: 'down',
      control: { users: 5000, conversions: 50 },
      variant: { users: 5000, conversions: 95 },
      rule: 'Team rule: don’t ship if refunds get clearly worse',
    },
    checks: { daysRun: 14, daysPlanned: 14, usersPlanned: 10000, configured: [0.5, 0.5] },
    key: 'control',
    trap: {
      name: 'The forgotten guardrail',
      oneLiner: 'A win on the headline metric doesn’t ship if something you promised to protect got clearly worse.',
    },
    why: 'The primary metric is clearly up, but the guardrail is clearly worse: its whole interval is on the bad side, and the chance that refunds improved is below 1%. By the team’s own pre-agreed rule, that blocks the launch.',
    whyNot:
      'Ship overrides a guardrail the team agreed in advance. Keep collecting: both results are complete and clear. Don’t trust: nothing is broken.',
    misconception:
      '“Orders are up 17.5%, and refunds are only 1.9%.” Relative to control, refunds nearly doubled. Many of the extra orders may be the accidental ones that get refunded.',
    cost: 'You’d trade a few more orders for nearly twice the refunds and support load.',
    rules: [5],
    evidence: [{ target: 'guardrail', callout: 'Refunds clearly worse' }],
  },
}

/** Fixed measured order (27 §2, corrected 14 Nov: S4 and S6 swapped so no two adjacent results share an answer). Identical in both arms. */
export const MEASURED_ORDER: ScenarioId[] = ['S3', 'S1', 'S5', 'S2', 'S4', 'S6']

export const SCENARIO_SET = 'v1'

/** Landing preview card (27 §9). Not one of the six; never has an inference line. */
export const PREVIEW_SCENARIO = {
  title: 'Annual-plan nudge',
  hypothesis: 'Showing the annual saving at checkout increases annual-plan selection.',
  primary: {
    name: 'Annual-plan rate',
    unit: 'annual',
    direction: 'up' as Direction,
    control: { users: 2000, conversions: 300 },
    variant: { users: 2000, conversions: 330 },
  },
  checks: { daysRun: 14, daysPlanned: 14, usersPlanned: 4000, configured: [0.5, 0.5] as [number, number] },
}
