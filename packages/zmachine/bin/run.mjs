#!/usr/bin/env node
/**
 * Play a story from a command script and print each turn's normalized text:
 *   zmachine-run story.z5 script.txt [--seed N] [--zvm]
 * The script is one command per line (or several separated by '.'); '!' lines are comments.
 * --zvm writes the header exactly as ZVM does (for comparing with it).
 */
import { readFileSync } from 'node:fs'
import { play } from '../dist/index.js'

const args = process.argv.slice(2)
const flag = name => {
  const i = args.indexOf(name)
  return i >= 0 ? args.splice(i, 2)[1] : undefined
}
const seed = Number(flag('--seed') ?? 1)
const zvm = args.includes('--zvm')
const [storyPath, scriptPath] = args.filter(a => !a.startsWith('--'))
if (!storyPath) {
  console.error('usage: zmachine-run story.z5 [script.txt] [--seed N] [--zvm]')
  process.exit(2)
}
const commands = scriptPath
  ? readFileSync(scriptPath, 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('!')).flatMap(l => l.split('.')).map(c => c.trim().replace(/^>\s*/, '')).filter(Boolean)
  : []
const result = play(new Uint8Array(readFileSync(storyPath)), commands, { seed, header: zvm ? { profile: 'zvm' } : {} })
for (const t of result.turns) {
  if (t.command) console.log(`> ${t.command}`)
  console.log(t.output)
  console.log()
}
if (result.stoppedBy && typeof result.stoppedBy === 'object') {
  console.error(`stopped: ${result.stoppedBy.code}: ${result.stoppedBy.message}`)
  process.exit(1)
}
