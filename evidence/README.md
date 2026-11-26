# Evidence

Two folders, never mixed. Nothing here is generated, estimated or simulated by the app, and nothing here is real
until the step that produces it has actually been run.

| Folder | What may go in it | What it proves |
|---|---|---|
| [`development/`](development/) | Development validation (V-0…V-9), the labelled synthetic pipeline check (F-8), team test plays | The pipeline works end to end. **Never** a finding about players. |
| [`production/`](production/) | Flagsmith console screenshots of the Production experiment, each with its as-of time, and `npm run impact` reports from a Production export | What real players did. The only source for any result claim. |
| [`results-log.md`](results-log.md) | One row per Production refresh, from the console | The as-of trail behind every number in the README |

Rules for every file:
- Crop or blur keys and all IDs (organisation, project, environment, experiment, feature, identity) before saving.
- Name files `YYYY-MM-DD_HHMM-IST_<what>.png`, with the as-of time from the console.
- Synthetic material is captioned **"SYNTHETIC — Development — pipeline check only"** in the file and wherever it is shown.
- No names, emails or messages from participants. Counts only.

## Judge evidence index

Status on 17 Nov 2026. Development entries are text records in [validation.md](development/validation.md) (no IDs). "Not yet" means the step that produces it has not been run; nothing is filled in ahead of it.

| Evidence | Development | Production | Produced by |
|---|---|---|---|
| Flag configuration (`readout_framing`, both values) | Pass, [validation.md](development/validation.md) | Not yet | Console screenshot, SETUP §1.2 |
| Experiment configuration (M1–M5, directions, 50/50, 100%) | Pass: 50/50, 100%, M1 primary, M2–M5 attached by API with the approved directions, [validation.md](development/validation.md) | Not yet (prepared, status `created`, G-2) | Console screenshot, SETUP §1.4 / §4 |
| Environment and warehouse status | Pass, [validation.md](development/validation.md) | Not yet (G-1) | Warehouse card, SETUP §1.1 |
| Both variant assignments | Pass (V-3), [validation.md](development/validation.md) | — | V-3 |
| Exposure evidence (`$flag_exposure` after Start only) | Pass (V-4), [validation.md](development/validation.md) | — | V-4 network capture |
| Metric event evidence (five events, 2xx, one identity) | Pass (V-5…V-8, M5), [validation.md](development/validation.md) | — | V-5…V-8 |
| Results | SYNTHETIC pipeline check only (V-9 pass; F-8 pass for Mean), [validation.md](development/validation.md) | Not yet (after A-5) | Results page with as-of time |
| Guardrail and SRM status | Guardrails read (synthetic); **SRM not computed by Flagsmith 2.291.0 for this flag set-up**, [validation.md](development/validation.md) | Not yet; SRM by the pre-registered `scripts/srm.mjs` (EXPERIMENT.md §10) | Results page |
| Test reports | [`test-reports/`](test-reports/): local runs, with date, machine and exact output | — | `npm run check:all` |
| Deployment evidence | Not yet (no deploy has been made) | Not yet | Host dashboard + `env:` data attribute (G-3) |
