# Production launch checklist (on or after 26 Nov 2026, 08:00 IST)

Run by the account owner, in order. **Stop at the first step that fails**, and do not start. Nothing here may happen
before 26 Nov 2026, 08:00 IST, and Start needs the owner's explicit approval A-5. RECRUITMENT.md's schedule plans the
start for Fri 27 Nov, 09:30; any time from 26 Nov 08:00 IST is allowed by the boundary, and the owner picks.

Keys are typed into the shell with `read -rs`, never pasted into a file or a chat, and unset afterwards.

| # | Step | Pass | Evidence |
|---|---|---|---|
| L-0 | Time is on or after 26 Nov 2026, 08:00 IST, and the owner has written A-5 ("start Production") | Both true | The approval message (date, time) |
| L-1 | `git status` clean on `main`; `npm run check:all`; `npm run check:release` | All green; `measured-v1` = `3c0909d9bee5bc4408dbe48c351a34f7bb9f6903` | Terminal output |
| L-2 | `node scripts/flagsmith-prepare-production.mjs --environment production --i-confirm-production --verify` | VERIFY PASSED: five metrics once, experiment once, CREATED, M1 primary, rollout disabled, no exposures, no results, 0 Production events | `evidence/production/api/prep-verify-*.json` |
| L-3 | Open the deployed Production URL in a private window, DevTools › Network open. **Do not press Start.** | No "DEV · not part of the study" chip; in the DevTools console `document.querySelector('[data-env]').dataset.env` is `production`; no request to `*.flagsmith.com` on the landing page; security headers present | Screenshot (URL bar, console line, empty network list) |
| L-4 | Pin the frozen commit: `git rev-parse 'measured-v1^{commit}' > measured-v1.sha`, commit it (`Pin measured-v1 at the Production start`), then `npm run check:release` | `measured-v1.sha` holds `3c0909d9bee5bc4408dbe48c351a34f7bb9f6903`; check:release green | The commit |
| L-5 | Flagsmith › **Production** › Experiments › "Readout framing v1" › **Start** | Status **Running**, start time shown | Screenshot with the start time |
| L-6 | Same page and the flag page, right after Start | Rollout **enabled**, 100%, `p_value` 50 / `chance_to_win` 50; five metrics, M1 primary; `readout_framing` default still `p_value` with `chance_to_win` at 0% | Screenshots |
| L-7 | After the first real (non-team) player | Warehouse **Connected**, events received > 0; this completes G-1 | Warehouse card screenshot |
| L-8 | Recruitment wave 1 (RECRUITMENT.md schedule), launch message with tagged links from `npm run links -- <Production URL>` | Sent only to the planned channels | Counts only, in the private tracker |

If L-5 shows no Start control for a CREATED experiment, stop: the API start (`POST …/experiments/{id}/start/`) is
then prepared and reviewed separately, only after A-5. Never use the console wizard to create a second experiment.

## After the start, until the final refresh

- Refreshes only at the times in RECRUITMENT.md; each one logged in `evidence/results-log.md` from the Production console.
- The SRM check from the two exposure counts: `node scripts/srm.mjs --control <n> --chance-to-win <n>` (EXPERIMENT.md §10 rule 1).
- Never: change variant weights, add overrides, pause or end early (except as EXPERIMENT.md says), play Production as a
  team member, run scripts that send events, edit a frozen file, or reveal the hypothesis before the final refresh.
- End the experiment after the final refresh (Sun 29 Nov, 12:30 IST), then fill
  `evidence/production/RESULTS-TEMPLATE.md` and follow `evidence/production/CHECKLIST.md`.
