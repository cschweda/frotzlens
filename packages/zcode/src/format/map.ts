/**
 * infodump's `-m`: the story file map — each table's [base, end] and size,
 * every gap between them as an unlabelled row. Learned from its output.
 */
import type { StoryFile } from '../types.js'
import { Writer, hx, type FormatOptions } from './writer.js'

interface Row {
  base: number
  /** One past the last byte. */
  end: number
  label: string
}

/** The rows infodump labels, by what this story has. */
function rows(story: StoryFile): Row[] {
  const { header: h, objects, dictionary: d, grammar: g } = story
  const word = (a: number) => ((story.bytes[a] ?? 0) << 8) | (story.bytes[a + 1] ?? 0)
  const out: Row[] = [{ base: 0, end: 0x40, label: 'Story file header' }]
  if (h.abbreviations) {
    // The abbreviation strings come first, from the end of the header to the pointer table.
    if (h.abbreviations > 0x40) out.push({ base: 0x40, end: h.abbreviations, label: 'Abbreviation data' })
    out.push({ base: h.abbreviations, end: h.abbreviations + 192, label: 'Abbreviation pointer table' })
  }
  if (h.headerExtension) {
    out.push({ base: h.headerExtension.address, end: h.headerExtension.address + 2 * (h.headerExtension.declaredLength + 1), label: 'Header extension table' })
  }
  const objectsEnd = objects.address + 2 * objects.propertyDefaults.length + objects.objects.length * (h.version <= 3 ? 9 : 14)
  out.push({ base: objects.address, end: objectsEnd, label: 'Object table' })
  const memorySeg = story.memory.segments.find(s => s.kind === 'properties')
  if (memorySeg) {
    out.push({ base: memorySeg.start, end: memorySeg.end, label: 'Property data' })
    if (h.inform) {
      // Inform's identifier tables follow the property data: the class-prototype object numbers
      // (words, ended by 0), the property names (a count word: the table is that many words), and
      // one word per attribute.
      let a = memorySeg.end
      const classes = a
      while (a < story.bytes.length && word(a) !== 0) a += 2
      a += 2
      out.push({ base: classes, end: a, label: 'Class Prototype Object Numbers' })
      const names = word(a)
      out.push({ base: a, end: a + 2 * names, label: 'Property Names Table' })
      a += 2 * names
      const attrs = h.version <= 3 ? 32 : 48
      out.push({ base: a, end: a + 2 * attrs, label: 'Attribute Names Table' })
    }
  }
  out.push({ base: h.globals, end: h.globals + 480, label: 'Global variables' })
  if (g) {
    out.push({ base: g.tables.pointers[0], end: g.tables.pointers[1], label: 'Grammar pointer table' })
    out.push({ base: g.tables.data[0], end: g.tables.data[1], label: 'Grammar data' })
    out.push({ base: g.tables.actions[0], end: g.tables.actions[1], label: 'Action routine table' })
    if (g.version === 1) {
      if (g.tables.parsingRoutines) out.push({ base: g.tables.parsingRoutines[0], end: g.tables.parsingRoutines[1], label: 'Parsing routine table' })
      out.push({ base: g.tables.prepositions[0], end: g.tables.prepositions[1], label: 'Preposition table' })
    }
  }
  const dictEnd = d.entries.length ? d.entries.at(-1)!.address + d.entryLength : d.address + 4 + d.separators.length
  out.push({ base: d.address, end: dictEnd, label: 'Dictionary' })
  out.push({ base: h.highMemory, end: h.fileLength || story.bytes.length, label: 'Paged memory' })
  return out.filter(r => r.end > r.base).sort((a, b) => a.base - b.base)
}

export function formatMap(story: StoryFile, opts: FormatOptions): string {
  const w = new Writer(opts.width)
  if (!opts.continuation) w.write(`\nStory file is ${opts.fileName.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '?')}\n`)
  // infodump puts Inform's compiler version, digits only, above the map.
  if (story.header.inform) w.write(`Inform Version: ${story.header.inform.compilerVersion.replace('.', '')}\n`)
  w.write('\n    **** Story file map ****\n\n Base    End   Size\n')
  const row = (base: number, end: number, label: string) =>
    w.write(`${hx(base, 1).padStart(5)}  ${hx(end - 1, 1).padStart(5)}  ${hx(end - base, 1).padStart(5)}${label ? `  ${label}` : ''}\n`)
  let at = 0
  for (const r of rows(story)) {
    if (r.base > at) row(at, r.base, '')
    row(r.base, r.end, r.label)
    at = Math.max(at, r.end)
  }
  return w.toString()
}
