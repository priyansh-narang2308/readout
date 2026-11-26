/** The 30-minute team drill (25 §9). No accounts, no rooms, no server: one shared link and a presenter view. */
import { REF, tagged } from './recruitment'

export type TeamStep = { minutes: string; step: string; script: (inviteUrl: string) => string }

export const TEAM_STEPS: TeamStep[] = [
  {
    minutes: '0–2',
    step: 'Set up',
    script: (url) => `“Everyone open this link on your own device: ${url}. Play alone, don’t talk, one go each.”`,
  },
  {
    minutes: '2–8',
    step: 'Play',
    script: () => 'Everyone completes the challenge and stops at their readout.',
  },
  {
    minutes: '8–25',
    step: 'Walk the six results',
    script: () =>
      'Open the presenter view. For each result: show the card, ask the room for their call (a show of fingers, 1–4), reveal the defensible call, then ask “When have we seen this in our own launches?”',
  },
  {
    minutes: '25–30',
    step: 'Adopt the rules',
    script: () =>
      'Paste the Readout Rules into the team’s experiment docs. Agree the team’s bar (rule 6) and who writes the review for the next experiment.',
  },
]

/** The shared link carries `?ref=team` so team plays can be told apart from other traffic (a channel tag, no names). */
export const teamInviteUrl = (origin: string) => tagged(origin, REF.team)

export function inviteMessage(origin: string): string {
  return [
    'Experiment-review drill, 30 minutes.',
    `Before we start, open this on your own device and play it alone, one go, no talking: ${teamInviteUrl(origin)}`,
    'Six A/B test results, about 4 minutes, no sign-up. Stop at your readout and we’ll walk through them together.',
  ].join('\n')
}

export const TEAM_PRIVACY_NOTE = 'Each person’s own result stays in their browser. Readout never sees team names.'
