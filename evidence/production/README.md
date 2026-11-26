# Production evidence

**Production · real players only.** No results until the account owner starts the Production experiment (A-5, not
before 26 Nov 08:00 IST, after G-1…G-6). Console screenshots with their as-of time; `npm run impact -- --env production`
reports from a Production export. Nothing from Development and no event-sending script ever goes here.

Preparation records (no traffic, no results):

| File | What |
|---|---|
| [preflight.md](preflight.md) | Read-only audit of Production on 17 Nov, warehouse status, G-1 re-stated |
| [preparation-safety.md](preparation-safety.md) | Why the prepared (CREATED) experiment cannot reach players: rollout created disabled |
| [deployment-review.md](deployment-review.md) | Production build reviewed, a key hazard fixed, host not yet verified |
| [CHECKLIST.md](CHECKLIST.md) | Screenshots and evidence to capture, before, at and after the start |
| [RESULTS-TEMPLATE.md](RESULTS-TEMPLATE.md) | The result report, filled only from the Production console |
| `api/` | Sanitized transcripts of `scripts/flagsmith-prepare-production.mjs`: the GET-only dry run, the approved apply run and the verify run of 17 Nov |

## Preparation status (17 Nov 2026, ~18:00 IST)

Run by the owner's approval, with the owner's keys typed into their own shell (never seen, printed or stored):
dry run (7 GETs, no write) → apply (exactly 6 creates, all 201: M1–M5, then the experiment) → verify (10 GETs,
**VERIFY PASSED**). Production now holds M1–M5 once each and "Readout framing v1" in status **CREATED**, M1 primary,
rollout **disabled** (100%, `p_value` 50 / `chance_to_win` 50), no exposures, no results, 0 events; the flag default is
unchanged (`p_value`, `chance_to_win` 0%), with one segment override (the experiment's disabled rollout). **Not
started.** Transcripts in `api/`. Next Production action: docs/LAUNCH.md, not before 26 Nov 08:00 IST and A-5.
