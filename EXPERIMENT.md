# Readout framing v1: pre-registration

This is the plan for Readout's experiment, written and committed **before** the Production experiment starts. The
README gives the commit hash it was frozen at. Nothing below may change once Production starts; anything learned later
goes in the README as a dated note, never as an edit here.

It is the final form of the planning documents (12 "Final Experiment Specification", with the corrections of 33
C-1…C-19 and 34 §3–§4). Where this file and the code disagree, the code's tests are the authority on what is sent, and
this file is the authority on how it is read.

**Amendments before Production** (each dated, each before any Production data; none changes a metric, the arms, the
allocation or the decision thresholds):
- 17 Nov 2026: §10 rule 1 names the sample-ratio check we run (`scripts/srm.mjs`, Flagsmith's own formula), because
  Flagsmith 2.291.0 never computes one for this flag set-up. §13 lists the 33 frozen files the freeze check enforces
  (it listed 9). Added on 17 Nov: four files imported by frozen code or mounting the app, the six files on the M5
  path, and the analysis plan with its guards. Every added source file is unchanged since the Development-validated
  commit.

## 1. Question and hypotheses

**Question.** When developers read an A/B test result, do they make more defensible calls when the inference is shown
as *chance to beat control* (Flagsmith's framing) than as a *p-value*?

**Primary hypothesis.** Showing "Chance to beat control" instead of "p-value" increases the mean measured score per
exposed player, without reducing completion.

**Directional sub-hypotheses.**

- **H2.** Chance framing increases correct calls on the significant loss (S2), because it states the direction.
- **H3.** Chance framing may *reduce* correct calls on the promising-but-inconclusive result (S3), because "86%" sounds
  like a win. This is a guardrail: it should not decrease.

## 2. Flag

| Field | Value |
|---|---|
| Key | `readout_framing` |
| Type | Multivariate, string value |
| Control | value `p_value`, enabled; variant key `control` (reserved by Flagsmith) |
| Treatment | value `chance_to_win`, key `chance_to_win`, weight 0 (the experiment sets the allocation) |
| How the app branches | On `flag.variant` (`control` / `chance_to_win`), never on the display value |

After the experiment ends, the outcome is rolled out with this same flag.

## 3. Allocation

100% of identities, 50 / 50, deterministic Flagsmith bucketing per identity and environment. No segments, no targeting,
**no identity overrides** in the experiment environment.

## 4. What differs between the arms

Every result card is identical in both arms except the text of one line, the inference line. Same position, box,
font, weight and colour. This is enforced three ways: a card-level test, a page-level test that the whole measured page
is byte-identical once that line's text is removed (`src/routes/arm-invariance.test.tsx`), and a real-browser layout
check at four widths (`npm run check:arms`).

| | Control | Treatment |
|---|---|---|
| Inference line | `p-value · 0.27` | `Chance to beat control · 86%` |
| Everything else | identical | identical |

- p-value: 2 significant figures, or `< 0.001`. Chance: whole percent, with `< 1%` and `> 99%` at the extremes.
- One model, two presentations of it. Both lines come from the same z, computed with a port of Flagsmith's own
  `stats.py`. The p-value is our two-sided transform of that z; Readout does not compare two statistical engines.
- On S6 each metric row has its own line. For refund rate (lower is better) the treatment shows the chance that the
  change is an improvement, Flagsmith's convention; the label stays "Chance to beat control".

## 5. The six results and the measured order

All six results are fictional and labelled `FICTIONAL TEST`. Their statistics were reproduced from Flagsmith's
`stats.py` and an independent derivation (largest difference 4.4 × 10⁻¹⁶). The defensible call for each is derived in
code from the Readout Rules, not hand-written.

| Order | Result | Defensible call |
|---|---|---|
| 1 | S3 Dark mode by default | Keep collecting |
| 2 | S1 Onboarding checklist | Ship the variant |
| 3 | S5 One-page checkout | Don't trust these results (sample-ratio mismatch) |
| 4 | S2 Shorter pricing page | Keep the control (significant loss) |
| 5 | S4 AI writing suggestions | Keep collecting |
| 6 | S6 Bigger Buy button | Keep the control (guardrail) |

The order is fixed and identical in both arms. It was corrected once before any pre-registration (33 C-19): the
original order put two "Keep the control" results next to each other.

S5's counts (9,120 vs 6,400) are Flagsmith's own sample-ratio-mismatch example from its Statistics Glossary, used
deliberately as a recognisable teaching case.

## 6. Metrics

Created in each environment, then attached to the experiment.

| # | Metric | Event | Aggregation | Metric direction | Expected direction on the experiment | Value sent |
|---|---|---|---|---|---|---|
| M1 | Readout score (unfinished = 0) | `readout_score` | Mean | up | **increase** (primary) | correct ÷ 6 |
| M2 | Finished measured run | `readout_completed` | Occurrence | up | **not_decrease** (guardrail) | none |
| M3 | Correct call on the significant loss | `readout_loss_call` | Mean | up | increase (secondary) | 1 if S2 = Keep the control, else 0 |
| M4 | Correct call on the promising-but-inconclusive result | `readout_near_miss_call` | Mean | up | **not_decrease** (guardrail) | 1 if S3 = Keep collecting, else 0 |
| M5 | Copied the Readout Rules | `readout_rules_copied` | Occurrence | up | increase (**exploratory**) | none |

- Accepted values, checked against Flagsmith's source and docs (research 03, 02): a metric's `direction` is `up`,
  `down` or `informational`; an experiment metric's `expected_direction` is `increase`, `decrease`, `not_increase` or
  `not_decrease`. The exact JSON for each metric and the experiment is in [`flagsmith/`](flagsmith/).
- **M5 is `increase`, exploratory.** The question it asks is whether one framing makes people more likely to take the
  Rules away, so the expected direction is up. It is not a guardrail and no decision depends on it (§10); it is
  reported as a rate per arm with Flagsmith's interval, labelled exploratory. (Earlier drafts said `not_decrease`;
  this is the value pre-registered before any Production start.)

- M1–M4 are sent together, once per identity, when the first measured run is finished. M5 is sent at most once per
  identity, on the first successful Rules copy after M1–M4 were sent. Practice runs send nothing.
- Metadata on every score event: `scenarioSet`, `attemptId`, `answers` (in play order), `totalSeconds`, `ref` (the
  shared-link tag, if any), `variantMismatch`, `send`; the SDK adds `sdk_version`. No name, email or account; never used as an
  identity. The list is enforced by a test against what `measurement.ts` sends.
- **Delivery.** A batch is re-sent once, on a later visit, only if its POST was *observed* to fail on every SDK
  attempt. An unknown outcome (for example the tab closed mid-send) is never re-sent, so duplicates cannot inflate the
  Mean metrics. Flagsmith does not de-duplicate metric events; Mean is the per-identity average of that identity's
  values (0 for an exposed identity with none), so a re-send of identical values cannot move it. (From Flagsmith's
  results query, read in planning doc 10; to be confirmed live in Development, check F-8.)
- **M5 delivery.** Recorded as pending before it is tracked, then as the POST's observed outcome. Because M5 is an
  Occurrence metric (1 if the identity has any such event), a copy that failed **or** was never confirmed is re-sent
  once on a later visit; a duplicate cannot change it. Never a third send.
- **One attempt per browser, across tabs.** Start (ID, gate, attempt) and every send claim run under one Web Lock
  (`navigator.locks`). A browser without the Web Locks API is offered practice only.

Metric bodies for `POST experiment-metrics/`:

```json
{"name":"Readout score (unfinished = 0)","aggregation":"mean","direction":"up","definition":{"version":1,"event":"readout_score"}}
{"name":"Finished measured run","aggregation":"occurrence","direction":"up","definition":{"version":1,"event":"readout_completed"}}
{"name":"Correct call on significant loss","aggregation":"mean","direction":"up","definition":{"version":1,"event":"readout_loss_call"}}
{"name":"Correct call on promising-but-inconclusive result","aggregation":"mean","direction":"up","definition":{"version":1,"event":"readout_near_miss_call"}}
{"name":"Copied the Readout Rules","aggregation":"occurrence","direction":"up","definition":{"version":1,"event":"readout_rules_copied"}}
```

## 7. Exposure, identity and consent

| Item | Rule |
|---|---|
| Consent | Nothing reaches Flagsmith before the player presses **Start the challenge**. The consent text sits directly above it, and "Practise without being measured" is offered beside it. |
| Identity | On Start, a random ID (`crypto.randomUUID()`) is stored in this browser as `readout.uid` and passed to the SDK at init. It is a browser identity, not a person. |
| Gate | Measured only if flags come from the server, the flag exists and is enabled, `experiment.inExperiment === true`, and the variant is known, all within 4 s. Otherwise: practice, labelled, nothing sent. |
| Exposure | `useExperiment('readout_framing')` in `MeasuredSession`, the only call site, mounted while a measured run is on screen. It fires on result 1 and again on a resumed run (Flagsmith keeps the first exposure per identity), then flushes at once. |
| One attempt | A measured attempt can only start when no attempt is stored in this browser. A corrupt record becomes void, never a second attempt. The attempt is saved before the exposure, and the scores are saved before they are sent. |
| Environments | **Development:** our testing, and a labelled synthetic pipeline check. **Production:** real players only. Never in Production: team plays, scripts, overrides, or any traffic before 26 Nov 2026 08:00 IST. |

## 8. Sample size

Targets (33 C-1, C-2): **120–150 exposed identities minimum, 300 stretch.** Three thresholds are kept apart: Flagsmith's
display floor (50 per arm and 5 conversions), the sample-ratio check (100 or more in total, warning at p < 0.001; run by
us with Flagsmith's formula, §10 rule 1), and adequate power, below.

Chance that both arms reach the 50-per-arm display floor with a 50 / 50 split: 8% at 100 exposed, 71% at 110, 94.5% at
120, 99.4% at 130.

Minimum detectable effect on M1 (one-sided 95%, which is Flagsmith's "winning" bar, 80% power, SD 0.28 assumed):

| Per arm | MDE (score points out of 100) | Relative, if the baseline is 0.55 (assumed) |
|---|---|---|
| 50 | 13.9 | ~25% |
| 60 | 12.7 | ~23% |
| 75 | 11.4 | ~21% |
| 100 | 9.8 | ~18% |
| 150 | 8.0 | ~15% |

**The realistic outcome at these sizes is an inconclusive pilot**, and that is pre-declared here. The SD and baseline
are assumptions, labelled as such.

## 9. Guardrails: what we may and may not claim

`not_decrease` is the expected direction that makes a metric a guardrail in Flagsmith. It is **not** a formal
non-inferiority test. Practical margins, pre-registered as judgement calls:

| Guardrail | Practically important decline (δ) |
|---|---|
| M2 finished measured run | −10% relative |
| M4 correct call on S3 | −20% relative |

Each guardrail is reported in one of four categories, using Flagsmith's 95% credible interval `[lo, hi]` for the
relative lift, applied in order:

| # | Category | Condition | We may say | We must not say |
|---|---|---|---|---|
| 1 | Insufficient evidence | Collecting data, a sample-ratio warning, or an arm below the floors | "Not enough data to assess it." | anything about harm or its absence |
| 2 | Evidence of harm | `hi < 0` | "It got worse: lift X, interval lo to hi." ("Meaningfully" only if the estimate ≤ −δ.) | "small", unless `lo > −δ` |
| 3 | Important decline ruled out | `lo > −δ` | "A decline larger than δ is ruled out at 95%." | "proven no effect" |
| 4 | No detected harm, not ruled out | interval contains 0 and `lo ≤ −δ` | "No harm detected, but a decline of up to \|lo\| cannot be ruled out." | "safe", "no impact", "guardrail passed" |

Expected 95% half-widths with no true effect: M2 ±18% / ±16% / ±11% and M4 ±36% / ±32% / ±23% relative, at 60 / 75 /
150 per arm. Ruling out the margins needs about 190 per arm for a 50% chance and 390 for 80%. **The realistic guardrail
outcome is category 4**, and that is pre-declared too.

## 10. Decision rule

Read on **Production only**, at the final refresh. The first row that applies is the decision.

| Order | Condition | Decision | Required wording |
|---|---|---|---|
| 1 | A sample-ratio warning from the pre-registered check (below) | No result is interpreted | What we checked, and what we found |
| 2 | Either arm still "collecting data" (under 50 players), or under 100 players in total | No conclusion | The Exposures panel and the counts so far |
| 3 | Any guardrail losing in Flagsmith (chance < 5%), or in category 2 | **Keep `p_value`**, whatever the primary shows | Name the guardrail and its interval |
| 4 | Primary (M1) chance < 5% | Keep `p_value` | "The p-value framing did better", with the interval |
| 5 | Primary chance between 5% and 95% | **Inconclusive. Keep control.** | Lift, interval, N per arm, and the sample a follow-up would need (§8) |
| 6 | Primary chance > 95% | **Roll out `chance_to_win`** with the flag | "Winning at Flagsmith's 95% bar (≈ two-sided p < 0.10)"; say whether it also clears 97.5%; every guardrail with its category; no "safe" claims |

**The sample-ratio check (rule 1; amended 17 Nov 2026, before any Production data).** At the final refresh, the
exposure counts per arm from Flagsmith's results page go into `node scripts/srm.mjs --control <n> --chance-to-win <n>`:
Pearson χ² against the configured 50 / 50, one degree of freedom, exactly Flagsmith's own `stats.srm_p_value`; not
assessed under 100 in total (rule 2 then applies); a warning at p < 0.001. We run it because Flagsmith 2.291.0 takes
SRM's expected split from the flag's environment default, where `chance_to_win` has weight 0 by design (§2), so it never
computes `srm_p_value` or shows a warning for this experiment (found in Development; evidence/development/validation.md).
Changing that default instead would change what unmeasured players see (§14), so it is left as it is.

The same six outcomes, with the exact wording each one will be reported in, are on the app's About page
(`src/content/outcomes.ts`), written before any data.

- The primary is never called "proven"; the result is a pilot at the stated sample.
- M3 is reported with its interval, never as the headline. M5 is exploratory.
- Accuracy among finishers (M1 ÷ M2 per arm) may appear only as a derived, exploratory point estimate.
- Every number quoted names its environment and the time it was read. Development data is never quoted as a finding;
  synthetic Development data is captioned "SYNTHETIC — Development environment — pipeline check only".

## 11. Known limitations

- The ID belongs to this browser. Clearing site data, a private window, another browser or another device creates a
  new ID, which could be measured again. Accounts would prevent this; Readout deliberately has none.
- Ad-blockers that block `events.api.flagsmith.com` stop measurement silently for that player.
- Players are self-selected developers reached through our own channels; the result describes them, not developers in
  general.
- The study cannot link an ID to a person, and never tries to.

## 12. Impact evidence (descriptive, not a result)

Separately from the experiment, `npm run impact` reads a real exported event file and counts, **with both arms
pooled**: the defensible call per result and the most common other call (where the traps caught people), how often
each rule was broken, the app's own mistake patterns, and Rules copies among finishers.

- It is descriptive and never per arm. The arm comparison is only the Flagsmith experiment and §10.
- One player per `attemptId`; a re-sent batch counts once; anything unreadable is counted as rejected, never repaired.
- Every report states its environment, the as-of time and the export's source. A Production file containing any
  Development check event is refused whole. Development output is labelled as not a finding.
- How the export is obtained from Flagsmith has not yet been verified; if no export of event metadata is available,
  this section reports nothing, and only the console's M1–M5 are quoted.

## 13. The measured-v1 freeze

The files that decide what a measured player is assigned, sees, answers and sends are frozen at the git tag
`measured-v1`. The list is `FROZEN` in `scripts/check-frozen.mjs` (33 entries, widened 16 and 17 Nov):
- assignment, flags, exposure, identity: `src/flagsmith/client.ts`, `src/flagsmith/MeasuredSession.tsx`,
  `src/run/attemptStore.ts`;
- attempts and delivery: `src/run/controller.ts`, `src/run/StudyContext.tsx`, `src/flagsmith/deliveryMonitor.ts`,
  `src/flagsmith/measurement.ts` (event names, values, metadata);
- scoring and the answer key: `src/content/scoring.ts`, `src/content/analysis.ts`, `src/content/scenarios.v1.ts`;
- what is shown: `src/stats/flagsmithStats.ts`, `src/stats/format.ts`, `src/components/result/ResultCard.tsx`,
  `src/components/decision/DecisionBar.tsx`, `src/routes/Run.tsx`, `src/components/ui/classes.ts`,
  `src/styles/index.css`;
- what those import, and the entry points: `src/components/site/Site.tsx`, `src/content/study.ts`, `src/main.tsx`
  (no StrictMode, so an exposure is never recorded twice), `src/app/App.tsx`. A test keeps the set closed under local
  imports;
- M5: the three pages that wire the Rules copy to the event (`src/routes/Rules.tsx`, `src/routes/Team.tsx`,
  `src/routes/Readout.tsx`) and the content they import (`src/content/rules.ts`, `team.ts`, `recruitment.ts`). The
  copy button (`Site.tsx`) and the event itself (`measurement.ts`) are already above;
- the analysis plan and its guards: this file, the pre-written outcome wording (`src/content/outcomes.ts`), the SRM
  check and its threshold (`scripts/srm.mjs`), the freeze checker itself and the CI workflow that runs it on every push;
- `package-lock.json`, so the SDK version that sends the events cannot change.
`analysis.ts` and `scoring.ts` are additions to the planning list (33 §6): they compute what the others measure.

- `npm run check:frozen` fails on any difference from the tag (committed, uncommitted or untracked).
- `npm run check:release` also fails if the tag is missing; it is gate G-4 before the Production start.
- When Production starts, the tag's commit is written to `measured-v1.sha` and committed; from then on a moved tag
  fails the check too.

## 14. After the experiment

The outcome is rolled out by changing the flag's environment value, not the code. A player who presses Start when no
experiment is running for them is not measured; the flag value Flagsmith returns then sets the framing their practice
run and the presenter view open with. Practice, the team guide and the presenter opened directly still contact no one,
and open on the p-value framing. A measured attempt in progress keeps the arm it was assigned.
