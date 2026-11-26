# Development validation record

Environment: **Development** · not a finding. Steps and pass conditions: `flagsmith/SETUP.md` §2.
Run on 16–17 Nov 2026 by the build agent in the account owner's signed-in dashboard session, Flagsmith dashboard
2.291.0, app served locally by `vite` with the Development client-side key from the git-ignored `.env`.
No keys, identity, project, organisation, feature or experiment IDs are recorded here.

## Setup (SETUP.md §1)

| Step | Result | Backed by |
|---|---|---|
| Warehouse | **pass** — Flagsmith-managed warehouse receiving events | Environment Settings › Warehouse card: "Last event received: a few seconds ago" |
| Flag | **pass** — `readout_framing`: control `p_value`, one variation `chance_to_win` | Experiment wizard step 1, Variations table |
| Metrics M1–M5 | **pass** — all five created with the exact event, aggregation and "higher is better" | Metrics list: M1 Mean·`readout_score`, M2 Occurrence·`readout_completed`, M3 Mean·`readout_loss_call`, M4 Mean·`readout_near_miss_call`, M5 Occurrence·`readout_rules_copied` |
| Experiment | **pass** (17 Nov 12:15 IST) — "Readout framing v1", hypothesis from `experiment.template.json`, 100% rollout, Control 50% / `chance_to_win` 50%, **M1 primary, increase · M2 not_decrease · M3 increase · M4 not_decrease · M5 increase, each once**. The 2.291.0 console wizard is single-select, so M1 was attached there and M2–M5 through the API (see "M2–M5 attachment" below). | Wizard Review step; `api/attach-2026-11-17T06-45-37-154Z.json` |
| Start | **pass** — status Running, started 16 Nov 2026 (Development only) | Experiments list |

## Event lifecycle (SETUP.md §2)

| # | Check | Result | When (IST) | Backed by |
|---|---|---|---|---|
| V-0 | Connection check page: enrolled, SERVER, events 2xx | **pass** | 16 Nov 23:54 | `/dev/flagsmith-check.html?auto=1`: env `development`, sdk source `SERVER`, gate enrolled in "Readout framing v1", observed outcome `ok`, `POST events API: HTTP 202` |
| V-1/2 | Flag evaluated, enrolled | **pass** (see note 1) | 16 Nov 23:54 | Dev panel: `sdk source: SERVER`, `flag: p_value · variant control · in true`, `attempt: in_progress · control`; the stored attempt holds the variant and an experiment ID |
| V-3 | Both versions seen; inference line matches | **pass** | 17 Nov ~00:00 | Two fresh headless profiles on `/?ref=devval`: one `control` showing "p-value" on all six cards, one `chance_to_win` showing "Chance to beat control" on all six |
| V-4 | No request before Start; exposure on Result 1 | **pass** | 16 Nov 23:54 | Landing `/?ref=devval`: zero requests to any non-local host, no `readout.uid`. After Start: identity request then `/v1/events` ≈ 0.2 s later; Dev panel `202 · $flag_exposure` |
| V-5/6/7 | One identity; four score events 2xx before the flip | **pass** | 16 Nov 23:55 | Dev panel: `202 · readout_score, readout_completed, readout_loss_call, readout_near_miss_call` in one POST before `/readout` rendered; attempt `sent_1 · 6/6 · send1 ok`; payload score 4/6, loss call 0, near-miss 1, matching the six calls made |
| M5 | Rules copy → one `readout_rules_copied`, 2xx | **pass** | 16 Nov 23:56 | One POST, HTTP 202; its `identifier` equals `localStorage['readout.uid']` (compared in the page, not printed); metadata keys `scenarioSet, attemptId, answers, totalSeconds, ref, variantMismatch, send, sdk_version`; `ref` = `devval` |
| Two tabs | One answer per card; one score batch | **pass (automated, local)** | 16 Nov | `npm run check:browser` TT-1…TT-4 (two real pages, one profile). Not repeated live. |
| V-8 | Warehouse lists all six events | **pass** | 17 Nov ~00:00 | Warehouse card: 21 events, 7 unique; the known-event list shows `$flag_exposure`, `readout_score`, `readout_completed`, `readout_loss_call`, `readout_near_miss_call`, `readout_rules_copied` (+ `readout_dev_check` from V-0) |
| V-9 | Synthetic: injected difference visible | **pass** | as of 17 Nov 00:03 | See below |
| F-8 | Duplicates leave Mean/Occurrence unchanged | **pass (Mean)** — first attempt inconclusive by design, decisive re-run passes | as of 17 Nov 00:28 | See below |

