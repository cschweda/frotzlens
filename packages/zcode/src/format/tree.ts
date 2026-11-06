import type { StoryFile } from '../types.js'
import { Writer, banner, dec, type FormatOptions } from './writer.js'

/** infodump's `-t`: the object tree, roots (parent 0) in object order, ` . ` per level. */
export function formatTree(story: StoryFile, opts: FormatOptions): string {
  const w = new Writer(opts.width)
  banner(w, opts, 'Object tree')
  const objs = story.objects.objects
  const byNumber = (n: number) => objs[n - 1]
  const seen = new Set<number>()
  const walk = (n: number, depth: number) => {
    // Follow child, then each sibling; a cycle in a corrupt file stops at the first repeat.
    for (let c = n; c && byNumber(c) && !seen.has(c); c = byNumber(c)!.sibling) {
      seen.add(c)
      const o = byNumber(c)!
      w.write(`${' . '.repeat(depth)}[${dec(o.number, 3)}] "${o.shortName.text}"\n`)
      if (o.child) walk(o.child, depth + 1)
    }
  }
  for (const o of objs) {
    if (o.parent === 0 && !seen.has(o.number)) {
      seen.add(o.number)
      w.write(`[${dec(o.number, 3)}] "${o.shortName.text}"\n`)
      if (o.child) walk(o.child, 1)
    }
  }
  return w.toString()
}
