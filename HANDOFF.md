# Readout: handoff (26 Nov 2026)

For whoever picks this up next (Antigravity or another agent). Read this first, then `docs/LAUNCH.md`,
`EXPERIMENT.md`, `RECRUITMENT.md` and `TASKS.md`.

## What Readout is

An experiment-decision training lab (Vite + React + TS, Tailwind). Players see six fictional A/B test results and make a
call on each (ship it / keep the control / keep collecting / don't trust the data). One Flagsmith flag,
`readout_framing`, decides how the inference line is shown: `p_value` vs `chance_to_win`. Everything else is identical
between arms (tested). The Flagsmith experiment "Readout framing v1" measures whether the framing changes decisions.
M1 `readout_score` is the primary metric (`increase`); M2 `readout_completed` (`not_decrease`) and M4 `readout_near_miss_call` (`not_decrease`) are guardrails; M3 `readout_loss_call` (`increase`) is secondary; and M5 `readout_rules_copied` (`increase`) is exploratory.

## Hackathon (Flagsmith) — tracks

- **Track 01, Test Something Real ($2,000)**: our main track. Judged on the experiment, so it needs real data
  before Sunday 29 Nov.
- **Track 04, Flagsmith Agent Skills ($500)**: possible extra entry. Idea: an Agent Skill for "set up an experiment
  and roll the winner out" using the Flagsmith CLI. Not built yet.
- Tracks 02 and 03 are weak fits (no agent; we don't self-host Flagsmith).
- The same project can be submitted to several tracks.

## Repo state

- GitHub: `priyansh-narang2308/readout`, branch `main`, flat layout (app at the root). CI (`.github/workflows/ci.yml`)
  is **green** at `9d88d6d`.
- The old working copy is `~/Developer/flagsmith-hack/readout` (has the `measured-v1` tag at `3c0909d`). The new repo
  has the same files byte for byte but **no `measured-v1` tag**, so `check:frozen` passes vacuously and
  `check:release` will not find `3c0909d`. Decide with the owner how to re-pin it in the new repo before L-1/L-4.
- A remote branch `flat` is left over; safe to delete when the owner agrees.
- Local checks (no `.env` needed):
  `VITE_FLAGSMITH_ENV_NAME=development npm run typecheck && npm test && npm run check:isolation && npm run check:secrets && npm run check:frozen && npm run build && npm run check:browser && npm run check:browser:prod && npm run check:arms`
  (`CHROME_PATH` for Chrome if it isn't found.)
- The demo video (4:13) is outside the repo: `~/Developer/flagsmith-hack/readout-video/out/Readout_Final_Demo.mp4`.
  Rebuild with `python3 src/compose.py && zsh src/mix.sh` in that folder. No dates are shown in it.

## Production status

- Production holds metrics M1–M5 and the experiment "Readout framing v1" in status **CREATED** (not started),
  rollout disabled, 50/50 weights, 0 events. See `evidence/production/README.md`.
- **The app is not deployed publicly yet** (`evidence/production/deployment-review.md`; `.vercel/project.json` links project `readout`, awaiting Production env vars and deploy). Without a public URL nobody can play.
  Deploy on Vercel or Netlify (configs exist) with `VITE_FLAGSMITH_ENV_NAME=production` and the **Production client
  key** set in the host's environment settings, never in a file.
- The owner gave A-5 ("start it") on 26 Nov 2026. Follow `docs/LAUNCH.md` L-0…L-8 in order: deploy → verify the
  Production URL (L-3) → Start in the Flagsmith console (L-5) → check rollout enabled 50/50 (L-6) → recruitment
  (L-8). The owner does the steps that need keys or the Flagsmith console.

## Rules that must not be broken

- Never print, request, store or commit keys, Admin API tokens, session tokens or cookies. Never commit `.env`.
  Keys are typed by the owner with `read -rs`.
- Never send synthetic events, run bots, or play Production as a team member. No test traffic presented as real.
- Never change Production variant weights, add overrides, or pause/end early (except as EXPERIMENT.md says).
- Do not alter the 33 frozen files (`scripts/check-frozen.mjs` lists them).
- Never claim a check passed unless it was actually run and seen.
- Commit messages: conventional commits, **no Co-Authored-By lines**. Push only when the owner says so.
- Don't reveal the hypothesis publicly before the final refresh (Sun 29 Nov, 12:30 IST).

## Next steps, in order

1. Deploy the Production build (owner sets the key in the host). Share the URL.
2. LAUNCH.md L-3: check the deployed page in a private window (no DEV chip, `data-env=production`, no Flagsmith
   request on the landing page).
3. L-5/L-6: owner presses Start in Flagsmith › Production › Experiments › Readout framing v1; confirm Running.
4. Recruitment per RECRUITMENT.md (`npm run links -- <Production URL>` for tagged links).
5. Refreshes and SRM check (`node scripts/srm.mjs`) at the times in RECRUITMENT.md; log them in
   `evidence/results-log.md`.
6. Optional: build the Track 04 Agent Skill.
7. After the final refresh: fill `evidence/production/RESULTS-TEMPLATE.md`, then submit.
