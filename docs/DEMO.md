# Demo video: script and recording directions

**Primary: 3:00. Backup: 2:00.** For a judge who has never heard of Readout. Not a code walkthrough: no terminal, no
file trees, no installation.

## Before recording

| Item | Setting |
|---|---|
| Browser | Chrome, fresh profile, 1440 × 900 window, zoom 100%, bookmarks bar hidden, no extensions visible |
| App tab 1 | Production URL `/` (landing) — **only to show the landing; do not press Start in Production** |
| App tab 2 | Development preview `/practice` for the gameplay (Practice never measures, never contacts Flagsmith) |
| App tab 3 | Development preview `/team/present?r=2` (presenter view, result 2) |
| Flagsmith tab 4 | **Production** › Features › `readout_framing` (shows both values) |
| Flagsmith tab 5 | **Production** › Experiments › "Readout framing v1" › Results, refreshed, with the as-of time visible |
| Flagsmith tab 6 | **Development** › Experiments › "Readout framing v1" (fallback only, see "If Production has no result") |
| Hidden | Environment keys, API keys, the browser's address bar autocomplete, any email or organisation name. Crop IDs in post. |
| Overlay | The environment name ("Production" / "Development") as a caption whenever a Flagsmith page is on screen |

**Never in the video:** a Production play by the team, synthetic numbers presented as real, a result Flagsmith has not
shown, the words "proven", "users prefer", "safe" or "no impact".

## Primary script (3:00)

| Time | Screen | Say (about 150 words a minute) | Must be visible |
|---|---|---|---|
| 0:00–0:20 | Tab 2, result 1 of a practice run ("Shorter pricing page"), card in full | "Here's an A/B test. The p-value is 0.0015, highly significant. Would you ship it? Most people's instinct says yes. Look at the lift: minus 19 percent. Significant means *real*, not *good*. Shipping this ships a loss." | The p-value line, the −19.2% lift, the interval entirely below zero |
| 0:20–0:45 | Same card: press 1 (Ship), Enter. Cut to the debrief for result 1 (`/practice/readout/1`), scroll slowly to "The trap" and "Next time, check Rule 3" | "Readout is a four-minute challenge: six realistic results, four calls each: ship, keep the control, keep collecting, or don't trust the data. Then it shows exactly which trap you fell into, and the rule that would have caught it." | "Not defensible", the trap name, the Rule 3 link |
| 0:45–1:05 | `/practice/readout/summary`: "What your calls suggest", then "Copy as Markdown" → paste into a GitHub PR description draft (another tab) | "Your readout names your recurring mistakes, each tied to a rule. The six Readout Rules paste straight into a pull request or review doc. Teams can run it as a 30-minute drill with a presenter view." | The pattern list with "Next time: Rule N", the pasted checklist |
| 1:05–1:35 | Tab 2 back to a card: use the "Show this line as" toggle, p-value ↔ chance, twice, slowly. Hold on the line | "Here's the experiment inside the product. Every result card can show its inference one of two ways: a p-value, or Flagsmith's own 'chance to beat control'. Same counts, same model, one line different. That line is the only variable. Which one leads to better decisions?" | Only the inference line changes; the rest of the card stays still |
| 1:35–2:00 | Tab 4 (Production, `readout_framing`): the control value `p_value` and the variation `chance_to_win` | "That line is a Flagsmith multivariate flag, `readout_framing`. Flagsmith assigns each player one version, 50/50, records the exposure when the first card is shown, and receives five metric events: the score, completion, two key calls, and whether they took the Rules." | Environment caption "Production", both values, the 50% split |
| 2:00–2:35 | Tab 5 (Production experiment results), refreshed: exposures per variant, M1, the guardrails M2 and M4, the as-of time; the SRM check (`scripts/srm.mjs`) on screen in a terminal | Read the result **as shown**, with the pre-registered wording for the outcome that applies (`src/content/outcomes.ts`). E.g. inconclusive: "After N real players, Flagsmith can't tell the two versions apart yet: lift X, interval Y. That's the outcome we registered as most likely for a pilot, so we keep the p-value as the default." | "Production", the as-of time, exposures per arm, M1 with its interval, guardrails, SRM status |
| 2:35–2:50 | Tab 5 still, point at the decision; then tab 4 | "The decision rule was written before any data. If the chance version wins, shipping it is one flag change, here, not a code change." | The flag page (no edits made on camera unless the rule says ship) |
| 2:50–3:00 | Tab 1 (Production landing) | "Readout: practise the calls, learn the traps, take the rules to your team. Test something real." | The landing headline "Would you ship it?" |

### If Production has no readable result yet

Flagsmith shows "collecting data" below 50 identities per arm. Then 2:00–2:35 becomes: show the Production experiment
**as it is** (exposures so far, "collecting data", as-of time) and say "Flagsmith won't show a result below 50 players
per version, so neither do we", the pre-registered `collecting` wording. Optionally cut to tab 6 for 10 seconds,
captioned **"Development — pipeline check, not a finding"**, to show the metrics populated. Never present Development
numbers as the result.

## Backup script (2:00)

| Time | Screen | Say |
|---|---|---|
| 0:00–0:20 | Practice result 1 card | "p = 0.0015. Ship it? The lift is minus 19%. Significant means real, not good." |
| 0:20–0:45 | Ship → debrief → summary patterns → Copy Rules | "Readout: six results, four calls, then the trap you fell into, your recurring mistakes and six rules for your team's reviews." |
| 0:45–1:05 | The "Show this line as" toggle on one card | "Each card's inference shows as a p-value or as chance to beat control. That one line is the experiment." |
| 1:05–1:45 | Flagsmith Production: the flag, then the experiment results with as-of time | "A Flagsmith multivariate flag assigns the version and records exposure; five metrics measure the calls. [Read the result as shown, with the pre-registered wording.]" |
| 1:45–2:00 | Landing | "Practise the calls, learn the traps, take the rules to your team." |

## After recording

- Check every Flagsmith frame for keys and IDs; blur in post if any show.
- Save the Flagsmith screenshots used in the video into `evidence/production/` with their as-of time.
- Add the video link to README §18.
