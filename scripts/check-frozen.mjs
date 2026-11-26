#!/usr/bin/env node
/**
 * The measured-v1 freeze (29 §3, 33 §6, EXPERIMENT.md §13). The files that decide what a measured player sees and
 * what is sent must be byte-identical to the `measured-v1` tag.
 *
 *   node scripts/check-frozen.mjs            before the freeze: reports that no tag exists yet and passes
 *   node scripts/check-frozen.mjs --require  release / Production gate (G-4): fails if the tag is missing
 *   [--root <dir>]                           run against another git checkout (tests)
 *
 * Once the tag exists, any difference fails: committed, staged (compared on its own, index against tag), unstaged,
 * renamed, deleted or untracked, and a frozen file missing
 * from the tag. If `measured-v1.sha` is committed (written when Production starts), the tag must still point at that
 * exact commit, so the tag cannot be quietly moved. Exit 0 = ok, 1 = violation, 2 = not a usable git checkout.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const TAG = 'measured-v1'
export const SHA_FILE = 'measured-v1.sha'

/**
 * Everything that decides what a measured player is assigned, sees, answers and sends (33 §6, widened 16 Nov):
 * - Assignment, flags, exposure, identity: the Flagsmith client, the exposure component, the attempt store.
 * - Attempts and delivery: the controller, the study context, the delivery monitor, measurement.
 * - Scoring and the answer key: scoring, analysis, the scenario data.
 * - Formatting and presentation: the stats, format, the result card, the decision bar, the run screen, the shared
 *   class names and the one stylesheet.
 * - Payloads: measurement (event names, metadata) and the controller (buildPayload).
 * - The lockfile, so the SDK version (which sends the events) cannot change under a running experiment.
 * - Widened 17 Nov (pre-release audit): what the frozen files import (the site chrome used by the run screen, the
 *   practice copy and reasons used by the controller) and the two entry points that mount the app (main.tsx leaves out
 *   StrictMode so an exposure is not recorded twice). src/freeze.test.ts keeps the set closed under local imports.
 * - Widened 17 Nov (M5 trace): the three pages that wire the Rules copy to trackRulesCopied (Rules, Team, Readout),
 *   and the content they import. All unchanged since 3c2a96e, the commit Development was validated against.
 * - The analysis plan and its guards, so nothing is re-decided after the tag: the pre-registration, the pre-written
 *   outcome wording, the SRM check (threshold included), this checker and the CI workflow that runs it.
 */
export const FROZEN = [
  'src/stats/flagsmithStats.ts',
  'src/stats/format.ts',
  'src/content/scenarios.v1.ts',
  'src/content/analysis.ts',
  'src/content/scoring.ts',
  'src/components/result/ResultCard.tsx',
  'src/components/decision/DecisionBar.tsx',
  'src/components/ui/classes.ts',
  'src/styles/index.css',
  'src/routes/Run.tsx',
  'src/flagsmith/client.ts',
  'src/flagsmith/MeasuredSession.tsx',
  'src/flagsmith/measurement.ts',
  'src/flagsmith/deliveryMonitor.ts',
  'src/run/attemptStore.ts',
  'src/run/controller.ts',
  'src/run/StudyContext.tsx',
  'src/components/site/Site.tsx',
  'src/content/study.ts',
  'src/main.tsx',
  'src/app/App.tsx',
  'src/routes/Rules.tsx',
  'src/routes/Team.tsx',
  'src/routes/Readout.tsx',
  'src/content/rules.ts',
  'src/content/team.ts',
  'src/content/recruitment.ts',
  'EXPERIMENT.md',
  'src/content/outcomes.ts',
  'scripts/srm.mjs',
  'scripts/check-frozen.mjs',
  '.github/workflows/ci.yml',
  'package-lock.json',
]

const args = process.argv.slice(2)
const requireTag = args.includes('--require')
const rootArg = args.indexOf('--root')
const root = resolve(rootArg >= 0 ? args[rootArg + 1] : '.')

const git = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const tryGit = (...a) => {
  try {
    return git(...a)
  } catch {
    return null
  }
}

if (tryGit('rev-parse', '--is-inside-work-tree') !== 'true') {
  console.error('Freeze check: not a git checkout, so the freeze cannot be checked.')
  process.exit(2)
}

const tagCommit = tryGit('rev-parse', '--verify', '--quiet', `refs/tags/${TAG}^{commit}`)
if (!tagCommit) {
  if (requireTag) {
    console.error(`Freeze check FAILED: tag ${TAG} does not exist. Production may not start without it (G-4).`)
    process.exit(1)
  }
  console.log(`Freeze check: no ${TAG} tag yet; the measured files are not frozen. (Pass --require at release.)`)
  process.exit(0)
}

const problems = []
const shaPath = join(root, SHA_FILE)
if (existsSync(shaPath)) {
  const pinned = readFileSync(shaPath, 'utf8').trim()
  if (pinned !== tagCommit) problems.push(`${TAG} points at ${tagCommit.slice(0, 12)}, but ${SHA_FILE} pins ${pinned.slice(0, 12)}`)
}
for (const f of FROZEN) {
  if (tryGit('cat-file', '-e', `${tagCommit}:${f}`) === null) problems.push(`${f}: not in ${TAG}`)
}
// Committed or uncommitted differences from the tag (tracked files)…
const diff = tryGit('diff', '--name-only', tagCommit, '--', ...FROZEN)
if (diff === null) problems.push('git diff failed')
else for (const f of diff.split('\n').filter(Boolean)) problems.push(`${f}: differs from ${TAG}`)
// …the index too (a staged change that the working tree no longer shows would still be committed)…
const staged = tryGit('diff', '--cached', '--name-only', tagCommit, '--', ...FROZEN)
if (staged === null) problems.push('git diff --cached failed')
else for (const f of staged.split('\n').filter(Boolean)) problems.push(`${f}: staged change differs from ${TAG}`)
// …and a frozen path that exists but is untracked.
const status = tryGit('status', '--porcelain', '--untracked-files=all', '--', ...FROZEN) ?? ''
for (const line of status.split('\n').filter((l) => l.startsWith('??'))) problems.push(`${line.slice(3)}: untracked`)

if (problems.length) {
  console.error(`Freeze check FAILED (${TAG} = ${tagCommit.slice(0, 12)}):`)
  for (const p of [...new Set(problems)]) console.error(`  ${p}`)
  process.exit(1)
}
console.log(`Freeze check: ok (${FROZEN.length} files identical to ${TAG} = ${tagCommit.slice(0, 12)}).`)
