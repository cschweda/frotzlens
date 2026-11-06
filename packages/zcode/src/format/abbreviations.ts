import type { StoryFile } from '../types.js'
import { Writer, banner, dec, type FormatOptions } from './writer.js'

/** infodump's `-a`: the 96 abbreviations, `[nn] "text"`. */
export function formatAbbreviations(story: StoryFile, opts: FormatOptions): string {
  const w = new Writer(opts.width)
  banner(w, opts, 'Abbreviations')
  story.abbreviations.forEach((a, i) => w.write(`[${dec(i, 2)}] "${a.text}"\n`))
  return w.toString()
}
