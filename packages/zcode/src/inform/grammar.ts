/**
 * Grammar lines as Inform 6 writes them (DM4 §30): `* noun 'on' noun -> PutOn reverse`. The same
 * text is generated for the libraries' own grammar (library.generated.ts), so a story's verbs can be
 * compared with the library's line by line, and only what the game added written out.
 */
import type { GrammarLine, GrammarToken } from '../grammar.js'
import type { StoryFile } from '../types.js'
import { informWord } from './text.js'

const ELEMENTARY = ['noun', 'held', 'multi', 'multiheld', 'multiexcept', 'multiinside', 'creature', 'special', 'number', 'topic']

export interface GrammarNames {
  /** A routine's name, by byte address. */
  routine: (address: number) => string | undefined
  action: (n: number) => string
  attribute: (n: number) => string
}

function tokenText(story: StoryFile, t: GrammarToken, n: GrammarNames): string | undefined {
  const g = story.grammar!
  const routine = (packedOrIndex: number) => {
    // GV1 tokens hold an index into the parsing-routine table, GV2's a packed address. GV3's
    // (PunyInform's compact grammar) aren't read yet: zcode finds no table for them, so the line
    // can't be written, and the decompiler leaves it out and says so.
    const address = g.version === 2 ? undefined : g.parsingRoutines[packedOrIndex]
    if (address !== undefined) return n.routine(address)
    if (g.version !== 2) return undefined
    const scale = story.header.version <= 3 ? 2 : story.header.version <= 5 ? 4 : 8
    return n.routine(packedOrIndex * scale)
  }
  switch (t.kind) {
    case 'elementary':
      return ELEMENTARY[t.data]
    case 'preposition': {
      const word = g.version === 2 ? story.dictionary.entries.find(e => e.address === t.data)?.word : g.prepositions.find(p => p.number === t.data)?.word
      return word === undefined ? undefined : informWord(word)
    }
    case 'noun-routine': {
      const r = routine(t.data)
      return r && `noun=${r}`
    }
    case 'scope-routine': {
      const r = routine(t.data)
      return r && `scope=${r}`
    }
    case 'routine':
      return routine(t.data)
    case 'attribute':
      return n.attribute(t.data)
    default:
      return undefined
  }
}

/** `* noun 'on' noun -> PutOn reverse`, or undefined when a token can't be written. */
export function informLine(story: StoryFile, line: GrammarLine, n: GrammarNames): string | undefined {
  let s = '*'
  for (const t of line.tokens) {
    const text = tokenText(story, t, n)
    if (text === undefined) return undefined
    s += t.alternative ? `/${text}` : ` ${text}`
  }
  return `${s} -> ${n.action(line.action)}${line.reverse ? ' reverse' : ''}`
}
