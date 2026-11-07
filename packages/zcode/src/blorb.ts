/**
 * Blorb (the IF resource container, Blorb spec 2.0): an IFF `FORM` of type
 * `IFRS` holding the story (a `ZCOD` chunk), pictures, sounds and metadata.
 * We unwrap the story and list the rest; nothing here throws.
 */
import { decodeEntities } from './xml.js'

/** One chunk of the FORM, in file order. */
export interface BlorbChunk {
  /** The chunk's four-character type: `ZCOD`, `PNG `, `JPEG`, `IFmd`, … */
  type: string
  /** Where its 8-byte header (type, length) starts. */
  offset: number
  /** The data's length, without the header or the pad byte. */
  length: number
}

/** A resource-index entry (`RIdx`, spec §2.3): what a chunk is used as. */
export interface BlorbResource {
  /** `Exec` (the story), `Pict`, `Snd ` or `Data`. */
  usage: string
  number: number
  /** The chunk's header offset. */
  offset: number
  /** That chunk's type, when the offset is a chunk this file has. */
  type?: string
}

export interface Blorb {
  chunks: BlorbChunk[]
  resources: BlorbResource[]
  /** Where the story's data starts in the Blorb file (its `ZCOD` chunk's data). */
  storyOffset?: number
  /** `Fspc`: the Pict resource number of the cover picture. */
  frontispiece?: number
  /** `IFmd`: the iFiction metadata (XML), as text. */
  metadata?: string
  /** From the metadata's `<bibliographic>`, when present. */
  title?: string
  author?: string
}

const tag = (d: Uint8Array, o: number) => String.fromCharCode(d[o]!, d[o + 1]!, d[o + 2]!, d[o + 3]!)
const u32 = (d: Uint8Array, o: number) => ((d[o]! << 24) >>> 0) + (d[o + 1]! << 16) + (d[o + 2]! << 8) + d[o + 3]!

/** A Blorb file is an IFF FORM of type IFRS (Blorb spec §2). */
export function isBlorb(data: Uint8Array): boolean {
  return data.length >= 12 && tag(data, 0) === 'FORM' && tag(data, 8) === 'IFRS'
}

/** UTF-8 to text (iFiction is UTF-8); a malformed sequence becomes U+FFFD. */
export function utf8(b: Uint8Array): string {
  let out = ''
  for (let i = 0; i < b.length; ) {
    const c = b[i]!
    const n = c < 0x80 ? 0 : c >= 0xc2 && c < 0xe0 ? 1 : c >= 0xe0 && c < 0xf0 ? 2 : c >= 0xf0 && c < 0xf5 ? 3 : -1
    let cp = n === 0 ? c : n === 1 ? c & 0x1f : n === 2 ? c & 0x0f : c & 0x07
    let ok = n >= 0 && i + n < b.length + (n === 0 ? 1 : 0)
    for (let k = 1; ok && k <= n; k++) {
      const d = b[i + k]!
      if ((d & 0xc0) !== 0x80) ok = false
      else cp = (cp << 6) | (d & 0x3f)
    }
    if (ok && n > 0 && (cp < [0, 0x80, 0x800, 0x10000][n]! || cp > 0x10ffff || (cp >= 0xd800 && cp < 0xe000))) ok = false
    out += ok ? String.fromCodePoint(cp) : '\ufffd'
    i += ok ? n + 1 : 1
  }
  return out
}

/** A text element's content inside `<bibliographic>`, decoded; the first one only. */
function bibliographic(xml: string, element: string): string | undefined {
  const bib = /<bibliographic>([\s\S]*?)<\/bibliographic>/.exec(xml)?.[1]
  const m = bib && new RegExp(`<${element}>([\\s\\S]*?)</${element}>`).exec(bib)
  return m ? decodeEntities(m[1]!.trim()) : undefined
}

