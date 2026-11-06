import type { StoryFile } from '../types.js'
import { Writer, banner, dec, hx, type FormatOptions } from './writer.js'

/** infodump's `-o`: every object with its attributes, links and properties. */
export function formatObjects(story: StoryFile, opts: FormatOptions): string {
  const w = new Writer(opts.width)
  banner(w, opts, 'Objects')
  const objs = story.objects.objects
  w.write(`  Object count = ${objs.length}\n`)
  for (const o of objs) {
    w.write('\n')
    w.write(`${dec(o.number, 3)}. Attributes: ${o.attributes.length ? o.attributes.join(', ') : 'None'}\n`)
    w.write(`     Parent object: ${dec(o.parent, 3)}  Sibling object: ${dec(o.sibling, 3)}  Child object: ${dec(o.child, 3)}\n`)
    w.write(`     Property address: ${hx(o.propertyTable, 4)}\n`)
    w.write(`         Description: "${o.shortName.text}"\n`)
    w.write('          Properties:\n')
    for (const p of o.properties) {
      w.write(`              [${dec(p.number, 2)}] ${[...p.data].map(b => `${hx(b, 2)} `).join('')}\n`)
    }
  }
  return w.toString()
}
