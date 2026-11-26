/** Upgrade A: channel tags and message templates (35 §4–§6). */
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { captureRef, getRef } from '../run/attemptStore'
import { CHANNELS, KIT, NEVER, REF, SCHEDULE, SPOILERS, TEMPLATES, tagged } from './recruitment'
import { inviteMessage, teamInviteUrl } from './team'

const ORIGIN = 'https://readout.example.com'

describe('recruitment channels', () => {
  beforeEach(() => localStorage.clear())

  it('every channel tag is unique and survives the app’s own ref sanitiser unchanged', () => {
    const tags = CHANNELS.map((c) => c.tag)
    expect(new Set(tags).size).toBe(tags.length)
    for (const tag of tags) {
      localStorage.clear()
      captureRef(new URL(tagged(ORIGIN, tag)).search)
      expect(getRef()).toBe(tag)
    }
  })

  it('the tags the app writes itself are channels in the plan', () => {
    const tags = CHANNELS.map((c) => c.tag)
    for (const tag of Object.values(REF)) expect(tags).toContain(tag)
    expect(teamInviteUrl(ORIGIN)).toBe(`${ORIGIN}/?ref=team`)
    expect(tagged(`${ORIGIN}/`, 'dm')).toBe(`${ORIGIN}/?ref=dm`)
  })

  it('the readout share text uses the share tag (not a hand-typed one)', () => {
    const src = readFileSync('src/routes/Readout.tsx', 'utf8')
    expect(src).toContain('tagged(window.location.origin, REF.share)')
    expect(src).not.toMatch(/\?ref=/)
  })
})

describe('message templates', () => {
  it('nothing sent before the final refresh names what is being tested', () => {
    for (const t of TEMPLATES.filter((x) => !x.reveals)) expect(t.text(tagged(ORIGIN, 'dm'))).not.toMatch(SPOILERS)
    expect(inviteMessage(ORIGIN)).not.toMatch(SPOILERS)
    const share = /const shareText = `([^`]+)`/.exec(readFileSync('src/routes/Readout.tsx', 'utf8'))![1]!
    expect(share).not.toMatch(SPOILERS)
  })

  it('the spoiler check really catches the twist', () => {
    const reveal = TEMPLATES.find((t) => t.reveals)!
    expect(reveal.text(ORIGIN)).toMatch(SPOILERS)
    expect(reveal.when).toMatch(/final refresh/)
    for (const w of ['p-value', 'P value', 'chance to win', 'the other arm', 'Bayesian']) expect(w).toMatch(SPOILERS)
  })

  it('only the pledge goes out without a link; every other template carries the ORIGIN it is given', () => {
    for (const t of TEMPLATES) {
      const text = t.text(tagged(ORIGIN, 'x'))
      if (t.id === 'pledge') expect(text).not.toContain(ORIGIN)
      else expect(text).toContain(`${ORIGIN}/?ref=x`)
    }
  })

  it('asks for one play and never offers anything for playing', () => {
    const launch = TEMPLATES.find((t) => t.id === 'launch')!.text(ORIGIN)
    expect(launch).toMatch(/play once, on one device/)
    for (const t of TEMPLATES) expect(t.text(ORIGIN)).not.toMatch(/prize|win a|reward|gift|free\b|giveaway/i)
    expect(NEVER.join(' ')).toMatch(/team members playing Production/)
  })

  it('the plan holds targets and thresholds only: no Production before the gates, nothing after the final refresh', () => {
    const start = SCHEDULE.find((s) => /Production starts/.test(s.action))!
    expect(start.action).toMatch(/G-1 to G-6/)
    expect(SCHEDULE.at(-1)!.action).toBe('Final refresh')
  })
})

describe('RECRUITMENT.md', () => {
  const md = readFileSync('RECRUITMENT.md', 'utf8')

  it('lists every channel tag the app accepts, and no others', () => {
    for (const c of CHANNELS) expect(md).toContain(`\`${c.tag}\``)
    const listed = [...md.matchAll(/^\| (`[a-z0-9_-]+`(?:, `[a-z0-9_-]+`)*) \|/gm)].flatMap((m) => m[1]!.match(/[a-z0-9_-]+/g)!)
    expect(listed.sort()).toEqual(CHANNELS.map((c) => c.tag).sort())
  })

  it('every results-log row names its environment and has a screenshot (rows come from the console only)', () => {
    const rows = readFileSync('evidence/results-log.md', 'utf8')
      .split('\n')
      .filter((l) => /^\| \d/.test(l))
      .map((l) => l.split('|').map((c) => c.trim()))
    for (const r of rows) {
      expect(['Production', 'Development']).toContain(r[2])
      expect(r[7]).toMatch(/\S/)
    }
  })

  it('the recruitment kit covers every piece, gives nothing away, and never claims anonymity', () => {
    const texts = [KIT.problem, KIT.whatItDoes, KIT.whyTry, KIT.invitation(ORIGIN), KIT.share(ORIGIN), KIT.privacy]
    for (const t of texts) {
      expect(t, t).not.toMatch(SPOILERS)
      expect(t).not.toMatch(/anonymous|win a|prize|reward|gift/i)
      expect(t.length).toBeGreaterThan(40)
    }
    expect(KIT.invitation(ORIGIN)).toContain(ORIGIN)
    expect(KIT.share(ORIGIN)).toContain(ORIGIN)
    expect(KIT.invitation(ORIGIN)).toMatch(/once, on one device/)
    expect(KIT.privacy).toMatch(/No name, email or account/)
    expect(KIT.privacy).toMatch(/Practice mode sends nothing/)
    expect(KIT.privacy).toMatch(/IP address/)
  })
})
