/** Priority D: the copy never overclaims anonymity, and the consent says what the ID does and how Practice differs. */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { DISCLOSED_EVENTS, EVENT_PURPOSE } from './privacy'
import { SPOILERS, TEMPLATES } from './recruitment'

const USER_FACING = ['src/routes/Landing.tsx', 'src/routes/About.tsx', 'src/routes/Team.tsx', 'src/routes/Rules.tsx', 'src/content/study.ts', 'src/content/team.ts', 'src/content/privacy.ts']
const DOCS = ['README.md', 'EXPERIMENT.md', 'RECRUITMENT.md']

describe('privacy wording', () => {
  it('no page, message or document calls the study anonymous or free of personal data', () => {
    for (const f of [...USER_FACING, ...DOCS]) {
      const text = readFileSync(f, 'utf8').replace(/pseudonymous, not anonymous|it is not anonymous/g, '')
      expect(text, f).not.toMatch(/\banonymous\b|anonymously|no personal data/i)
    }
    for (const t of TEMPLATES) expect(t.text('https://x.example.com')).not.toMatch(/anonymous/i)
  })

  it('the consent block says what the ID links, how long it lasts, the network information, and that practice sends nothing', () => {
    const landing = readFileSync('src/routes/Landing.tsx', 'utf8').replace(/\s+/g, ' ')
    expect(landing).toMatch(/creates a random ID stored in this browser that links what you see to your calls/)
    expect(landing).toMatch(/Clearing site data or another browser gives a new ID/)
    expect(landing).toMatch(/standard request data, such as your IP address/)
    expect(landing).toMatch(/Practice sends nothing/)
  })

  it('never claims "no analytics": it names Flagsmith as the one service that receives the events', () => {
    for (const f of ['src/routes/About.tsx', 'README.md']) {
      const text = readFileSync(f, 'utf8').replace(/\s+/g, ' ')
      expect(text, f).not.toMatch(/no analytics scripts|no analytics\b|no tracking/i)
      expect(text, f).toMatch(/no separate analytics service and no ad pixels/)
    }
  })

  it('every disclosed event has a stated purpose, and no purpose gives the experiment away', () => {
    expect(Object.keys(EVENT_PURPOSE).sort()).toEqual([...DISCLOSED_EVENTS].sort())
    for (const [e, why] of Object.entries(EVENT_PURPOSE)) {
      expect(why.length, e).toBeGreaterThan(20)
      expect(why, e).not.toMatch(SPOILERS)
    }
    const readme = readFileSync('README.md', 'utf8')
    const lines = readme.split('\n')
    for (const e of DISCLOSED_EVENTS)
      expect(lines.some((l) => l.trimStart().startsWith(`- \`${e}\``) && l.includes(': ')), `${e} has a purpose in the README`).toBe(true)
  })

  it('every link into the repository from the app points at a file that exists', () => {
    const src = ['src/routes/About.tsx', 'src/routes/Rules.tsx', 'src/routes/Team.tsx', 'src/components/site/Site.tsx']
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n')
    const paths = [...src.matchAll(/\/(?:blob|tree)\/main\/([^`'"}\s]+)/g)].map((m) => m[1]!)
    expect(paths.length).toBeGreaterThan(0)
    for (const p of paths) expect(existsSync(p), p).toBe(true)
  })
})
