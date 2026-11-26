# Flagsmith setup and validation (run by the account owner)

Everything Readout needs in Flagsmith, in order, with the pass condition for each step. Only the **account owner**
signs in and clicks. Admin, organisation and server-side keys never leave the owner's machine and never enter this
repository; the app only ever holds a client-side environment key, in the git-ignored `.env`.

**State on 16 Nov 2026 (from the approvals log, research 36):** project `readout` exists with Development and
Production (A-2 done); the flag `readout_framing` exists with `p_value` and the variation `chance_to_win` at 0%.
Not yet done: warehouse confirmed **Connected** in both (A-3), metrics M1–M5 and the experiments (A-4), the
Development start, V-1 to V-9, the synthetic run (A-10).

**Update 17 Nov 2026:** Development §1 and §2 were run in the owner's signed-in session; results, including what
did not pass, are in `evidence/development/validation.md`. Production is untouched.

Files used below, all checked by `src/flagsmith/setup-config.test.ts` against the events the app sends and against
EXPERIMENT.md §6:

| File | What |
|---|---|
| `m1.json` … `m5.json` | The five metric bodies (name, aggregation, `direction: "up"`, event) |
| `experiment.template.json` | The experiment body; replace the `<…_ID>` strings with the numbers from the earlier steps |

Accepted values (checked against Flagsmith's source and docs, research 03 and 02): metric `aggregation` is
`occurrence | count | sum | mean`; metric `direction` is `up | down | informational`; an experiment metric's
`expected_direction` is `increase | decrease | not_increase | not_decrease`.

## 1. Development: set up (A-3, A-4)

Console route (no Flagsmith CLI is installed on the build machine; the API route in 12 §7 works equally well).

1. **Warehouse.** Development › Environment Settings › Warehouse: the Flagsmith-managed warehouse card says
   **Connected**. *Pass:* Connected.
2. **Flag.** Features › `readout_framing`: value `p_value`, enabled; one variation `chance_to_win`.
   *Pass:* exactly these two values (the app treats any other value as "not enrolled").
3. **Metrics.** Experiments › Metrics › Create, five times, copying each field from `m1.json` … `m5.json`:

   | # | Name | Event (exact) | Aggregation | Direction |
   |---|---|---|---|---|
   | M1 | Readout score (unfinished = 0) | `readout_score` | Mean | Up |
   | M2 | Finished measured run | `readout_completed` | Occurrence | Up |
   | M3 | Correct call on significant loss | `readout_loss_call` | Mean | Up |
   | M4 | Correct call on promising-but-inconclusive result | `readout_near_miss_call` | Mean | Up |
   | M5 | Copied the Readout Rules | `readout_rules_copied` | Occurrence | Up |

4. **Experiment.** Create "Readout framing v1" on `readout_framing`, hypothesis from `experiment.template.json`,
   rollout **100%**, `chance_to_win` **50%** (control takes the other 50%), metrics:
   M1 **increase** (primary) · M2 **not_decrease** (guardrail) · M3 **increase** (secondary) · M4 **not_decrease**
   (guardrail) · M5 **increase** (exploratory). *Pass:* the experiment page lists exactly these five, with these
   directions.
   **Dashboard 2.291.0 limit (found 17 Nov):** the console wizard takes one metric only (the primary, M1 increase)
   and a running experiment has no add-metric control. M2–M5 are attached by the owner with
   `scripts/flagsmith-attach-dev-metrics.mjs` (`--dry-run` first; done in Development on 17 Nov). For Production, the
   same nested endpoint is used with the same directions, before Start (G-2).
5. **Start** the Development experiment (the console wizard starts it on launch; that is fine in Development only).

## 2. Development: validate the full event lifecycle (V-1 to V-9)

Put the **Development** client-side key in `.env` as `VITE_FLAGSMITH_ENV_KEY`, with `VITE_FLAGSMITH_ENV_NAME=development`.
Run `npm run dev`. Use a fresh browser profile per run (a private window is enough). Label every Development play with
the link tag `?ref=devval`, so it is identifiable in any export and is never confused with a player.

| # | Step | Pass |
|---|---|---|
| V-0 | `http://localhost:5173/dev/flagsmith-check.html?auto=1` (identity `dev-check-<random>`) | `gate: enrolled`, `sdk source: SERVER`, observed outcome `ok`, `POST events API: HTTP 2xx` |
| V-1, V-2 | Open `/?ref=devval`, press Start; the Dev debug panel | `gate: enrolled`, variant and experiment id shown |
| V-3 | Repeat in fresh profiles until both versions have been seen | The inference line matches the variant every time |
| V-4 | DevTools › Network on the landing page, then on Result 1 | No `events.api.flagsmith.com` request before Start; `$flag_exposure` POSTed within 1 s of Result 1 |
| V-5, V-6, V-7 | Finish all six; inspect the `/v1/events` POST | 2xx before the flip (or within 3 s); the four score events with the same `identifier` as `localStorage['readout.uid']` and the metadata in EXPERIMENT.md §6 |
| M5 | Copy the Rules on the summary | One `readout_rules_copied` POST, 2xx |
| Two tabs | Open a second tab of the same profile mid-run, lock the same card in both | One answer stored, the other tab says it moved on; one score batch (also checked automatically by `npm run check:browser`, TT-1…TT-4) |
| V-8 | Development › Warehouse card, after a while | Lists `$flag_exposure`, `readout_score`, `readout_completed`, `readout_loss_call`, `readout_near_miss_call`, `readout_rules_copied` |
| V-9, F-8 | `FLAGSMITH_DEV_CLIENT_KEY=<Development client key> node scripts/dev-synthetic.mjs --environment development --i-understand-this-is-synthetic` (A-10), wait a minute, then Refresh results | M1 0.833 vs 0.5 · M2 1.0 vs 1.0 · M3 1.0 vs 0.0 · M4 1.0 vs 1.0 (chance_to_win vs control), **although half the identities sent their batch twice** (F-8: Flagsmith's Mean is per identity) |
| F-8 (decisive) | Same command with `--f8`, after a fresh Development experiment or with the earlier data folded in | Each arm's M1 mean equals the per-identity prediction, not A / (A + 3B). The default run cannot separate the two (its duplicates repeat identical values). If a run stops part-way, `--lookup <run>` re-reads its arms with events off |

Then **end** the Development experiment (the synthetic identities are in it; it is never read as a finding).

### Recording the evidence

Save into `evidence/development/` only, following its README. Every screenshot:
- shows the environment name and the as-of time;
- crops out keys, project, organisation, experiment, feature and identity IDs;
- the synthetic one is captioned **"SYNTHETIC — Development — pipeline check only"**.

Record pass/fail per row in `evidence/development/validation.md`. A row is only "pass" with its screenshot or log
next to it.

## 3. Then tag

Only when V-0 to V-9 and F-8 pass, and `npm run check:all` is green: create the `measured-v1` tag on the commit that
was validated (EXPERIMENT.md §13), record its hash, and run `npm run check:release`.

## 4. Production: prepare only (no traffic, not started before 26 Nov 08:00 IST)

Read-only preflight (17 Nov): [`evidence/production/preflight.md`](../evidence/production/preflight.md). Why the
experiment is created with its rollout **disabled**: [`evidence/production/preparation-safety.md`](../evidence/production/preparation-safety.md).

1. **G-1 Warehouse.** Before launch: the Flagsmith-managed connection exists, **Pending Connection**, 0 events
   (Flagsmith marks it Connected only after its first event, and no Production event may be sent before launch).
   After the first real player: **Connected** (launch step L-7 in [`docs/LAUNCH.md`](../docs/LAUNCH.md)).
2. **G-2 Metrics and experiment**, from the same files as Development, by the owner on their own machine. The console
   wizard is not used in Production (it starts the experiment on creation). Keys only in the shell, never in a file:
   ```
   read -rs FLAGSMITH_ADMIN_API_KEY && export FLAGSMITH_ADMIN_API_KEY
   read -rs FLAGSMITH_PRODUCTION_ENV_KEY && export FLAGSMITH_PRODUCTION_ENV_KEY
   node scripts/flagsmith-prepare-production.mjs --environment production --i-confirm-production --dry-run
   node scripts/flagsmith-prepare-production.mjs --environment production --i-confirm-production --apply-production-prep
   node scripts/flagsmith-prepare-production.mjs --environment production --i-confirm-production --verify
   unset FLAGSMITH_ADMIN_API_KEY FLAGSMITH_PRODUCTION_ENV_KEY
   ```
   The apply run needs the owner's explicit approval first. It creates only what is missing; stops on any mismatch
   instead of updating; creates the experiment in status `created` with M1–M5 attached in order (M1 primary) and its
   rollout **disabled** (100%, `p_value` 50 / `chance_to_win` 50); never starts, pauses, ends or edits anything.
   *Pass:* `--verify` prints VERIFY PASSED, and its transcript is in `evidence/production/api/`.
3. **G-3 Deploy.** The production build gets `VITE_FLAGSMITH_ENV_NAME=production` and the **Production** client key
   from the host's environment variables; the build refuses a production context without a key or with the
   Development key from `.env`. The deployed page carries the hidden marker `data-env="production"` and no "DEV" chip. See
   [`evidence/production/deployment-review.md`](../evidence/production/deployment-review.md).
4. G-4 `measured-v1` tag present and `npm run check:release` green; G-5 all suites green; G-6 nobody on the team has
   played Production.
5. Start only with the account owner's A-5, on or after **26 Nov 08:00 IST**, following
   [`docs/LAUNCH.md`](../docs/LAUNCH.md). No scripts sending events, no team plays, no overrides in Production, ever.
