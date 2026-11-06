/**
 * Instruction decoding (Standard §4): the four forms, operand types, store
 * and branch bytes, and inline text.
 */
import { Bytes, Malformed } from './bytes.js'
import { op0, op1, op2, opExt, opVar, type OpCount, type OpForm, type OpInfo } from './opcodes.js'
import { decodeZchars, readZchars, type TextContext } from './text.js'
import type { Version } from './types.js'

export type OperandKind = 'large' | 'small' | 'variable'

export interface Operand {
  kind: OperandKind
  /** The constant, or the variable number (0 = stack, 1–15 locals, 16–255 globals: §4.2.2). */
  value: number
}

export interface Branch {
  /** Branch when the condition is true (bit 7 of the first branch byte: §4.7). */
  onTrue: boolean
  /** Return false (0) or true (1) instead of jumping (§4.7.1). */
  returns?: boolean
  /** The address jumped to, otherwise. */
  target?: number
}

export interface Instruction {
  address: number
  /** Total bytes, operands, store, branch and text included. */
  length: number
  name: string
  form: OpForm
  count: OpCount
  /** The opcode number within its count (0–31). */
  opcode: number
  operands: Operand[]
  /** The variable the result goes to. */
  store?: number
  branch?: Branch
  /** Inline text (print, print_ret), and where its Z-characters are. */
  text?: { address: number; length: number; text: string }
  /** jump's destination (§15: an offset like a branch's). */
  jumpTarget?: number
  /** What kind of opcode this is (from the opcode table). */
  info: OpInfo
}

const TYPES: OperandKind[] = ['large', 'small', 'variable']

function readTypes(bytes: Bytes, at: number, count: number): (OperandKind | null)[] {
  const out: (OperandKind | null)[] = []
  for (let i = 0; i < count; i++) {
    const b = bytes.byte(at + i)
    for (let shift = 6; shift >= 0; shift -= 2) {
      const t = (b >> shift) & 3
      out.push(t === 3 ? null : TYPES[t]!)
    }
  }
  return out
}

/**
 * Decode the instruction at `address`. Throws Malformed for an opcode that
 * doesn't exist in this version, and OutOfBounds when it runs off the file.
 */
export function decodeInstruction(bytes: Bytes, address: number, version: Version, text: TextContext): Instruction {
  let a = address
  const b = bytes.byte(a++)
  let form: OpForm
  let count: OpCount
  let opcode: number
  let info: OpInfo | undefined
  let kinds: (OperandKind | null)[]

  if (b === 0xbe && version >= 5) {
    // Extended (§4.3.1): 0xbe, the opcode number, then a VAR-style types byte.
    form = 'extended'
    count = 'EXT'
    opcode = bytes.byte(a++)
    info = opExt(opcode, version)
    kinds = readTypes(bytes, a++, 1)
  } else if ((b & 0xc0) === 0xc0) {
    // Variable form (§4.3.3): bit 5 clear = 2OP, set = VAR; types in the next byte(s).
    form = 'variable'
    opcode = b & 0x1f
    if (b & 0x20) {
      count = 'VAR'
      info = opVar(opcode, version)
    } else {
      count = '2OP'
      info = op2(opcode, version)
    }
    const typeBytes = info?.doubleTypes ? 2 : 1
    kinds = readTypes(bytes, a, typeBytes)
    a += typeBytes
  } else if ((b & 0xc0) === 0x80) {
    // Short form (§4.3.2): bits 4–5 are the operand type; 11 means 0OP.
    form = 'short'
    opcode = b & 0x0f
    const t = (b >> 4) & 3
    if (t === 3) {
      count = '0OP'
      info = op0(opcode, version)
      kinds = []
    } else {
      count = '1OP'
      info = op1(opcode, version)
      kinds = [TYPES[t]!]
    }
  } else {
    // Long form (§4.3.4): 2OP; bit 6 and bit 5 give the operands' types, small constant or variable.
    form = 'long'
    count = '2OP'
    opcode = b & 0x1f
    info = op2(opcode, version)
    kinds = [b & 0x40 ? 'variable' : 'small', b & 0x20 ? 'variable' : 'small']
  }
  if (!info) throw new Malformed(`no ${count} opcode ${opcode} in version ${version}`, address)

  // Operands: types run until the first "omitted" (§4.4.3).
  const operands: Operand[] = []
  for (const kind of kinds) {
    if (kind === null) break
    if (kind === 'large') {
      operands.push({ kind, value: bytes.word(a) })
      a += 2
    } else {
      operands.push({ kind, value: bytes.byte(a++) })
    }
  }

  const ins: Instruction = { address, length: 0, name: info.name, form, count, opcode, operands, info }
  if (info.store) ins.store = bytes.byte(a++)
  if (info.branch) {
    // §4.7: bit 7 = branch on true; bit 6 set = one byte, a 6-bit unsigned offset; else a
    // 14-bit signed offset across two bytes. Offsets 0 and 1 return false and true.
    const b1 = bytes.byte(a++)
    let offset: number
    if (b1 & 0x40) offset = b1 & 0x3f
    else {
      const b2 = bytes.byte(a++)
      offset = ((b1 & 0x3f) << 8) | b2
      if (offset & 0x2000) offset -= 0x4000
    }
    ins.branch = { onTrue: !!(b1 & 0x80) }
    if (offset === 0 || offset === 1) ins.branch.returns = offset === 1
    else ins.branch.target = a + offset - 2 // §4.7.2: relative to the address after the branch data
  }
  if (info.text) {
    const { zchars, length } = readZchars(bytes, a)
    ins.text = { address: a, length, text: decodeZchars(text, zchars) }
    a += length
  }
  if (info.name === 'JUMP' && operands[0]?.kind !== 'variable' && operands[0]) {
    // jump's operand is a signed 16-bit offset, relative like a branch's (§15, jump).
    const v = operands[0].value
    const offset = operands[0].kind === 'large' && v & 0x8000 ? v - 0x10000 : v
    ins.jumpTarget = a + offset - 2
  }
  ins.length = a - address
  return ins
}
