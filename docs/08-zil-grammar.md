# ZIL grammar: the syntax tables, decoded

Started 2026-11-07. Frotzlens already read every part of a ZIL-compiled story but its grammar. ZILF writes ZIL's syntax tables (the old parser's: `VTBL`, the per-verb syntax tables, `ATBL`, `PATBL`, `PRTBL`), and Ztools can't read them. infodump and txd look for the verb table at the start of static memory, where Infocom's compiler put it and ZILF doesn't, and they read past the end of the file.

## Where the format comes from

The format comes from ZILF's own source, not from Ztools:
- `Compilation.Syntax.cs`: the tables.
- `OldParserVocabFormat.cs` and `OldParserWord.cs`: dictionary words and prepositions.
- `ScopeFlags.cs`: search options.
- zillib's `parser.zil`: its `NEW-SFLAGS`.

The tables:

| Table | Layout |
|---|---|
| `VTBL` | 255 words, for verb numbers 255 down to 1. Each is 0 or the address of that verb's syntax table. |
| Syntax table | A count byte, then the lines, last-defined first. A line is 8 bytes: object count, two prepositions, two FIND flags (attribute numbers), two search-option bytes, and the action number. In ZILF's extended format, bits 2 and 4 of the count mark a TOPIC. `COMPACT-SYNTAXES?` lines (2 to 7 bytes) are read too. |
| `ATBL`, `PATBL` | The action and pre-action routines, a packed address per action number. |
| `PRTBL` | A count, then each preposition's dictionary word and number. |

Dictionary words carry a part-of-speech byte and up to two values, in an order ZILF fixes. `verbNumber` finds a word's verb number from them.

## Found without symbols

The globals `VERBS`, `ACTIONS`, `PREACTIONS` and `PREPOSITIONS` start out holding the tables' addresses. So Frotzlens looks among the globals' starting values for:
- a verb table whose every entry reads as a syntax table;
- an action table whose every word is a routine;
- a pre-action table (zeros and routines, at least one routine);
- a preposition table whose words are dictionary entries.

Inform stories are skipped. They have their own grammar table.

## Shown

- **CLI:** `frotzlens -g` prints the tables in infodump's layout. Each line is written the way its `<SYNTAX>` form reads, e.g. `TAKE OBJECT (FIND 26) (MANY IN-ROOM)`, followed by the action table (with pre-actions) and the prepositions.
  - FIND flags are attribute numbers, because flag names aren't in the story.
  - Search options are named by zillib's flags for ZILF stories, else Infocom's. Bits without a name show in hex.
  - This text is Frotzlens's own: there is no Ztools output to match.
- **Web app:** the Grammar view shows ZIL tables the same way, with links to each line's action and pre-action routines.
- **Cross-references:** each verb word refers to its lines' routines and preposition words.

## Checked against the source

The ground truth is the source: zillib's `verbs.zil` and the game's own files. `test/zil.test.ts` (local only; the stories aren't in this repository) reads every `<SYNTAX>` form and requires three things:
- every decoded line comes from a form;
- every form the story's verbs have is decoded;
- each action name is always one action number.

It passes on Cloak of Darkness, Two Rooms, West of House (each as z3 and z5) and Mingus I. Forms compiled only with debugging or scoring on aren't in those stories, so they're left out. `test/zil-grammar.test.ts` runs in CI. It builds the tables by hand inside a real story and checks the reading, the word values, TOPIC, Infocom's flag names and the text.

Mingus I turned up a ZILF quirk. A `SYNTAX` naming ONTO or INTO is compiled with a preposition number of its own (238, 237). But zillib's `<SYNONYM ON ONTO>` gives the dictionary word `onto` ON's number, so those lines can never match what a player types. Frotzlens shows such a preposition as `#238`, a number no word has, rather than hiding it.
