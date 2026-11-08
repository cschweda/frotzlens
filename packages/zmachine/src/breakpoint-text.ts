/**
 * Breakpoints as people type them, for the CLI's --break and the app's Breakpoints view (docs/20
 * §4): `action:Take`, `line:story.inf:42`, `text:"You can't"`, a routine by name (from the
 * symbols, or txd's R0012), or an address (0x27f8).
 */
import type { StoryFile, Symbols } from '@frotzinc/zcode'
import { txdRoutineName } from '@frotzinc/zcode/format'
import type { BreakpointSpec } from './debugger.js'

const hex = (n: number) => n.toString(16).padStart(4, '0')

/** A routine's name: the debug file's, or txd's (R0012). */
export function routineLabel(story: StoryFile, symbols: Symbols | undefined, address: number): string {
  return symbols?.routines[address]?.name ?? txdRoutineName(story, address)
}

/** What `text` asks for, as a breakpoint, or why it can't be one, in words. */
export function parseBreakpoint(text: string, story: StoryFile, symbols: Symbols | undefined): BreakpointSpec | string {
  const t = text.trim()
  const action = /^action:(.+)$/i.exec(t)
  if (action) {
    const want = action[1]!.trim().replace(/^##/, '').toLowerCase()
    const found = Object.entries(symbols?.actions ?? {}).find(([, n]) => n.toLowerCase() === want)
    if (!found) return symbols ? `there's no action called ${action[1]}` : `action breakpoints need names (the story's debug file)`
    return { kind: 'action', action: Number(found[0]) }
  }
  const line = /^line:(.+):(\d+)$/i.exec(t)
  if (line) return symbols?.lines?.length ? { kind: 'line', file: line[1]!, line: Number(line[2]) } : 'line breakpoints need the debug file'
  const printed = /^text:(.+)$/i.exec(t)
  if (printed) return { kind: 'text', text: printed[1]!.replace(/^"(.*)"$/, '$1') }
  if (/^0x[0-9a-f]+$/i.test(t)) {
    const a = parseInt(t.slice(2), 16)
    if (story.code.routines.some(r => r.address === a)) return { kind: 'routine', routine: a }
    if (story.code.routines.some(r => r.instructions.some(i => i.address === a))) return { kind: 'address', address: a }
    return `there's no routine or instruction at ${t}`
  }
  const want = t.toLowerCase()
  for (const r of Object.values(symbols?.routines ?? {})) if (r.name.toLowerCase() === want) return { kind: 'routine', routine: r.address }
  const r = story.code.routines.find(x => txdRoutineName(story, x.address).toLowerCase() === want)
  if (r) return { kind: 'routine', routine: r.address }
  return `there's no routine '${t}' in this story${symbols ? '' : ' (names from the source need the debug file)'}`
}

/** A breakpoint in words: "action Take", "line story.inf:42", "ScoreTimer". */
export function describeBreakpoint(b: BreakpointSpec, story: StoryFile, symbols: Symbols | undefined): string {
  const objectName = (o: number) => symbols?.objects[o] ?? (story.objects.objects[o - 1]?.shortName.text || `object ${o}`)
  switch (b.kind) {
    case 'routine': return routineLabel(story, symbols, b.routine)
    case 'address': return hex(b.address)
    case 'action': return `action ${symbols?.actions[b.action] ?? b.action}`
    case 'line': return `line ${b.file}:${b.line}`
    case 'text': return `text "${b.text}"`
    case 'write': return `write ${hex(b.address)}${b.length && b.length > 1 ? `+${b.length}` : ''}`
    case 'property': return `${objectName(b.object)}.${symbols?.properties[b.property] ?? b.property}`
    case 'attribute': return `${objectName(b.object)} has ${symbols?.attributes[b.attribute] ?? b.attribute}`
  }
}
