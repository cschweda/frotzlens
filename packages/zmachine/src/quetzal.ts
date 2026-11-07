/**
 * Quetzal 1.4 (the Z-machine's standard save format, Martin Frost): an IFF `FORM` of type `IFZS`
 * with `IFhd` (which story, and the PC), `CMem` or `UMem` (dynamic memory), and `Stks` (the
 * frames). Written the way ZVM writes it, so a save from either interpreter restores in the other.
 */
import type { Frame } from './types.js'

export interface QuetzalState {
  release: number
  serial: Uint8Array
  checksum: number
  /** The save instruction's store byte (v4+) or branch byte (v3): §5.8 of the Quetzal spec. */
  pc: number
  /** The whole dynamic memory, as saved. */
  dynamic: Uint8Array
  frames: Frame[]
}

const fourCC = (s: string) => [...s].map(c => c.charCodeAt(0))

function chunk(type: string, data: ArrayLike<number>): number[] {
  const n = data.length
  const out = [...fourCC(type), (n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff, ...Array.from(data)]
  if (n % 2) out.push(0) // chunks are padded to an even length (IFF)
  return out
}

/** Dynamic memory XORed with the original, zero runs as `0, n − 1` (n ≤ 256), trailing zeros left out. */
export function compressMemory(dynamic: Uint8Array, original: Uint8Array): number[] {
  const out: number[] = []
  let zeros = 0
  for (let i = 0; i < dynamic.length; i++) {
    const b = dynamic[i]! ^ original[i]!
    if (b === 0) {
      if (++zeros === 256) {
        out.push(0, 255)
        zeros = 0
      }
    } else {
      if (zeros) {
        out.push(0, zeros - 1)
        zeros = 0
      }
      out.push(b)
    }
  }
  return out
}

export function decompressMemory(data: Uint8Array, original: Uint8Array): Uint8Array {
  const out = original.slice()
  let j = 0
  for (let i = 0; i < data.length; ) {
    const b = data[i++]!
    if (b === 0) j += 1 + (data[i++] ?? 0)
    else {
      if (j >= out.length) throw new Error('its memory runs past the end of dynamic memory')
      out[j] = b ^ original[j]!
      j++
    }
  }
  if (j > out.length) throw new Error('its memory runs past the end of dynamic memory')
  return out
}

function stacks(frames: Frame[]): number[] {
  const out: number[] = []
  frames.forEach((f, i) => {
    // The first frame is the dummy one for the main routine (§Quetzal 4.11): no locals, no result.
    const discard = i > 0 && f.storeVariable === null
    out.push((f.returnPC >> 16) & 0xff, (f.returnPC >> 8) & 0xff, f.returnPC & 0xff)
    out.push((f.locals.length & 0x0f) | (discard ? 0x10 : 0))
    out.push(f.storeVariable ?? 0)
    out.push((1 << Math.min(f.argCount, 7)) - 1)
    out.push((f.evalStack.length >> 8) & 0xff, f.evalStack.length & 0xff)
    for (const w of [...f.locals, ...f.evalStack]) out.push((w >> 8) & 0xff, w & 0xff)
  })
  return out
}

function readStacks(data: Uint8Array): Frame[] {
  const frames: Frame[] = []
  const word = (i: number) => (data[i]! << 8) | data[i + 1]!
  for (let i = 0; i < data.length; ) {
    if (i + 8 > data.length) throw new Error('its stack chunk ends in the middle of a frame')
    const returnPC = (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!
    const flags = data[i + 3]!
    const variable = data[i + 4]!
    const args = data[i + 5]!
    const evalCount = word(i + 6)
    const nLocals = flags & 0x0f
    i += 8
    if (i + (nLocals + evalCount) * 2 > data.length) throw new Error('its stack chunk ends in the middle of a frame')
    const locals: number[] = []
    for (let k = 0; k < nLocals; k++, i += 2) locals.push(word(i))
    const evalStack: number[] = []
    for (let k = 0; k < evalCount; k++, i += 2) evalStack.push(word(i))
    let argCount = 0
    while (argCount < 7 && args & (1 << argCount)) argCount++
    frames.push({ returnPC, locals, evalStack, storeVariable: frames.length === 0 || flags & 0x10 ? null : variable, argCount })
  }
  if (!frames.length) throw new Error('its stack chunk is empty')
  return frames
}

/** A Quetzal file for this state. */
export function writeQuetzal(s: QuetzalState, original: Uint8Array): Uint8Array {
  const ifhd = [(s.release >> 8) & 0xff, s.release & 0xff, ...s.serial, (s.checksum >> 8) & 0xff, s.checksum & 0xff, (s.pc >> 16) & 0xff, (s.pc >> 8) & 0xff, s.pc & 0xff]
  const body = [...fourCC('IFZS'), ...chunk('IFhd', ifhd), ...chunk('CMem', compressMemory(s.dynamic, original)), ...chunk('Stks', stacks(s.frames))]
  const n = body.length
  return Uint8Array.from([...fourCC('FORM'), (n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff, ...body])
}

/** Read a Quetzal file; `original` is the story's dynamic memory as it starts. Throws an Error that says what's wrong, in words. */
export function readQuetzal(bytes: Uint8Array, original: Uint8Array): QuetzalState {
  const str = (i: number) => String.fromCharCode(bytes[i]!, bytes[i + 1]!, bytes[i + 2]!, bytes[i + 3]!)
  const u32 = (i: number) => ((bytes[i]! << 24) | (bytes[i + 1]! << 16) | (bytes[i + 2]! << 8) | bytes[i + 3]!) >>> 0
  if (bytes.length < 12 || str(0) !== 'FORM' || str(8) !== 'IFZS') throw new Error('this isn’t a Z-machine save file (Quetzal)')
  const end = Math.min(bytes.length, 8 + u32(4))
  let ifhd: Uint8Array | null = null
  let memory: Uint8Array | null = null
  let compressed = true
  let stks: Uint8Array | null = null
  for (let i = 12; i + 8 <= end; ) {
    const type = str(i)
    const n = u32(i + 4)
    const data = bytes.subarray(i + 8, i + 8 + n)
    if (data.length < n) throw new Error('the file is cut short')
    if (type === 'IFhd') ifhd = data
    else if (type === 'CMem' || type === 'UMem') {
      memory = data
      compressed = type === 'CMem'
    } else if (type === 'Stks') stks = data
    i += 8 + n + (n % 2)
  }
  if (!ifhd || ifhd.length < 13) throw new Error('it has no story header (IFhd)')
  if (!memory) throw new Error('it has no memory (CMem or UMem)')
  if (!stks) throw new Error('it has no stack (Stks)')
  let dynamic: Uint8Array
  if (compressed) dynamic = decompressMemory(memory, original)
  else {
    if (memory.length !== original.length) throw new Error('its memory is the wrong size for this story')
    dynamic = memory.slice()
  }
  return {
    release: (ifhd[0]! << 8) | ifhd[1]!,
    serial: ifhd.slice(2, 8),
    checksum: (ifhd[8]! << 8) | ifhd[9]!,
    pc: (ifhd[10]! << 16) | (ifhd[11]! << 8) | ifhd[12]!,
    dynamic,
    frames: readStacks(stks),
  }
}
