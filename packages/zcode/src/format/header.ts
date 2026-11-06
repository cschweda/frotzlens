import type { StoryFile } from '../types.js'
import { Writer, banner, hx, type FormatOptions } from './writer.js'

// Names as infodump prints them (observed by setting each bit of a story's
// header in turn). v3's flags1 opens with the status-line type (bit 1).
const FLAGS1_V3: Record<number, string> = { 3: 'Tandy', 4: 'No status line', 5: 'Windows available', 6: 'Proportional fonts used' }
const FLAGS1_V4: Record<number, string> = { 1: 'Pictures', 2: 'Bold font', 3: 'Emphasis', 4: 'Fixed space font', 7: 'Timed input' }
const FLAGS2_V3: Record<number, string> = { 0: 'Scripting', 1: 'Use fixed font', 4: 'Supports sound' }
const FLAGS2_V4: Record<number, string> = {
  0: 'Scripting', 1: 'Use fixed font', 2: 'Screen refresh required', 3: 'Supports graphics', 4: 'Supports undo',
  5: 'Supports mouse', 6: 'Supports colour', 7: 'Supports sound', 8: 'Supports menus', 10: 'Printer error',
}
/** Terminating characters (§10.5.2.1) by ZSCII code. */
const KEYS: Record<number, string> = {
  129: 'Up arrow', 130: 'Down arrow', 131: 'Left arrow', 132: 'Right arrow',
  ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [133 + i, `F${i + 1}`])),
  ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [145 + i, `KP${i}`])),
  252: 'Menu click', 253: 'Single mouse click', 254: 'Double mouse click', 255: 'Any function key',
}

function flagList(value: number, bits: number, names: Record<number, string>, hexWidth: number): string[] {
  const out: string[] = []
  for (let b = 0; b < bits; b++) {
    if (!(value & (1 << b))) continue
    // Deliberate difference: infodump mislabels v3 flags2 bits 5–8 as the next-lower bit's mask
    // (bit 6 prints as 0x0020); this prints the bit's own mask.
    out.push(names[b] ?? `Unknown (0x${hx(1 << b, hexWidth)})`)
  }
  return out
}

/** infodump's `-i`: the story file header. */
export function formatHeader(story: StoryFile, opts: FormatOptions): string {
  const h = story.header
  const w = new Writer(opts.width)
  banner(w, opts, 'Story file header')
  const line = (label: string, value: string) => w.write(`${`${label}:`.padEnd(26)}${value}\n`)

  let flags1: string[]
  if (h.version <= 3) {
    flags1 = [h.flags1 & 2 ? 'Display time' : 'Display score/moves', ...flagList(h.flags1 & ~3, 8, FLAGS1_V3, 2)]
  } else {
    flags1 = flagList(h.flags1, 8, FLAGS1_V4, 2)
  }
  const flags2 = flagList(h.flags2, 16, h.version <= 3 ? FLAGS2_V3 : FLAGS2_V4, 4)

  line('Z-code version', String(h.version))
  line('Interpreter flags', flags1.length ? flags1.join(', ') : 'None')
  line('Release number', String(h.release))
  line('Size of resident memory', hx(h.highMemory, 4))
  line('Start PC', hx(h.initialPc, 4))
  line('Dictionary address', hx(h.dictionary, 4))
  line('Object table address', hx(h.objects, 4))
  line('Global variables address', hx(h.globals, 4))
  line('Size of dynamic memory', hx(h.staticMemory, 4))
  line('Game flags', flags2.length ? flags2.join(', ') : 'None')
  line('Serial number', h.serial)
  line('Abbreviations address', hx(h.abbreviations, 4))
  line('File size', hx(h.fileLength, 5))
  line('Checksum', hx(h.checksum, 4))

  if (h.version >= 5 && h.terminatingChars) {
    line('Terminating keys address', hx(h.terminatingChars, 4))
    const keys = (h.terminatingKeys ?? []).map(k => KEYS[k] ?? `Unknown key (0x${hx(k, 2)})`)
    w.write(`    Keys used: ${keys.join(', ')}\n`)
  }
  if (h.version >= 5 && h.alphabetTable) {
    line('Alphabet address', hx(h.alphabetTable, 4))
    for (let a = 0; a < 3; a++) {
      let row = ''
      for (let i = 0; i < 26; i++) {
        const c = story.bytes[h.alphabetTable + a * 26 + i] ?? 0
        if (!c) break
        // Deliberate difference: infodump prints these bytes raw; anything outside printable ASCII
        // is '?' here, so a story can't put a terminal escape in our output.
        row += c >= 0x20 && c <= 0x7e ? String.fromCharCode(c) : '?'
      }
      w.write(`    "${row}"\n`)
    }
  }
  if (h.headerExtension) line('Header extension address', hx(h.headerExtension.address, 4))
  // infodump shows 0x3C–0x3F when 0x3C is set (and not a space) and 0x3D isn't a digit.
  const b = story.bytes
  if (b[0x3c] && b[0x3c] !== 0x20 && !(b[0x3d]! >= 0x30 && b[0x3d]! <= 0x39)) {
    let v = ''
    for (let i = 0x3c; i < 0x40 && b[i]; i++) v += b[i]! >= 0x20 && b[i]! <= 0x7e ? String.fromCharCode(b[i]!) : '?'
    line('Inform Version', v)
  }
  if (h.headerExtension) {
    // The length as the table states it, even when the file ends before all of it.
    line('Header extension length', hx(h.headerExtension.declaredLength, 4))
    const unicode = h.headerExtension.words[2]
    if (h.headerExtension.declaredLength >= 3 && unicode !== undefined) line('Unicode table address', hx(unicode, 4))
  }
  return w.toString()
}
