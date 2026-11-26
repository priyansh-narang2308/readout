/** The Readout Rules (25 §8): data trust first, then direction, then certainty. */

export type Rule = { n: number; title: string; body: string }

export const RULES: Rule[] = [
  {
    n: 1,
    title: 'Can we trust the data?',
    body: 'Check that traffic split the way it was configured. A sample-ratio mismatch (for example 59/41 on a 50/50 test) means assignment or logging is broken. Don’t interpret; find the cause.',
  },
  {
    n: 2,
    title: 'Did it reach the planned sample?',
    body: 'Decide the sample size before launch and don’t call the test before you get there. Big lifts on small numbers are usually noise.',
  },
  {
    n: 3,
    title: 'Which way did it move?',
    body: 'Read the direction of the primary metric before any significance number. “Significant” can mean significantly worse.',
  },
  {
    n: 4,
    title: 'Does the 95% interval cross zero?',
    body: 'If it does, you don’t yet know the direction of the effect.',
  },
  {
    n: 5,
    title: 'Did any guardrail get clearly worse?',
    body: 'If a guardrail’s interval sits entirely on the bad side, don’t ship, however good the headline looks.',
  },
  {
    n: 6,
    title: 'Only then: does it clear the bar you wrote down in advance?',
    body: 'Know what your bar means. Flagsmith’s “winning” threshold of 95% chance to beat control is roughly a two-sided p < 0.10. A two-sided p < 0.05 is roughly 97.5%.',
  },
]

export const CALLS_LINE: { when: string; call: string }[] = [
  { when: 'fails 1', call: 'don’t trust these results' },
  { when: 'fails 2', call: 'keep collecting' },
  { when: 'fails 3 or 5', call: 'keep the control' },
  { when: 'crosses zero at full sample', call: 'keep the control' },
  { when: 'passes all six', call: 'ship' },
]

/** GitHub-flavoured Markdown checklist copied by "Copy as Markdown". */
export function rulesMarkdown(): string {
  const lines = [
    '### The Readout Rules',
    'Use these, in order, before anyone says "ship".',
    '',
    ...RULES.map((r) => `- [ ] **${r.n}. ${r.title}** ${r.body}`),
    '',
    `Calls: ${CALLS_LINE.map((c) => `${c.when} → **${c.call}**`).join(' · ')}`,
    '',
    '_From Readout, the experiment-decision training lab._',
  ]
  return lines.join('\n')
}

export const REVIEW_TEMPLATE = `## Experiment review — [experiment name]
- Flag / variants:
- Hypothesis (written before launch):
- Primary metric and direction:
- Guardrails and their "clearly worse" line:
- Planned sample and run length (written before launch):
- Bar for shipping (written before launch):

### Readout
- [ ] 1. Split matches configuration (SRM check):
- [ ] 2. Planned sample reached:
- [ ] 3. Direction of primary metric:
- [ ] 4. 95% interval for the lift (crosses zero?):
- [ ] 5. Guardrails (any clearly worse?):
- [ ] 6. Clears the pre-agreed bar?

**Call:** Ship / Keep control / Keep collecting / Don't trust
**Why, in one sentence:**
**Results link and as-of time:**
`

export const TRAPS: { name: string; oneLiner: string; rule: number }[] = [
  { name: 'Reading significant as good', oneLiner: 'A tiny p-value can mean significantly worse.', rule: 3 },
  { name: 'Calling it early', oneLiner: 'A promising number before the planned sample is noise you haven’t finished measuring.', rule: 2 },
  { name: 'Big lift, tiny numbers', oneLiner: 'The bigger the lift on a small sample, the more suspicious you should be.', rule: 2 },
  { name: 'A broken split', oneLiner: 'If traffic didn’t split as configured, the result isn’t a comparison.', rule: 1 },
  { name: 'The forgotten guardrail', oneLiner: 'A headline win doesn’t ship if something you protect got clearly worse.', rule: 5 },
  { name: 'Over-caution', oneLiner: 'A clean, complete, clearly positive result has a cost when left unshipped.', rule: 6 },
]

/**
 * Which Rule to apply next time for each mistake pattern on the personal readout (scoring.patterns ids). It joins
 * the report to the checklist the player takes away; a test checks every pattern has one.
 */
export const PATTERN_RULES: Record<string, number> = {
  'significant-good': 3,
  'broken-split': 1,
  guardrail: 5,
  'early-repeated': 2,
  early: 2,
  'waiting-loss': 3,
  'over-caution': 6,
  'distrust-clean': 1,
}