### V-9 / F-8 detail — SYNTHETIC — Development — pipeline check only

`scripts/dev-synthetic.mjs --n 120`: 120 identities `synthetic-dev-<run>-NNN`, all enrolled (chance_to_win 67, control 53),
60 duplicate score batches. The experiment already held three labelled `devval` identities (control 4/6 and 1/6,
chance_to_win 1/6), so the exact expected M1 means are mixtures:

| | Expected | Flagsmith showed |
|---|---|---|
| Control exposures | 53 + 2 = 55 | **55** |
| chance_to_win exposures | 67 + 1 = 68 | **68** |
| Control M1 mean | (53 × 0.5 + 5/6) / 55 = 0.497 | **0.50** |
| chance_to_win M1 mean | (67 × 5/6 + 1/6) / 68 = 0.824 | **0.82** |
| Lift | +65.71% | **+65.7%** |

V-9 passes: the injected difference arrives intact and exposures are counted once per identity.

**This run did not settle F-8.** Every duplicate batch repeated the *same* values, so a per-event average would give
a lift between +65.40% and +66.63% depending on how the duplicates split between arms, which also contains +65.7%.

### F-8 decisive re-run — SYNTHETIC — Development — pipeline check only

`dev-synthetic.mjs --f8` (run `c05f31`): pattern A identities send one `readout_score` of **1**; pattern B identities
send **0** three times as three separate POSTs (an identical retried send). Per-identity Mean puts the cohort at 0.5,
per-event Mean at A / (A + 3B) ≈ 0.25.

The run stopped at identity 168 on a network error (`fetch failed`) before printing its counts. It was reconstructed,
not guessed: the dashboard's Identities list shows exactly `…-001` to `…-168` with no gaps, and `--lookup c05f31`
re-read each identity's arm with events switched off (no exposure recorded): chance_to_win A 43 / B 40, control
A 41 / B 44. The script now prints its run id first, logs every identity and survives network errors (`8379544`).

Predictions, over every possible split of the first run's duplicates and with identities 167/168 in or out:

| | Per-identity Mean | Per-event Mean | Flagsmith showed |
|---|---|---|---|
| Control exposures | | | **140** = 55 + 85 (167 arrived) |
| chance_to_win exposures | | | **150** = 68 + 82 (168 never exposed) |
| Control M1 mean | 0.484–0.488 (exact: 68.33 / 140 = 0.488) | 0.297–0.337 | **0.49** |
| chance_to_win M1 mean | 0.656–0.660 (exact: 99 / 150 = 0.660) | 0.440–0.517 | **0.66** |
| Lift | +35.22% | | **+35.2%** |

F-8 passes for Mean: identical repeated score events do not change Flagsmith's result; it averages per identity.
Occurrence (M2, M5) and M3/M4 were read after M2–M5 were attached on 17 Nov; see below.

The "> 99% winner" banner Flagsmith shows on this experiment is the synthetic injection, not a finding.

## M2–M5 attachment and five-metric results — SYNTHETIC data included — Development — pipeline check only

Run by the account owner on 17 Nov 2026, 12:13–12:16 IST, with `scripts/flagsmith-attach-dev-metrics.mjs` (commit
`656491a`, admin key from an environment variable, never printed). Sanitized transcripts in [`api/`](api/) (every ID
masked; keys never recorded):

| Run | File | Requests sent | Outcome |
|---|---|---|---|
| Dry run, stale key in the shell | `attach-dryrun-2026-11-17T06-43-56-190Z.json` | 1 GET | 401 "Valid Master API Key not found"; stopped, nothing changed |
| Dry run, new admin key | `attach-dryrun-2026-11-17T06-44-53-012Z.json` | 6 GET, all 200; no write | Plan: 4 attachments (M2 not_decrease, M3 increase, M4 not_decrease, M5 increase) + 1 refresh; M1 attached and primary |
| Apply | `attach-2026-11-17T06-45-37-154Z.json` | 9 GET (200), 4 POST `…/metrics/` (201), 1 POST `…/results/refresh/` (202) | All five attached once, M1 primary, status still running; results as of 2026-11-17 06:45:50 UTC |

