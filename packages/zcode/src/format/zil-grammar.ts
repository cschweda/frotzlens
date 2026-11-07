/**
 * ZIL's syntax tables as text: each verb, its words and its lines, as infodump lays out a grammar,
 * each line written the way its <SYNTAX> form reads (LOOK AT OBJECT (FIND 26) (TAKE IN-ROOM
 * CARRIED)). This is frotzlens's own text: Ztools can't read ZILF's tables, so there's no output of
 * theirs to match. FIND flags are attribute numbers (the names aren't in the story); search options
 * are named by the library's flags when known (zillib's, or Infocom's), else hex.
 */
import type { StoryFile } from '../types.js'
import type { ZilGrammar, ZilSyntaxLine } from '../zil-grammar.js'
import { wrapIndented } from './txd.js'
import { Writer, banner, dec, hx, type FormatOptions } from './writer.js'

const oneLine = (s: string) => s.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '?')

/** Search options as their names, lowest bit first; bits with no name in hex. */
export function zilOptions(grammar: ZilGrammar, bits: number): string {
  const names: string[] = []
  let left = bits
  for (const [bit, name] of Object.entries(grammar.searchFlags).map(([b, n]) => [Number(b), n] as const).sort((a, b) => a[0] - b[0])) {
    if (bits & bit) {
      names.push(name)
      left &= ~bit
    }
  }
  if (left) names.push(`#${hx(left, 2)}`)
  return names.join(' ')
}

/** A preposition's word (the first one with its number), or #nn when no word has the number. */
export function zilPreposition(grammar: ZilGrammar, n: number): string {
  const w = grammar.prepositions.find(p => p.number === n)?.words[0]
  return w ? oneLine(w).toUpperCase() : `#${dec(n, 1)}`
}

/** The word a verb's lines are written with: its longest (LOOK, not L), the first of equals. */
export function zilVerbWord(verb: { number: number; words: string[] }): string {
  return verb.words.reduce<string | undefined>((best, w) => (!best || w.length > best.length ? w : best), undefined) ?? `verb ${verb.number}`
}

/** One syntax line, the way its <SYNTAX> form reads, without the action. */
export function zilLineText(grammar: ZilGrammar, verb: string, line: ZilSyntaxLine): string {
  const parts = [oneLine(verb).toUpperCase()]
  for (let i = 0; i < line.objects; i++) {
    if (line.prepositions[i]) parts.push(zilPreposition(grammar, line.prepositions[i]!))
    if (line.topic[i]) {
      parts.push('TOPIC')
      continue
    }
    parts.push('OBJECT')
    if (line.find[i]) parts.push(`(FIND ${line.find[i]})`)
    parts.push(`(${zilOptions(grammar, line.options[i]!)})`)
  }
  return parts.join(' ')
}

export function formatZilGrammar(story: StoryFile, grammar: ZilGrammar, opts: FormatOptions): string {
  const w = new Writer(opts.width)
  banner(w, opts, 'Parse tables')
  w.write(`  Verb entries = ${grammar.verbs.length} (ZIL syntax tables, ${grammar.format === 'fixed' ? '8-byte' : 'compact'} lines)\n`)
  for (const v of grammar.verbs) {
    const words = v.words.map(x => `"${oneLine(x)}"`)
    const n = v.lines.length
    const open = `${dec(v.number, 3)}. ${n} entr${n === 1 ? 'y' : 'ies'}, verb = `
    w.write(`\n${wrapIndented(`${open}${words.join(', ') || '(no word)'}`, open.length, opts.width ?? 79)}\n`)
    const verb = zilVerbWord(v)
    for (const line of v.lines) {
      const raw = `    [${line.bytes.map(b => hx(b, 2)).join(' ')}]`
      w.write(`${raw.padEnd(30)}${raw.length >= 30 ? ' ' : ''}${zilLineText(grammar, verb, line)} = ${line.action}\n`)
    }
  }

  w.write(`\n    **** Verb action routines ****\n\n  Action table entries = ${grammar.actions.length}\n\naction# action-routine pre-action-routine\n\n`)
  grammar.actions.forEach((routine, n) => {
    const pre = grammar.preactions[n]
    w.write(`${dec(n, 3)}. ${hx(routine, 1).padStart(5)}${pre ? `  ${hx(pre, 1).padStart(5)}` : ''}\n`)
  })

  w.write(`\n    **** Prepositions ****\n\n  Table entries = ${grammar.prepositions.length}\n\n`)
  for (const p of grammar.prepositions) w.write(`${dec(p.number, 3)}. ${p.words.map(x => `"${oneLine(x)}"`).join(', ')}\n`)
  return w.toString()
}
