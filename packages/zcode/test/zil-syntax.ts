/**
 * The ground truth for ZIL grammar: the <SYNTAX …> forms in the ZIL source (zillib's verbs.zil and
 * the game's own files), read into the lines ZILF compiles them to, so the decoded syntax tables
 * can be checked line by line. Used by zil.test.ts (local only: the sources aren't in this repo).
 *
 * Search options follow zillib's NEW-SFLAGS (parser.zil) as ZILF's ScopeFlags applies them: no
 * options means SEARCH-ALL (IN-ROOM CARRIED); HAVE, TAKE, MANY and TOUCH add to that default when
 * they're the only ones given; a TOPIC object has none.
 */

export interface SourceSyntax {
  verb: string
  objects: { prep?: string; topic: boolean; options: number }[]
  action: string
  preaction?: string
}

const ZILLIB_FLAGS: Record<string, number> = {
  'IN-ROOM': 8, 'ON-GROUND': 8, CARRIED: 16, HELD: 16, EVERYWHERE: 32, TOUCH: 64, HAVE: 1, MANY: 2, TAKE: 4,
}
const ADDITIVE = new Set(['HAVE', 'MANY', 'TAKE', 'TOUCH'])
const SEARCH_ALL = 8 | 16

function options(names: string[] | undefined): number {
  if (!names) return SEARCH_ALL
  const bits = names.reduce((b, n) => b | (ZILLIB_FLAGS[n] ?? 0), 0)
  return names.every(n => ADDITIVE.has(n)) ? SEARCH_ALL | bits : bits
}

/** Every <SYNTAX …> form in `source`, in order. Comments (`;"…"` and `;<…>`) are skipped. */
export function readSyntaxForms(source: string): SourceSyntax[] {
  // Drop ;"…" comments, then any form commented out with ;<
  const text = source.replace(/;"(?:[^"\\]|\\.)*"/g, '').replace(/;<SYNTAX[^>]*>/g, '')
  const out: SourceSyntax[] = []
  for (const m of text.matchAll(/<SYNTAX\s+([^>]*)>/g)) {
    const tokens: string[] = m[1]!.match(/\([^)]*\)|=|[^\s()=]+/g) ?? []
    const eq = tokens.indexOf('=')
    if (eq < 1) continue
    const [verb, ...rest] = tokens.slice(0, eq)
    const objects: SourceSyntax['objects'] = []
    let prep: string | undefined
    for (const t of rest) {
      if (t === 'OBJECT' || t === 'TOPIC') {
        objects.push({ ...(prep ? { prep } : {}), topic: t === 'TOPIC', options: t === 'TOPIC' ? 0 : SEARCH_ALL })
        prep = undefined
      } else if (t.startsWith('(FIND')) {
        // A FIND flag: not compared (it's an attribute number in the story, a name in the source).
      } else if (t.startsWith('(')) {
        // Every option list after an object counts: (ON-GROUND IN-ROOM) (TOUCH) is one set.
        const last = objects.at(-1)
        if (last && !last.topic) (last as { names?: string[] }).names = [...((last as { names?: string[] }).names ?? []), ...t.slice(1, -1).trim().split(/\s+/)]
      } else prep = t
    }
    for (const o of objects as (SourceSyntax['objects'][number] & { names?: string[] })[]) {
      if (o.names) o.options = options(o.names)
      delete o.names
    }
    const [action, preaction] = tokens.slice(eq + 1)
    out.push({ verb: verb!, objects, action: action!, ...(preaction ? { preaction } : {}) })
  }
  return out
}

/** What checkSyntaxTables found: forms not decoded, decoded lines no form explains, actions split. */
export interface SyntaxCheck {
  matched: number
  notDecoded: string[]
  unexplained: string[]
  splitActions: string[]
}

/**
 * Every decoded syntax line must come from a source form, and every source form whose verb the story
 * has must be decoded, with each action name always the same action number. A form matches a line
 * with the same objects, prepositions (by word; or a preposition number no word has, which ZILF
 * leaves when a later SYNONYM merges the word into another's), TOPICs and search options. Exact
 * matches are made first. Forms whose verb isn't in the story (compiled only for debugging, or
 * with scoring on) are left out.
 */
export function checkSyntaxTables(
  grammar: import('../src/zil-grammar.js').ZilGrammar,
  forms: SourceSyntax[],
  version: number,
): SyntaxCheck {
  const trunc = (w: string) => w.replace(/\\/g, '').toLowerCase().slice(0, version <= 3 ? 6 : 9)
  const prepWords = new Map(grammar.prepositions.map(p => [p.number, p.words]))
  type Line = import('../src/zil-grammar.js').ZilSyntaxLine
  const seen = new Set<Line>()
  const actionOf = new Map<string, number>()
  const out: SyntaxCheck = { matched: 0, notDecoded: [], unexplained: [], splitActions: [] }
  const matches = (f: SourceSyntax, l: Line, loose: boolean) =>
    l.objects === f.objects.length &&
    f.objects.every((o, i) => {
      const p = l.prepositions[i]!
      const exact = o.prep ? (prepWords.get(p) ?? []).includes(trunc(o.prep)) : !p
      const wordless = !!o.prep && !!p && !prepWords.has(p)
      return (exact || (loose && wordless)) && o.topic === l.topic[i] && (o.topic || o.options === l.options[i])
    })
  const take = (f: SourceSyntax, l: Line) => {
    seen.add(l)
    const prev = actionOf.get(f.action)
    if (prev !== undefined && prev !== l.action) out.splitActions.push(`${f.action}: ${prev} and ${l.action}`)
    actionOf.set(f.action, l.action)
    out.matched++
  }
  const describe = (f: SourceSyntax) => `${f.verb} ${f.objects.map(o => `${o.prep ?? ''} ${o.topic ? 'TOPIC' : `OBJECT(${o.options})`}`).join(' ')} = ${f.action}`
  const pending: [SourceSyntax, import('../src/zil-grammar.js').ZilVerb][] = []
  for (const f of forms) {
    const v = grammar.verbs.find(x => x.words.includes(trunc(f.verb)))
    if (!v) continue
    const hit = v.lines.find(l => matches(f, l, false))
    if (hit) take(f, hit)
    else pending.push([f, v])
  }
  for (const [f, v] of pending) {
    const hit = v.lines.find(l => !seen.has(l) && matches(f, l, true)) ?? v.lines.find(l => matches(f, l, true))
    if (hit) take(f, hit)
    else out.notDecoded.push(describe(f))
  }
  for (const v of grammar.verbs) {
    for (const l of v.lines) if (!seen.has(l)) out.unexplained.push(`${v.words.join('/')}: ${l.bytes.map(b => b.toString(16).padStart(2, '0')).join(' ')}`)
  }
  return out
}