Two earlier apply attempts were interrupted with Ctrl+C at the attached-metrics read (before any write; the script now
times out instead of waiting).

Results, checked against the counts predicted from the events recorded above (per-identity rules of v2.291.0
`results_query.py`). Every row matched exactly:

| Metric | Aggregation · direction | Control n · sum · mean | chance_to_win n · sum · mean | Flagsmith lift (95% CI) |
|---|---|---|---|---|
| M1 `readout_score` | Mean · increase | 140 · 68.33 · 0.488 | 150 · 99 · 0.660 | +35.2% (+12.9% to +57.5%) |
| M2 `readout_completed` | Occurrence · not_decrease | 140 · 55 · 0.393 | 150 · 68 · 0.453 | +15.4% (−16.0% to +46.7%) |
| M3 `readout_loss_call` | Mean · increase | 140 · 0 · 0 | 150 · 67 · 0.447 | not computed (control has no variance) |
| M4 `readout_near_miss_call` | Mean · not_decrease | 140 · 54 · 0.386 | 150 · 67 · 0.447 | +15.8% (−16.1% to +47.7%) |
| M5 `readout_rules_copied` | Occurrence · increase | 140 · 1 · 0.007 | 150 · 0 · 0 | not computed |

What this settles:
- **Events sent before a metric was attached are included.** All of M2–M5's data predates their attachment.
- **Occurrence counts once per identity (F-8 for Occurrence).** The V-9 run sent `readout_completed` twice for 60
  identities; M2's sums equal the number of identities that finished (55 / 68), not the number of events.
- **M3 and M4 carry their values unchanged.** Their sums equal the 0/1 values the identities sent.
- **Arm attribution is correct.** Every metric reports exactly the two arms, with the same exposure counts as M1.
- **SRM was not checked by Flagsmith.** It returned `srm_p_value: null`; see "Why Flagsmith reports no SRM p-value" below.
  SRM validation has **not** passed.

These numbers are synthetic and labelled `devval` plays: a pipeline check, never a finding.

## Why Flagsmith reports no SRM p-value (investigated 17 Nov)

Read from Flagsmith's source at tag v2.291.0, `api/experimentation/services.py`:
- `build_results_summary` computes `srm_p_value` only when `_expected_variant_shares(experiment)` is non-empty and at
  least `SRM_MIN_TOTAL_IDENTITIES` (100) identities are exposed. 290 were exposed, so the count is not the reason.
- `_expected_variant_shares` takes the split from the flag's **environment default** multivariate allocations, not
  from the experiment's rollout (the source says so: "TODO: read the split from the percentage-split segment
  override feature state once that's implemented"). Control gets the unallocated remainder.
- By design (EXPERIMENT.md §2), `chance_to_win` has weight **0** in the environment default, and the experiment's
  50/50 lives in its segment override (the Development summary shows exactly one segment override). The expected shares
  are therefore `chance_to_win 0, control 1`, and `stats.srm_p_value` returns `None` whenever any expected share is
  ≤ 0.

So with this flag set-up, Flagsmith 2.291.0 **never** computes SRM for this experiment, in Development or Production,
and never shows an SRM warning. This is not a fault in the app or the script.

For reference only (not a Flagsmith check, and on synthetic data): the same chi-squared test Flagsmith uses, on
140 / 150 against 50/50, gives χ² = 0.345, p = 0.56. That is not an SRM validation.

**Consequence for Production (resolved 17 Nov):** EXPERIMENT.md §9 level 1 and §10 rule 1, README §"Decision rule"
("not read at all while Flagsmith shows an SRM warning") relied on a warning that cannot appear. Resolved by
pre-registering our own check, `scripts/srm.mjs` (the same chi-squared on Flagsmith's exposure counts, warning at
p < 0.001; EXPERIMENT.md §10 rule 1, amended before any Production data). The environment default is left unchanged,
because changing it would also change what unmeasured players see (EXPERIMENT.md §14).

