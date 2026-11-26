# Usability validation plan (Practice mode only)

A small, genuine check that developers and product people can use Readout and understand what it teaches. It is
**separate from the experiment**: it never touches Production, never creates a measured identity, and its findings are
product feedback, not experiment evidence.

## Rules

- **Practice mode only** (`/practice`), on the Development preview or a local build. Practice sends nothing to
  Flagsmith and has no identity. Participants are asked **not** to press "Start the challenge".
- **Voluntary.** Anyone can stop at any time, skip any question, and ask for their notes to be deleted.
- **No identities.** No names, emails, employers or screenshots of faces. Notes record a role and a session number
  only (`U1`, `U2`, …). Nothing links a note to a browser ID or to a Production player.
- **Not a Production player afterwards?** Participants have seen the flip, so they know what varies. They are asked not
  to play the Production experiment, and are not sent the launch link.
- **No testimonials are published** without that participant's explicit permission for the exact words (A-9), and
  none are invented.
- Target: 5–8 sessions, 15 minutes each, before 25 Nov. Fewer is fine; the record says how many there were.

## What to say to the participant (read out, then send the Practice link)

> Thanks for helping. This is a 15-minute check of a small web app, not a test of you. Please think aloud as you go.
> Use the Practice link only, and please don't press "Start the challenge". Practice keeps everything in your browser
> and sends nothing anywhere. I'll write down what's confusing, with a session number and your rough role, never your
> name. You can stop at any point, skip anything, or ask me to delete my notes afterwards. Please don't share the link
> or what you saw. Because you'll have seen how it works, please don't play the live version later.

Don't explain what the app measures or which display is being tested.

## Tasks (observe; don't help unless stuck for 60 s)

| # | Task | Observe |
|---|---|---|
| T1 | "Open this link and practise one round of six." | Do they find Practice? Do they understand the four calls without help? |
| T2 | "Make the call on each result." | Time per card; hesitation; which cards they re-read |
| T3 | "Find out which calls were defensible and why." | Do they find the debrief? Do they read the trap and the Rule link? |
| T4 | "What would you check first next time?" | Can they name a Rule in their own words? |
| T5 | "Get the checklist into a pull request." | Do they find Copy as Markdown? Does the paste look right? |
| T6 | "How would you run this with your team?" | Do they find the team guide and presenter view? |

Then three questions: What confused you? What would you change first? Would you use the Rules in a real review, and where?

## After each session

Fill one row in [`evidence/usability/RECORD.md`](../evidence/usability/RECORD.md). If a finding leads to a change, link
the commit. Summarise only what was observed.
