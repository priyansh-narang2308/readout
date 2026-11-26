/**
 * Upgrade A: recruitment (35 §4–§6). The channel tags and the message templates live here so the app's own share
 * links, `npm run links` and RECRUITMENT.md can't drift apart. A tag is a channel name only, never a person: it lands
 * in the score events' `ref` metadata (first touch, set by attemptStore.captureRef).
 *
 * Nothing here contains a count. Pledges and reach stay in the team's private tracker and are never evidence (35 §1).
 */

export type Channel = { tag: string; name: string; how: string; rules: string }

/** 35 §4, in order of effort: own networks first, then community spaces whose rules allow it. */
export const CHANNELS: Channel[] = [
  { tag: 'dm', name: 'Personal direct asks', how: 'A 1:1 message to people who pledged', rules: 'One play each, on one device' },
  {
    tag: 'team',
    name: 'Team-drill sessions',
    how: 'Each person plays alone first (measured), then the facilitator runs the drill',
    rules: 'The discussion happens after everyone has played',
  },
  { tag: 'li', name: 'LinkedIn', how: 'One post per team member, neutral text', rules: 'Platform norms' },
  { tag: 'x', name: 'X', how: 'One post per team member, neutral text', rules: 'Platform norms' },
  {
    tag: 'campus',
    name: 'College and alumni developer groups we belong to',
    how: 'A post in the allowed channel',
    rules: 'Group rules; ask an admin where required',
  },
  {
    tag: 'community',
    name: 'Developer and PM communities we are active in',
    how: 'A post in the "share your project" channel',
    rules: 'That server’s self-promotion rules',
  },
  { tag: 'wmd', name: 'WeMakeDevs community', how: 'A post where showcasing is allowed', rules: 'Server rules; no spam or cross-posting' },
  {
    tag: 'fs',
    name: 'Flagsmith Discord',
    how: 'Only in a channel where sharing hackathon projects is allowed',
    rules: 'Server rules; ask a moderator if unclear',
  },
  { tag: 'devto', name: 'DEV post: “Would you ship it? Six A/B results”', how: 'Published Saturday, no spoilers', rules: 'Platform rules' },
  { tag: 'share', name: 'Share link from finished players', how: 'The neutral share text on the readout', rules: '—' },
]

/** The tags the app itself writes into links. */
export const REF = { share: 'share', team: 'team' } as const

export const tagged = (origin: string, tag: string) => `${origin.replace(/\/+$/, '')}/?ref=${tag}`

/** 35 §4 "Never". Printed by `npm run links` and in RECRUITMENT.md. */
export const NEVER = [
  'paid traffic',
  'incentives tied to answers or to finishing',
  'bots or scripts',
  'team members playing Production',
  'asking anyone to play more than once',
  'revealing what is being tested in any post before the final refresh',
]

export type Template = { id: string; when: string; text: (url: string) => string; reveals?: true }

/** 35 §5. Every template except the reveal is spoiler-free (a test checks the words). */
export const TEMPLATES: Template[] = [
  {
    id: 'pledge',
    when: 'Now until 25 Nov, no link',
    text: () =>
      'I’m building a 4-minute challenge for the Flagsmith hackathon: six A/B test results, and you decide whether to ship. Could you play it once on Fri 27 or Sat 28 Nov? I’ll send you a link. There’s no sign-up, and no name or email.',
  },
  {
    id: 'launch',
    when: 'Fri 27 and Sat 28 Nov, after the Production start',
    text: (url) =>
      `Would you ship it? Six realistic A/B test results, four choices each, about 4 minutes, no sign-up. It’s also a small live experiment I’m running with Flagsmith. Please play once, on one device, and don’t spoil it for others. ${url}`,
  },
  {
    id: 'drill',
    when: 'When booking a team-drill session',
    text: (url) =>
      `30-minute session: everyone plays Readout alone first (about 5 minutes), then we walk through the six results together and agree a checklist for our own experiment reviews. ${url}`,
  },
  {
    id: 'reveal',
    when: 'Only after the final refresh (Sun 29 Nov 12:30 IST)',
    reveals: true,
    text: (url) =>
      `This quiz was an A/B test, and you were in it. Half of you saw each result’s inference as a p-value, half as “chance to beat control”. Here’s what Flagsmith found, with the as-of time and the pre-registered wording: ${url}`,
  },
]