## Pre-release audit (17 Nov 2026, after the experiment was ended)

| Check | Result | Backed by |
|---|---|---|
| Development experiment Completed | **pass** — status Completed, started 16 Nov, ended 17 Nov; primary metric "Readout score (unfinished = 0)" | Dashboard › Experiments (read only, 17 Nov ~12:45 IST); results "as of 17 Nov 07:10 UTC" |
| Five metrics attached once, M1 primary, after ending | **pass** — status completed; M1 increase (primary), M2 not_decrease, M3 increase, M4 not_decrease, M5 increase, each once. 6 GET requests, all 200, no write | `api/attach-audit-2026-11-17T10-46-38-924Z.json` (owner's run, 16:16 IST) |
| Final results saved | **pass** — final results (`is_final: true`, as of 17 Nov 07:10:19 UTC) identical to the pre-end results: all 10 metric × arm rows match the prediction; `srm_p_value` null | same file |
| Production untouched | **pass** — no experiments, no metrics, 0 segment overrides, 0 identity overrides, one feature; only Flagsmith's auto-created example identity | Dashboard › Production (read only) |
| Frozen files | All 18 unchanged since `3c2a96e`, the commit Development was validated against. Widened to 33 on 17 Nov: `Site.tsx`, `study.ts`, `main.tsx`, `App.tsx`; the M5 path below; the analysis plan (`EXPERIMENT.md`, `outcomes.ts`, `scripts/srm.mjs`) and the guards (`check-frozen.mjs`, `ci.yml`). Every added source file is unchanged since `3c2a96e`; a test keeps the set closed under local imports | `git log` per file; `src/freeze.test.ts` |

### M5 event path (traced 17 Nov)

| Step | File | Frozen | What it decides |
|---|---|---|---|
| A "Copy" button on `/rules`, `/team`, or the summary `/readout/summary` | `src/routes/Rules.tsx`, `Team.tsx`, `Readout.tsx` | yes (added 17 Nov; unchanged since `3c2a96e`) | Whether a copy is wired to M5: `onCopied={() => void trackRulesCopied()}` |
| The copied text | `src/content/rules.ts` (`rulesMarkdown`), with `team.ts`, `recruitment.ts` imported by those pages | yes (added 17 Nov; unchanged) | What is copied; not the event |
| Clipboard write; `onCopied` only on success | `src/components/site/Site.tsx` (`CopyButton`, `copyText`) | yes | Whether a successful copy triggers M5 |
| Once per identity, only after the score events were sent; starts the SDK for the same identity if needed | `src/flagsmith/measurement.ts` (`trackRulesCopied`, `sendRulesCopied`) | yes | Whether M5 is generated |
| Payload: `readout_rules_copied`, identifier = the attempt's uid, metadata = the score batch's metadata + `send` | `src/flagsmith/measurement.ts` (`sendM5`) | yes | The payload |
| Pending/ok record, cross-tab lock, one re-send on a later visit | `measurement.ts`, `src/run/attemptStore.ts`, `src/run/StudyContext.tsx` (`m5Pending`) | yes | Delivery and de-duplication |
| SDK init and send | `src/flagsmith/client.ts`, `deliveryMonitor.ts`, the lockfile | yes | Transport |

Validated live at `3c2a96e` code (M5 row above: one POST, 202, identifier = the stored uid), and in Flagsmith (M5
control 1 / chance_to_win 0, matching the one copy). No file on the path changed since, so no re-run was needed.

The "> 99% winner" banner and "+35.2%" on the ended experiment are the injected synthetic difference. **SYNTHETIC —
Development — pipeline check only. Not a finding about players.**

## Notes

1. The Dev panel's `gate:` line reads `—` on the enrolled path: `StudyContext` keeps the gate result only when Start
   routes to practice. Enrolment is shown by the `flag` and `attempt` lines instead. Display only; no effect on
   assignment or events.
2. The browser pane's Rules copy wrote the Rules text to the operator's clipboard once (expected behaviour).

Automated, local, no Flagsmith contact (re-run before tagging): `npm run check:all`.
