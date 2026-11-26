/**
 * How the study's result will be reported, written before any data exists (upgrade B; 34 §3.2–3.3, 35 §8, 30 §4).
 * Read in this order on Production totals only; the first outcome that applies is the one reported. It is the Readout
 * Rules applied to Readout itself, so each outcome names the rule it comes from.
 *
 * No numbers here: they come from the Flagsmith console at the final refresh, with the as-of time.
 */
export type Outcome = { id: string; rule: number; when: string; decision: string; wording: string }

export const OUTCOMES: Outcome[] = [
  {
    id: 'srm',
    rule: 1,
    when: 'The sample-ratio check on Flagsmith’s exposure counts warns (p < 0.001).',
    decision: 'No result is interpreted.',
    wording:
      'Traffic didn’t split 50/50 as configured (sample-ratio check, p < 0.001). By rule one, we don’t interpret these results; we report what we checked and what we found.',
  },
  {
    id: 'collecting',
    rule: 2,
    when: 'Either version is still “collecting data” (fewer than 50 players), or fewer than 100 players in total.',
    decision: 'No result is reported.',
    wording:
      'Not enough players yet for Flagsmith to show a result, so we don’t either. We report how many played and how many a readable result needs.',
  },
  {
    id: 'guardrail',
    rule: 5,
    when: 'A guardrail (finishing the run, or the right call on the promising-but-unfinished result) is losing, or its whole interval is below zero.',
    decision: 'Keep the p-value version, whatever the main score shows.',
    wording: 'We name the guardrail that got worse and give its interval.',
  },
  {
    id: 'p-wins',
    rule: 3,
    when: 'The chance that the new version beats the old is below 5%.',
    decision: 'Keep the p-value version.',
    wording: 'The p-value version did better. We give the lift and its interval.',
  },
  {
    id: 'inconclusive',
    rule: 4,
    when: 'Anything between 5% and 95%. At a pilot’s size, this is the most likely outcome.',
    decision: 'Inconclusive: keep the control.',
    wording:
      'This pilot can’t tell the two versions apart yet. We give the lift, the interval, the players per version, and how many players a follow-up would need.',
  },
  {
    id: 'chance-wins',
    rule: 6,
    when: 'The chance that the new version beats the old is above 95%, and no guardrail got worse.',
    decision: 'Roll out the new version with the same Flagsmith flag.',
    wording:
      'Winning at Flagsmith’s 95% bar, which is roughly a two-sided p below 0.10. We also say whether it clears the stricter 97.5% bar, and report every guardrail without calling it “safe”.',
  },
]

/** Words never used about the result, whatever it shows (35 §8, 34 §3.2). */
export const NEVER_SAY = ['proven', 'users prefer', 'safe', 'no impact'] as const
