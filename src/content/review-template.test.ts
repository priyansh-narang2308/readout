/** Upgrade D: the review template stays in step with the Rules and the four calls, and pastes as a GitHub task list. */
import { describe, expect, it } from 'vitest'
import { REVIEW_TEMPLATE, RULES, rulesMarkdown } from './rules'
import { CALLS } from './scenarios.v1'

describe('review template', () => {
  it('has one checkbox per rule, numbered in rule order', () => {
    const boxes = [...REVIEW_TEMPLATE.matchAll(/^- \[ \] (\d)\. /gm)].map((m) => Number(m[1]))
    expect(boxes).toEqual(RULES.map((r) => r.n))
  })

  it('offers exactly the four calls', () => {
    const line = /^\*\*Call:\*\* (.+)$/m.exec(REVIEW_TEMPLATE)![1]!
    expect(line.split(' / ')).toHaveLength(CALLS.length)
  })

  it('asks for what was written before launch and for the as-of time of the results', () => {
    expect(REVIEW_TEMPLATE.match(/written before launch/g)).toHaveLength(3)
    expect(REVIEW_TEMPLATE).toMatch(/as-of time/)
  })

  it('both copies paste as GitHub task lists, with no HTML-like placeholders GitHub would hide', () => {
    for (const md of [REVIEW_TEMPLATE, rulesMarkdown()]) {
      expect(md).toMatch(/^- \[ \] /m)
      expect(md).not.toMatch(/<[a-z]/i)
    }
    expect(rulesMarkdown().match(/^- \[ \] /gm)).toHaveLength(RULES.length)
  })
})
