/**
 * Inform grammar as text: infodump's `-g` sections, and the one-line form of a
 * grammar line ("put noun in noun") that txd's annotations use too. Learned
 * from their output. GV3 (PunyInform) has no reference — Ztools misreads it —
 * so it's written the way GV2 is.
 */
import type { Grammar, GrammarLine, GrammarToken } from '../grammar.js'
import type { StoryFile } from '../types.js'
import { wrapIndented } from './txd.js'
import { formatZilGrammar } from './zil-grammar.js'
import { Writer, banner, dec, hx, type FormatOptions } from './writer.js'

const ELEMENTARY = ['noun', 'held', 'multi', 'multiheld', 'multiexcept', 'multiinside', 'creature', 'special', 'number', 'topic']
const GV1_ELEMENTARY = ['NOUN', 'HELD', 'MULTI', 'MULTIHELD', 'MULTIEXCEPT', 'MULTIINSIDE', 'CREATURE', 'SPECIAL', 'NUMBER', 'UNKNOWN']

function tokenText(t: GrammarToken, g: Grammar, story: StoryFile): string {
  if (g.version === 1) {
    switch (t.kind) {
      case 'elementary':
        return GV1_ELEMENTARY[t.data] ?? 'UNKNOWN'
      case 'noun-routine':
        return `NOUN [parse ${t.data}]`
      case 'routine':
        return `TEXT [parse ${t.data}]`
      case 'scope-routine':
        return `SCOPE [parse ${t.data}]`
      case 'preposition':
        return g.prepositions.find(p => p.number === t.data)?.word ?? 'UNKNOWN'
      case 'attribute':
        return `ATTRIBUTE(${t.data})`
      default:
        return 'UNKNOWN'
    }
  }
  const routine = (d: number) => (g.version === 3 ? `[parse ${d}]` : `[parse $${hx(d, 4)}]`)
  switch (t.kind) {
    case 'elementary':
      return ELEMENTARY[t.data] ?? 'unknown'
    case 'preposition':
      return g.version === 3
        ? (g.prepositions[t.data]?.word ?? 'unknown')
        : (story.dictionary.entries.find(e => e.address === t.data)?.word ?? 'unknown')
    case 'noun-routine':
      return `noun = ${routine(t.data)}`
    case 'scope-routine':
      return `scope = ${routine(t.data)}`
    case 'routine':
      return routine(t.data)
    case 'attribute':
      return `ATTRIBUTE(${t.data})`
    default:
      return 'unknown'
  }
}

/** Dictionary text in a one-line listing: no control characters (a word can hold a newline). */
const oneLine = (s: string) => s.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '?')

/** A grammar line as text, its verb first: "put noun in noun", "climb up / over noun". */
export function grammarLineText(story: StoryFile, verb: string, line: GrammarLine): string {
  const g = story.grammar!
  let s = verb
  for (const t of line.tokens) s += `${t.alternative ? ' / ' : ' '}${tokenText(t, g, story)}`
  return oneLine(s)
}

/** Every grammar line, with its verb's word, in table order. */
export function grammarLines(story: StoryFile): { verb: string; line: GrammarLine }[] {
  return (story.grammar?.verbs ?? []).flatMap(v => v.lines.map(line => ({ verb: v.words[0] ?? '', line })))
}

/** infodump's `-g`: the parse tables, the action routines, (GV1) the parsing routines, the prepositions. */
export function formatGrammar(story: StoryFile, opts: FormatOptions): string {
  const w = new Writer(opts.width)
  const g = story.grammar
  // ZIL's syntax tables, in their own layout (Ztools can't read them; this is frotzlens's text).
  if (!g && story.zilGrammar) return formatZilGrammar(story, story.zilGrammar, opts)
  if (!g) {
    banner(w, opts, 'There are no parse tables')
    w.write('  Verb entries = 0\n\n')
    return w.toString()
  }
  banner(w, opts, 'Parse tables')
  w.write(`  Verb entries = ${g.verbs.length}\n`)
  for (const v of g.verbs) {
    const [verb = '', ...synonyms] = v.words.map(oneLine)
    const n = v.lines.length
    let head = `${dec(v.number, 3)}. ${n} entr${n === 1 ? 'y' : 'ies'}, verb = "${verb}"`
    // A long synonym list wraps with its lines lined up under the first synonym.
    if (synonyms.length) {
      const open = `${head}, synonyms = `
      head = wrapIndented(`${open}${synonyms.map(x => `"${x}"`).join(', ')}`, open.length, opts.width ?? 79)
    }
    w.write(`\n${head}\n`)
    for (const line of v.lines) {
      const raw = `    [${line.bytes.map(b => hx(b, 2)).join(' ')}]`
      w.write(`${raw.padEnd(30)}${raw.length >= 30 ? ' ' : ''}"${grammarLineText(story, verb, line)}"${line.reverse ? ' REVERSE' : ''}\n`)
    }
  }

  const lines = grammarLines(story)
  // infodump's listings mark a reversed line after its quotes.
  const listed = (pick: (l: GrammarLine) => boolean) =>
    lines.filter(x => pick(x.line)).map(x => `${grammarLineText(story, x.verb, x.line)}"${x.line.reverse ? ' REVERSE' : ''}`)

  w.write(`\n    **** Verb action routines ****\n\n  Action table entries = ${g.actions.length}\n\naction# action-routine "verb..."\n\n`)
  g.actions.forEach((routine, n) => {
    const texts = listed(l => l.action === n)
    w.write(`${dec(n, 3)}. ${hx(routine, 1).padStart(5)}  ${texts.length ? `"${texts[0]}` : ''}\n`)
    for (const t of texts.slice(1)) w.write(`            "${t}\n`)
  })

  if (g.version === 1) {
    w.write(`\n    **** Parsing routines ****\n\n  Number of parsing routines = ${g.parsingRoutines.length}\n\nparse# parsing-routine "verb..."\n\n`)
    g.parsingRoutines.forEach((routine, n) => {
      // noun=, general and scope= routine tokens all index the parsing-routine table.
      const usesTable = (t: GrammarToken) => t.kind === 'routine' || t.kind === 'noun-routine' || t.kind === 'scope-routine'
      const texts = listed(l => l.tokens.some(t => usesTable(t) && t.data === n))
      w.write(`${dec(n, 3)}. ${hx(routine, 1).padStart(5)}  ${texts.length ? `"${texts[0]}` : ''}\n`)
      for (const t of texts.slice(1)) w.write(`            "${t}\n`)
    })
  }

  w.write(`\n    **** Prepositions ****\n\n  Table entries = ${g.prepositions.length}\n\n`)
  for (const p of [...g.prepositions].sort((a, b) => a.number - b.number)) w.write(`${dec(p.number, 3)}. "${oneLine(p.word)}"\n`)
  return w.toString()
}
