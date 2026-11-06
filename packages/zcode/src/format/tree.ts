import type { StoryFile } from '../types.js'
import { Writer, banner, dec, type FormatOptions } from './writer.js'

/**
 * infodump's `-t`: the object tree. Roots (parent 0) in object order, then
 * each object's children by child → sibling links, ` . ` per level. Walked
 * with an explicit stack, so even a 65,535-deep chain can't overflow the call
 * stack; an object already printed (a cycle in a corrupt file) is skipped.
 */
export function formatTree(story: StoryFile, opts: FormatOptions): string {
  const w = new Writer(opts.width)
  banner(w, opts, 'Object tree')
  const objs = story.objects.objects
  const at = (n: number) => objs[n - 1]
  const seen = new Set<number>()
  for (const root of objs) {
    if (root.parent !== 0 || seen.has(root.number)) continue
    // Each frame: the next object to print at this depth (0 = this level is done).
    const stack: { next: number; depth: number }[] = [{ next: root.number, depth: 0 }]
    while (stack.length) {
      const top = stack.at(-1)!
      const o = top.next ? at(top.next) : undefined
      if (!o || seen.has(o.number) || (top.depth === 0 && o.number !== root.number)) {
        stack.pop()
        continue
      }
      seen.add(o.number)
      w.write(`${' . '.repeat(top.depth)}[${dec(o.number, 3)}] "${o.shortName.text}"\n`)
      // Roots print alone; their siblings are other roots, reached by the outer loop.
      top.next = top.depth === 0 ? 0 : o.sibling
      if (o.child) stack.push({ next: o.child, depth: top.depth + 1 })
    }
  }
  return w.toString()
}
