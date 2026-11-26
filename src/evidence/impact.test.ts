/**
 * Upgrade C. The fixtures below are built by these tests to check the arithmetic; they are not data and appear in no
 * report. The script test runs the real `npm run impact` on a temp file.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MEASURED_ORDER, SCENARIOS, type Call, type ScenarioId } from '../content/scenarios.v1'
import { answersString } from '../content/scoring'
import { DEV_LABEL, impact, parseAnswers, parseEvents, prodLabel, readExport, report, type RawEvent } from './impact'

const KEY = Object.fromEntries(MEASURED_ORDER.map((id) => [id, SCENARIOS[id].key])) as Record<ScenarioId, Call>

function fixtureScore(attemptId: string, changes: Partial<Record<ScenarioId, Call>> = {}, send = 1): RawEvent {
  return {
    event: 'readout_score',
    identifier: `fixture-${attemptId}`,
    value: 0,
    metadata: { scenarioSet: 'v1', attemptId, answers: answersString({ ...KEY, ...changes }), totalSeconds: 200, ref: 'dm', variantMismatch: false, send },
  }
}
const fixtureCopy = (attemptId: string): RawEvent => ({ event: 'readout_rules_copied', metadata: { scenarioSet: 'v1', attemptId } })
const opts = { env: 'production' as const, asOf: '29 Nov 2026 12:30 IST', source: 'test' }

describe('reading an export', () => {
  it('reads answers only in the measured order, all six, valid calls', () => {
    expect(parseAnswers(answersString(KEY))).toEqual(KEY)
    expect(parseAnswers('S1:ship,S3:collecting,S5:distrust,S2:control,S4:collecting,S6:control')).toBeNull()
    expect(parseAnswers(answersString(KEY).replace('S6:control', 'S6:none'))).toBeNull()
    expect(parseAnswers(answersString(KEY).replace('ship', 'yolo'))).toBeNull()
    expect(parseAnswers(42)).toBeNull()
  })

  it('one player per attempt: a re-sent batch counts once, and the other three score events are ignored', () => {
    const p = parseEvents(
      [fixtureScore('a'), fixtureScore('a', {}, 2), { ...fixtureScore('a'), event: 'readout_completed' }, fixtureScore('b')],
      'production',
    )
    expect(p.players.map((x) => x.attemptId)).toEqual(['a', 'b'])
    expect(p.duplicateSends).toBe(1)
  })

  it('anything unreadable is counted as rejected with its reason, never repaired', () => {
    const p = parseEvents(
      [
        { event: 'readout_score' },
        { ...fixtureScore('x'), metadata: { ...(fixtureScore('x').metadata as object), scenarioSet: 'v0' } },
        { ...fixtureScore('y'), metadata: { ...(fixtureScore('y').metadata as object), attemptId: '' } },
        { ...fixtureScore('z'), metadata: { ...(fixtureScore('z').metadata as object), answers: 'S3:ship' } },
      ],
      'production',
    )
    expect(p.players).toEqual([])
    expect(p.rejected).toEqual({ 'no metadata': 1, 'another scenario set': 1, 'no attempt id': 1, 'unreadable answers': 1 })
  })

  it('refuses a "Production" file that holds any Development check event, reading nothing', () => {
    expect(() => parseEvents([fixtureScore('a'), { event: 'readout_dev_check', identifier: 'dev-check-1' }], 'production')).toThrow(
      /not a Production export/,
    )
    expect(() => parseEvents([{ ...fixtureScore('a'), identifier: 'dev-check-2' }], 'production')).toThrow()
    expect(parseEvents([fixtureScore('a'), { event: 'readout_dev_check' }], 'development').players).toHaveLength(1)
  })

  it('refuses a "Production" file holding any synthetic pipeline-check event (by identity or metadata)', () => {
    expect(() => parseEvents([fixtureScore('a'), { event: 'readout_score', identifier: 'synthetic-dev-abc123-001' }], 'production')).toThrow(
      /synthetic/,
    )
    expect(() =>
      parseEvents([fixtureScore('a'), { event: 'readout_completed', identifier: 'x', metadata: { synthetic: true } }], 'production'),
    ).toThrow(/not a Production export/)
    // In a Development file, synthetic scores are simply not players (another scenario set).
    const dev = parseEvents([{ event: 'readout_score', identifier: 'synthetic-dev-abc123-001', metadata: { scenarioSet: 'synthetic-dev', attemptId: 's' } }], 'development')
    expect(dev.players).toEqual([])
    expect(dev.rejected).toEqual({ 'another scenario set': 1 })
  })

  it('a Rules copy counts only for a player in the same export', () => {
    const p = parseEvents([fixtureScore('a'), fixtureCopy('a'), fixtureCopy('a'), fixtureCopy('ghost')], 'production')
    expect(p.rulesCopied).toBe(1)
  })

  it('accepts a JSON array, the events API body and JSON lines', () => {
    const evs = [fixtureScore('a'), fixtureScore('b')]
    expect(readExport(JSON.stringify(evs))).toHaveLength(2)
    expect(readExport(JSON.stringify({ events: evs }))).toHaveLength(2)
    expect(readExport(evs.map((e) => JSON.stringify(e)).join('\n'))).toHaveLength(2)
    expect(() => readExport('{"nope":1}')).toThrow()
  })
})

describe('the impact numbers', () => {
  const players = parseEvents(
    [
      fixtureScore('p1'),
      fixtureScore('p2', { S3: 'ship', S4: 'ship' }),
      fixtureScore('p3', { S3: 'ship', S5: 'ship' }),
      fixtureScore('p4', { S2: 'ship', S3: 'distrust' }),
      fixtureCopy('p1'),
      fixtureCopy('p4'),
    ],
    'production',
  )
  const i = impact(players)

  it('counts correct and wrong calls per result, most common wrong call first', () => {
    const s3 = i.scenarios.find((s) => s.id === 'S3')!
    expect(s3.correct).toBe(1)
    expect(s3.wrong).toEqual([
      { call: 'ship', count: 2 },
      { call: 'distrust', count: 1 },
    ])
    expect(i.scenarios.find((s) => s.id === 'S1')!.wrong).toEqual([])
    expect(i.scenarios.map((s) => s.id)).toEqual(MEASURED_ORDER)
  })

  it('a rule is broken once per wrong call on a result that tests it', () => {
    const byN = Object.fromEntries(i.rules.map((r) => [r.n, r]))
    // Rule 2 is tested by S3 and S4: three wrong S3 calls and one wrong S4 call, out of 2 × 4 chances.
    expect(byN[2]).toMatchObject({ misses: 4, chances: 8 })
    expect(byN[6]).toMatchObject({ misses: 0, chances: 4 })
    for (const r of i.rules) expect(r.chances).toBeGreaterThan(0) // every rule is tested by some result
  })

  it('uses the app’s own mistake patterns, and counts copies and perfect runs', () => {
    expect(i.allDefensible).toBe(1)
    expect(i.patterns.find((p) => p.id === 'early-repeated')!.count).toBe(1)
    expect(i.patterns.find((p) => p.id === 'significant-good')!.count).toBe(1)
    expect(i.rulesCopied).toBe(2)
  })

  it('the report is labelled, pooled, names the most broken rule, and never mentions an arm', () => {
    const md = report(players, i, opts)
    expect(md).toContain(prodLabel(opts.asOf))
    expect(md).toMatch(/both arms pooled/)
    expect(md).toMatch(/not the experiment's result/)
    expect(md).toMatch(/Most broken: rule 4, "Does the 95% interval cross zero\?" \(75% of chances\)/)
    expect(md).toMatch(/Copied the Readout Rules after finishing: 2 of 4 \(50%\)/)
    expect(md).not.toMatch(/p_value|chance_to_win|control arm|treatment/i)
  })

  it('Development output says it is not a finding; a report without time or source is refused', () => {
    expect(report(players, i, { ...opts, env: 'development' })).toContain(DEV_LABEL)
    expect(report(players, i, { ...opts, env: 'development' })).not.toContain('Production')
    expect(() => report(players, i, { ...opts, asOf: ' ' })).toThrow()
    expect(() => report(players, i, { ...opts, source: '' })).toThrow()
  })

  it('an empty export reports nothing rather than zeros', () => {
    const empty = parseEvents([], 'production')
    expect(report(empty, impact(empty), opts)).toMatch(/nothing to report/)
  })
})

describe('npm run impact', () => {
  const run = (args: string[]) => spawnSync('node', ['scripts/impact.mjs', ...args], { encoding: 'utf8' })

  it('needs every flag', () => {
    const r = run(['--file', 'x.json', '--env', 'production'])
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/Usage/)
    expect(run(['--file', 'x', '--env', 'staging', '--as-of', 't', '--source', 's']).status).toBe(1)
  })

  it('prints the labelled report from a real file, and refuses a contaminated one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'impact-'))
    const ok = join(dir, 'ok.json')
    const bad = join(dir, 'bad.json')
    writeFileSync(ok, JSON.stringify([fixtureScore('a'), fixtureScore('b', { S2: 'ship' })]))
    writeFileSync(bad, JSON.stringify([fixtureScore('a'), { event: 'readout_dev_check' }]))
    const r = run(['--file', ok, '--env', 'production', '--as-of', opts.asOf, '--source', 'test file'])
    expect(r.status).toBe(0)
    expect(r.stdout).toContain(prodLabel(opts.asOf))
    expect(r.stdout).toMatch(/Players: 2 finished/)
    const b = run(['--file', bad, '--env', 'production', '--as-of', opts.asOf, '--source', 'test file'])
    expect(b.status).toBe(1)
    expect(b.stderr).toMatch(/not a Production export/)
  }, 30000)
})
