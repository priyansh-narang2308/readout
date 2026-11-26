# Results (template — fill only from the Production console)

**Production · real players · as of `<date time IST from the console>`**

Fill every field from the Flagsmith **Production** experiment page at the final refresh, and save the screenshot next
to this file. Pick the **first** outcome that applies, in this order, and use its pre-registered wording
(`src/content/outcomes.ts`). Never write "proven", "users prefer", "safe" or "no impact".

| Field | Value | Source |
|---|---|---|
| Exposed identities, `p_value` (control) | | Exposures panel |
| Exposed identities, `chance_to_win` | | Exposures panel |
| SRM check: χ², p, warning? | `node scripts/srm.mjs --control <n> --chance-to-win <n>` output | The two exposure counts above (Flagsmith shows no SRM for this flag set-up) |
| Either arm "collecting data"? | yes / no | Results page |
| M1 Readout score: lift, 95% interval, chance to beat control | | M1 row |
| M2 Finished (guardrail): lift, interval, chance | | M2 row |
| M4 Near-miss call (guardrail): lift, interval, chance | | M4 row |
| M3 Loss call (secondary): lift, interval | | M3 row |
| M5 Copied the Rules (exploratory): rate per arm | | M5 row |

## Outcome (first that applies)

1. SRM warning (p < 0.001) → *"Traffic didn’t split 50/50 as configured (sample-ratio check, p < 0.001). By rule one, we don’t interpret these results…"*
2. Collecting data / < 100 players → *"Not enough players yet for Flagsmith to show a result, so we don’t either…"*
3. A guardrail losing → keep `p_value`; name it and give its interval.
4. M1 chance < 5% → keep `p_value`; give the lift and interval.
5. M1 chance 5–95% → **inconclusive**, keep the control; give lift, interval, players per version and the follow-up size.
6. M1 chance > 95%, no guardrail worse → roll out `chance_to_win` with the same flag; say whether it clears 97.5%.

Outcome that applied: `<id>` · Wording used: `<copied from outcomes.ts>` · Screenshot: `<file>`