/**
 * The participant recruitment kit (mission §8): the pieces a team member adapts for a post or a message. Spoiler-free
 * like every pre-reveal template: it says a live experiment exists, never what varies or what we expect.
 */
export const KIT = {
  problem:
    'A/B test results get misread all the time: a change that made things worse gets shipped, a promising-but-unfinished test gets called early, a broken traffic split gets interpreted. The numbers are right; the decision is wrong.',
  whatItDoes:
    'Readout shows you six realistic, fictional A/B test results. For each, you decide: ship, keep the control, keep collecting, or don’t trust the data. Then it shows exactly which traps caught you, and gives you a six-step checklist for real experiment reviews.',
  whyTry:
    'It takes about 4 minutes, there’s no sign-up, and you leave with a checklist you can paste into your next pull request or review doc. If you review experiments, or ship things because of them, it’s a quick way to find your blind spots.',
  invitation: (url: string) =>
    `Would you try Readout? Six A/B test results, four choices each, about 4 minutes, no sign-up. Please play once, on one device, and don’t discuss the results with others until the weekend is over. ${url}`,
  share: (url: string) => `Would you ship it? Six A/B test results, about 4 minutes. How many would you call right? ${url}`,
  privacy:
    'Pressing Start creates a random ID in your browser that links what you see to your calls. No name, email or account. It’s part of a small live experiment run with Flagsmith, which receives which version of the results you saw, your calls, how long you took, whether you finished, whether you later copy the Rules, and standard request data such as your IP address. Practice mode sends nothing. What’s being tested is explained after you finish.',
} as const

/** Words that would give the experiment away before the final refresh. */
export const SPOILERS = /p[- ]?values?|chance|framing|probabilit|variant|\barms?\b|treatment|bayes|significan/i

/** 35 §6: waves and the triggers that change the plan. Targets and thresholds only, never results. */
export const SCHEDULE: { when: string; action: string; check: string; trigger: string }[] = [
  {
    when: 'Now → 23 Nov',
    action: 'Collect pledges (DMs, own networks); book 2–5 drill sessions for Fri/Sat',
    check: 'Pledge count (private tracker)',
    trigger: 'Below 60 on 23 Nov → widen to campus and community groups (interest asks only); book more drills',
  },
  {
    when: 'Fri 27, 09:30',
    action: 'Production starts, only if G-1 to G-6 pass and the account owner gives A-5',
    check: '—',
    trigger: '—',
  },
  { when: 'Fri 11:00', action: 'Wave 1: DMs to pledgers; WeMakeDevs and Flagsmith spaces where allowed', check: 'Refresh at 14:00', trigger: '—' },
  {
    when: 'Fri 18:00',
    action: 'Wave 2: LinkedIn, X, campus and community posts',
    check: 'Refresh at 21:00',
    trigger: 'Below 40 exposed at 21:00 → personal asks Sat morning',
  },
  {
    when: 'Sat 28, 11:00',
    action: 'Wave 3: follow-ups, DEV post, drill sessions',
    check: 'Refresh at 12:00',
    trigger: 'Below 80 at 12:00 → 10 more personal asks each; extra drills',
  },
  {
    when: 'Sat 19:00',
    action: 'Wave 4: share-link nudge, last drills',
    check: 'Refresh at 22:00',
    trigger: 'Below 120 at 22:00 → prepare the small-sample narration; keep collecting until Sun 12:30',
  },
  { when: 'Sun 29, 12:30', action: 'Final refresh', check: 'Screenshot with the as-of time', trigger: '—' },
]
