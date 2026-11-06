import type { StoryFile } from '../types.js'
import { Writer, banner, dec, type FormatOptions } from './writer.js'

/**
 * infodump's `-d`: separators, count, and the words in columns. Each cell is
 * `[nnnn] word` padded to the entry length, plus a space; as many cells per
 * row as fit in 80 columns (observed: 4 for 9-byte v5 entries, 5 for 7-byte v3).
 */
export function formatDictionary(story: StoryFile, opts: FormatOptions): string {
  const w = new Writer(opts.width)
  banner(w, opts, 'Dictionary')
  const d = story.dictionary
  w.write(`  Word separators = "${d.separators.join('')}"\n`)
  w.write(`  Word count = ${d.entries.length}, word size = ${d.entryLength}\n`)
  w.write('\n')
  const cell = 7 + d.entryLength + 1
  const perRow = Math.max(1, Math.floor(80 / cell))
  for (let i = 0; i < d.entries.length; i += perRow) {
    const row = d.entries.slice(i, i + perRow).map(e => `[${dec(e.index, 4)}] ${e.word.padEnd(d.entryLength)} `)
    w.write(`${row.join('')}\n`)
  }
  return w.toString()
}
