# Worked example: Readout framing v1

The workflow this skill packages, as it was run for Readout (this repository). Production, real players only.

| Step | What was done |
|---|---|
| 1 Pre-register | `EXPERIMENT.md`: hypothesis, one flag `readout_framing` with two variants (control is the default), primary metric `readout_score` (increase), four exploratory metrics, run window, decision rules, written before any data |
| 2 Wire | The app reads the flag in one place; every other pixel is identical between arms (tested) |
| 3 Set up | Metrics and the experiment created through the Admin API with the rollout **disabled**, 50/50, then read back (`scripts/flagsmith-prepare-production.mjs --verify`) |
| 4 Pre-flight | `docs/LAUNCH.md` L-0…L-4: checks green, deployed page in Production mode, no Flagsmith request before Start |
| 5 Start | Owner approval, then Start in the console; read back as running |
| 6 Monitor | Sample-ratio check first at each planned refresh (`scripts/srm.mjs`), no peeking at the primary metric |
| 7–8 Decide, roll out | At the final refresh, by the pre-registered rule; the result goes into the repo with its as-of time |

What is being compared is not named here until the experiment has ended, so it cannot bias players.
No results are shown here until the final refresh.
