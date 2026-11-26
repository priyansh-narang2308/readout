# Production screenshots and evidence checklist

Every item is captured from the **Production** console or the deployed site, never from Development or a script,
and saved in this folder as `<date>-<time>-<what>.png` (IST). Each screenshot shows the environment name and, where
the page has one, the as-of time. Before saving: crop or blur keys, organisation, project, experiment, feature,
segment and identity IDs, emails and identifiers. Nothing here is edited beyond cropping and blurring.

## Before the start (preparation)

- [ ] `api/prep-dry-run-*.json`, `api/prep-apply-production-prep-*.json`, `api/prep-verify-*.json` (sanitized by the script)
- [ ] Experiment page: "Readout framing v1", status Created, five metrics with directions, M1 primary
- [ ] Warehouse card: Flagsmith-managed, Pending Connection, 0 events
- [ ] Flag `readout_framing`: `p_value`, `chance_to_win` at 0%, no identity overrides

## At the start (docs/LAUNCH.md)

- [ ] L-1 terminal: `check:all` and `check:release` green (crop the prompt)
- [ ] L-3 deployed landing: `data-env` = `production`, no DEV chip, no Flagsmith request before Start
- [ ] L-5 experiment Running with its start time
- [ ] L-6 rollout enabled, 100%, 50/50; flag default unchanged
- [ ] L-7 warehouse Connected with the first event time

## During (each scheduled refresh)

- [ ] Results page with the as-of time; one row in `evidence/results-log.md` per refresh
- [ ] Exposures per variant, and the `scripts/srm.mjs` output for those two counts

## Final

- [ ] Final refresh (Sun 29 Nov, 12:30 IST): results page, exposures, every metric row, as-of time
- [ ] `srm.mjs` output for the final exposure counts
- [ ] Experiment ended: Completed, end time shown
- [ ] `RESULTS-TEMPLATE.md` filled from these screenshots only, with the outcome and its pre-registered wording
- [ ] The video's Flagsmith frames saved here with their as-of time (docs/DEMO.md "After recording")

Never here: Development or synthetic numbers, team plays, numbers typed from memory, a result Flagsmith did not show.
