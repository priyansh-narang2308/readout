# Recruitment

How real players reach the Production experiment, written before any recruitment. The source of truth for tags and
messages is `src/content/recruitment.ts`; `npm run links -- <production URL>` prints every tagged link and message
from it. Tests keep the app's own links on these tags and every pre-reveal message free of spoilers.

**There are no participant numbers here, and there never will be.** Every number below is a target or a threshold.
Pledges and reach are kept in the team's private tracker (counts only, no names, never committed) and are never
evidence of anything except effort.

## What counts

| Term | Counts as experiment evidence? |
|---|---|
| Pledge: someone said they'd play | No. A recruitment signal only. |
| Exposed identity: a browser ID with a `$flag_exposure` in **Production** | Yes, the denominator, read from Flagsmith's Exposures panel |
| Validation participant: an observed session on the **Development** preview | No. Qualitative product feedback, kept separate. |

## Targets

| Level | Number | Why |
|---|---|---|
| Pledges before the event | 60–100 | A signal that the channels work; no conversion rate is assumed |
| Minimum exposed identities | 120–150 | 94.5–99.9% chance both arms pass Flagsmith's 50-per-arm display floor; the split check runs from 100 |
| Stretch | 300 | About 150 per arm. Still a pilot (EXPERIMENT.md §8). |

## Channels and tags

The tag goes in the link as `?ref=<tag>` and reaches Flagsmith only as the `ref` metadata on the score events. It is
a channel name, never a person.

| Tag | Channel | How | Rules to respect |
|---|---|---|---|
| `dm` | Personal direct asks | A 1:1 message to people who pledged | One play each, on one device |
| `team` | Team-drill sessions | Each person plays alone first, then the drill | The discussion happens after everyone has played |
| `li`, `x` | Team members' LinkedIn and X | One post each, neutral text | Platform norms |
| `campus` | College and alumni developer groups we belong to | A post in the allowed channel | Group rules; ask an admin where required |
| `community` | Developer and PM communities we're active in | "Share your project" channels | That server's self-promotion rules |
| `wmd` | WeMakeDevs community | Where showcasing is allowed | No spam or cross-posting |
| `fs` | Flagsmith Discord | Only where sharing hackathon projects is allowed | Ask a moderator if unclear |
| `devto` | DEV post "Would you ship it? Six A/B results" | Saturday, no spoilers | Platform rules |
| `share` | The share text on a finished player's readout | Written by the app | — |

**Never:** paid traffic; incentives tied to answers or to finishing; bots or scripts; team members playing
Production; asking anyone to play more than once; revealing what is being tested in any post before the final refresh.

## Messages

- **Pledge** (now until 25 Nov, no link): a 4-minute challenge, six A/B results, play once on Fri 27 or Sat 28 Nov,
  no sign-up, no name or email.
- **Launch** (Fri 27 and Sat 28, after the Production start): six results, four choices, about 4 minutes, "a small
  live experiment I'm running with Flagsmith", play once on one device, don't spoil it.
- **Drill** (when booking a session): everyone plays alone first, then the walk-through and a checklist for our own
  reviews.
- **Reveal** (only after the final refresh): "This quiz was an A/B test, and you were in it." It links to the README
  results, not to the app, and uses the pre-registered wording for whichever outcome applies.

**Recruitment kit** (`KIT` in `src/content/recruitment.ts`, spoiler-checked by a test): the problem in two
sentences, what Readout does, why a developer or PM should try it, a direct invitation, a share message and a plain
privacy explanation. None of it says what varies between versions or which one we expect to do better.

Usability sessions (Practice mode only, voluntary, no identities) are separate from recruitment and from the
experiment: [docs/USABILITY.md](docs/USABILITY.md).

Full texts: `npm run links -- <production URL>`.

## Schedule and triggers (IST)

| When | Action | Check | If below target |
|---|---|---|---|
| Now → 23 Nov | Collect pledges; book 2–5 drill sessions for Fri/Sat | Pledge count (private) | Below 60 on 23 Nov → widen to campus and community groups (interest asks only); book more drills |
| Fri 27, 09:30 | Production starts, **only if** G-1 to G-6 pass and the account owner gives A-5 | — | — |
| Fri 11:00 | Wave 1: DMs to pledgers; WeMakeDevs and Flagsmith spaces where allowed | Refresh 14:00 | — |
| Fri 18:00 | Wave 2: LinkedIn, X, campus and community posts | Refresh 21:00 | Below 40 exposed → personal asks Sat morning |
| Sat 28, 11:00 | Wave 3: follow-ups, DEV post, drills | Refresh 12:00 | Below 80 → 10 more personal asks each; extra drills |
| Sat 19:00 | Wave 4: share-link nudge, last drills | Refresh 22:00 | Below 120 → prepare the small-sample narration; keep collecting |
| Sun 29, 12:30 | Final refresh | Screenshot with the as-of time | — |

Every refresh is logged in [evidence/results-log.md](evidence/results-log.md), from the Flagsmith console only.
