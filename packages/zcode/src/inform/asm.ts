/**
 * One routine as Inform 6 assembly (DM4 §42): every instruction as `@opcode operands -> store ?label;`,
 * which the compiler turns back into the same bytes. Values are written as what they are where
 * that's known (a routine's name, a string, a dictionary word), so they survive the story being laid
 * out differently; otherwise as the number.
 */
import type { Instruction, Operand } from '../decode.js'
import type { Routine } from '../routines.js'
import type { Version } from '../types.js'

export interface AsmNames {
  version: Version
  /** sp, a local's name or a global's. */
  variable: (n: number) => string
  /** A packed routine address as the routine's name, when it has one Inform can refer to. */
  routine: (packed: number) => string | undefined
  /** A packed string address as a string literal. */
  string: (packed: number) => string | undefined
  /** Any other constant: a dictionary word, an array, or the number. `large` when it was stored in two bytes. */
  value: (n: number, large: boolean) => string
  /** Inline text (print, print_ret) as a string literal. */
  stringLiteral: (text: string) => string
  /** `##Take` for an action number, compared with a variable that holds actions (`action`, `sw__var`). */
  action?: (variable: number, n: number) => string | undefined
  /** `##Take` for an action number passed to R_Process (what `<Take lamp>` compiles to). */
  actionArgument?: (routinePacked: number, n: number) => string | undefined
}

/** Opcodes whose first operand names a variable rather than reading one (§14.2.3). */
const VARIABLE_REFERENCE = new Set(['INC', 'DEC', 'INC_CHK', 'DEC_CHK', 'STORE', 'LOAD', 'PULL'])

/** The Standard's names where Inform's assembler spells them differently. */
function opcodeName(i: Instruction, version: Version): string {
  if (i.name === 'READ') return version <= 4 ? 'sread' : 'aread' // v5's stores a result; v1-4's doesn't
  if (i.name === 'CALL') return 'call_vs'
  return i.name.toLowerCase()
}

function operandText(i: Instruction, op: Operand, index: number, n: AsmNames): string {
  if (VARIABLE_REFERENCE.has(i.name) && index === 0) {
    return op.kind === 'variable' ? `[${n.variable(op.value)}]` : n.variable(op.value)
  }
  if (op.kind === 'variable') return n.variable(op.value)
  // An action compared with the action (je action 23): the compiler numbers an action when it first
  // sees it, so writing it as ##Take keeps the numbering the original had.
  const first = i.operands[0]
  if (i.name === 'JE' && index > 0 && first?.kind === 'variable' && n.action) {
    const a = n.action(first.value, op.value)
    if (a) return a
  }
  if (i.info.call && index === 1 && first && first.kind !== 'variable' && n.actionArgument) {
    const a = n.actionArgument(first.value, op.value)
    if (a) return a
  }
  if (i.info.call && index === 0 && op.value) {
    const name = n.routine(op.value)
    if (name) return name
  }
  if (i.name === 'PRINT_PADDR' && index === 0) {
    const s = n.string(op.value)
    if (s) return s
  }
  return n.value(op.value, op.kind === 'large')
}

/** The routine's branch and jump targets, labelled in address order. */
export function routineLabels(r: Routine): Map<number, string> {
  const targets = new Set<number>()
  for (const i of r.instructions) {
    if (i.jumpTarget !== undefined) targets.add(i.jumpTarget)
    if (i.branch?.target !== undefined) targets.add(i.branch.target)
  }
  return new Map([...targets].sort((a, b) => a - b).map((t, k) => [t, `L${k + 1}`]))
}

export function instructionText(i: Instruction, labels: Map<number, string>, n: AsmNames): string {
  const parts = [`@${opcodeName(i, n.version)}`]
  if (i.name === 'JUMP' && i.jumpTarget !== undefined) parts.push(labels.get(i.jumpTarget) ?? String(i.jumpTarget))
  else i.operands.forEach((op, k) => parts.push(operandText(i, op, k, n)))
  if (i.text) parts.push(n.stringLiteral(i.text.text))
  if (i.store !== undefined) parts.push(`-> ${n.variable(i.store)}`)
  if (i.branch) {
    const not = i.branch.onTrue ? '' : '~'
    const to = i.branch.returns !== undefined ? (i.branch.returns ? 'rtrue' : 'rfalse') : labels.get(i.branch.target!) ?? String(i.branch.target)
    parts.push(`?${not}${to}`)
  }
  return `${parts.join(' ')};`
}

/** The routine's body: its instructions, four spaces in, and its labels, two. */
export function routineBody(r: Routine, n: AsmNames): string[] {
  const labels = routineLabels(r)
  const out: string[] = []
  for (const i of r.instructions) {
    const label = labels.get(i.address)
    if (label) out.push(`  .${label};`)
    out.push(`    ${instructionText(i, labels, n)}`)
  }
  return out
}