/**
 * The FORM's chunks and index, and where the story is. `problems` gets a line
 * for each thing that doesn't fit the spec (a chunk running past the end, an
 * index entry naming no chunk); what could be read still comes back.
 */
export function readBlorb(data: Uint8Array, problems: string[] = []): Blorb {
  const blorb: Blorb = { chunks: [], resources: [] }
  // The FORM's own length bounds the chunks; a file cut short is bounded by its size.
  const formEnd = Math.min(data.length, 8 + u32(data, 4))
  if (formEnd < 8 + u32(data, 4)) problems.push(`The FORM says ${u32(data, 4) + 8} bytes; the file has ${data.length}.`)
  let o = 12
  for (; o + 8 <= formEnd; ) {
    const type = tag(data, o)
    const length = u32(data, o + 4)
    if (o + 8 + length > formEnd) {
      problems.push(`The ${type.trim()} chunk at ${o.toString(16)} runs past the end of the file.`)
      o = formEnd
      break
    }
    blorb.chunks.push({ type, offset: o, length })
    o += 8 + length + (length & 1) // chunks are padded to an even length
  }
  // What's left should be nothing: a partial chunk header, or an odd last chunk with no pad byte, isn't.
  if (formEnd < 12) problems.push('The FORM is too short to hold its type.')
  else if (o > formEnd) problems.push('The last chunk has an odd length and no pad byte after it.')
  else if (o < formEnd) problems.push(`${formEnd - o} byte${formEnd - o === 1 ? '' : 's'} at the end of the FORM ${formEnd - o === 1 ? 'is' : 'are'} not a chunk.`)
  const byOffset = new Map(blorb.chunks.map(c => [c.offset, c]))
  const chunk = (type: string) => blorb.chunks.find(c => c.type === type)

  const index = chunk('RIdx')
  if (index && index.length >= 4) {
    const declared = u32(data, index.offset + 8)
    const room = Math.floor((index.length - 4) / 12)
    if (declared > room) problems.push(`The resource index says ${declared} entries; it has room for ${room}.`)
    const count = Math.min(declared, room)
    for (let i = 0; i < count; i++) {
      const at = index.offset + 12 + i * 12
      const r: BlorbResource = { usage: tag(data, at), number: u32(data, at + 4), offset: u32(data, at + 8) }
      const c = byOffset.get(r.offset)
      if (c) r.type = c.type
      else problems.push(`Resource ${r.usage.trim()} ${r.number} points at ${r.offset.toString(16)}, which isn't a chunk.`)
      blorb.resources.push(r)
    }
  }

  // The story: the index's Exec 0 when it names a ZCOD chunk; otherwise the first ZCOD chunk.
  const exec = blorb.resources.find(r => r.usage === 'Exec' && r.number === 0)
  const story = (exec && byOffset.get(exec.offset)?.type === 'ZCOD' ? byOffset.get(exec.offset) : undefined) ?? chunk('ZCOD')
  if (story) blorb.storyOffset = story.offset + 8

  const fspc = chunk('Fspc')
  if (fspc && fspc.length >= 4) blorb.frontispiece = u32(data, fspc.offset + 8)
  const meta = chunk('IFmd')
  if (meta) {
    const xml = utf8(data.subarray(meta.offset + 8, meta.offset + 8 + meta.length))
    blorb.metadata = xml
    const title = bibliographic(xml, 'title')
    const author = bibliographic(xml, 'author')
    if (title) blorb.title = title
    if (author) blorb.author = author
  }
  return blorb
}

/** The story chunk's bytes, or undefined when the Blorb has none (e.g. a Glulx game's). */
export function blorbStory(data: Uint8Array, blorb: Blorb): Uint8Array | undefined {
  if (blorb.storyOffset === undefined) return undefined
  const c = blorb.chunks.find(x => x.offset + 8 === blorb.storyOffset)!
  return data.subarray(blorb.storyOffset, blorb.storyOffset + c.length)
}
