#!/usr/bin/env node
/**
 * Upgrade A: prints one tagged link per channel and the message templates for a deployed URL (35 §4–§5).
 *
 *   npm run links -- https://your-production-url
 *
 * It prints text only: it sends nothing, posts nothing and counts nothing. Use the Production URL only after the
 * Production experiment has started (G-1 to G-6 and A-5); before that, only the pledge message goes out.
 */
import { loadTs } from './load-ts.mjs'

const url = process.argv[2]
if (!url || !/^https:\/\/[^\s/]+/.test(url)) {
  console.error('Usage: npm run links -- https://your-production-url   (https only)')
  process.exit(1)
}
const [r] = await loadTs('/src/content/recruitment.ts')

console.log('Tagged links (one per channel; the tag is a channel name, never a person)\n')
for (const c of r.CHANNELS) console.log(`  ${c.tag.padEnd(10)} ${r.tagged(url, c.tag)}   ${c.name}`)
console.log('\nTemplates\n')
for (const t of r.TEMPLATES) {
  console.log(`  [${t.id}] ${t.when}${t.reveals ? '  (REVEALS THE EXPERIMENT: only after the final refresh)' : ''}`)
  console.log(`  ${t.reveals ? t.text('<link to the README Results section>') : t.text(r.tagged(url, t.id === 'drill' ? 'team' : '<tag>'))}\n`)
}
console.log('Recruitment kit (adapt freely; keep it spoiler-free)\n')
for (const [k, v] of Object.entries(r.KIT)) console.log(`  [${k}] ${typeof v === 'function' ? v(r.tagged(url, '<tag>')) : v}\n`)
console.log('Never: ' + r.NEVER.join('; ') + '.')
