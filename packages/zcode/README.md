# @frotzinc/zcode

A parser and disassembler for Z-machine story files. `Uint8Array` in, a typed model out. It's pure TypeScript with no DOM and no dependencies, and runs the same in a browser, a Web Worker or Node.

```ts
import { parseStory } from '@frotzinc/zcode'

const story = parseStory(bytes)   // dark-cellar.z5, one of the test fixtures
story.header.version              // 5
story.objects.objects[26]         // { id: 'object:27', shortName: { text: 'brass lantern' }, attributes: [9], parent: 26, … }
story.dictionary.entries          // [… { id: 'dict:215d', word: 'lantern', inform: { noun: true, … } } …]
story.memory.segments             // the header, object table, dictionary, … as [start, end) byte ranges
story.errors                      // [] — or what went wrong, and the model still holds everything that could be read
```

It covers versions 3, 4, 5 and 8. For versions 1, 2, 6 and 7 it reads the header and reports `unsupported-version`. A Blorb file is unwrapped: the story inside is parsed, and `story.blorb` lists the rest (pictures, sounds, the cover, the iFiction metadata). A Blorb with no Z-machine story in it (a Glulx game's) reports `blorb-unsupported`.

## What's in the model

| Field | What | Standard 1.1 |
|---|---|---|
| `header` | Version, flags, the table addresses, serial, file length, checksum (and whether it matches), terminating keys, alphabet table, header extension, and Inform's compiler version from `0x3C` | §11 |
| `memory` | Dynamic, static and high memory, plus each table as a labelled byte range | §1 |
| `abbreviations` | The 96 abbreviation strings | §3.3 |
| `dictionary` | Word separators, entry length, every word decoded, with its data bytes and, for Inform files, its flags | §13 |
| `objects` | Property defaults, and every object: attributes, parent/sibling/child, short name, properties (v1–3 and v4+ size bytes) | §12 |
| `globals` | All 240 global variables | §6.2 |
| `code` | Every routine, in address order: locals, and each instruction decoded (operands, store, branch, inline text) | §4, §5 |
| `strings` | The packed strings after the code | §3 |
| `grammar` | Inform's grammar table (versions 1, 2 and 3): verbs, lines, tokens, actions, prepositions | Inform |
| `xrefs` | What refers to each routine, string, object, global and dictionary word, and what each refers to. Sparse: only things with a reference either way have an entry. | |
| `errors` | `{ code, severity, message, address? }`. A table that can't be read comes back empty and the others still come back. Nothing throws. | |

The model is plain data: it survives `structuredClone` (so it crosses a worker boundary), and everything but `bytes`, the story itself, serialises to JSON as it is. Every addressable thing has a stable `id` (`object:47`, `dict:1ca3`, `global:3`, `abbrev:12`).

## Inform 6 source (in progress)

```ts
import { parseStory, readSymbols, decompileInform, findReference, inferSymbols } from '@frotzinc/zcode'

const { source, problems } = decompileInform(parseStory(bytes), { symbols: readSymbols(gameinfoDbg) })

// Without a debug file: compile the library alone as the story was set up, and work out the rest.
import { compile } from '@frotzinc/inform6-wasm'
const story = parseStory(bytes)
const reference = await findReference(story, async (src, library, version) => {
  const out = await compile(src, { library, version, debug: true })
  return out.ok && out.story && out.dbg ? { story: parseStory(out.story), symbols: readSymbols(out.dbg) } : undefined
})
const { source: inf } = decompileInform(story, { symbols: inferSymbols(story, reference!) })
```

Turns an Inform-compiled story back into one `.inf` (Phase 6, [design](../../docs/09-decompiler.md)). `decompileChecked(story, symbols, compile)` writes the routines as statements (6b) with their control flow (6c) and Inform's own syntax for what the veneer does (6d), each checked by compiling it again. So far: with the story's debug file or without one, the library left out as `Include`s, the game's declarations, classes, objects and grammar as Inform writes them, and its routines as statements with `if`, `while`, `do` and `switch`. Every fixture (versions 3, 4, 5 and 8) recompiles to an equivalent story either way; with its debug file all but one to the same bytes after the header, without it nine of sixteen.

## infodump-format text

```ts
import { formatObjects } from '@frotzinc/zcode/format'

process.stdout.write(formatObjects(story, { fileName: 'game.z5' }))
```

`formatHeader`, `formatMap`, `formatAbbreviations`, `formatObjects`, `formatTree`, `formatGrammar` and `formatDictionary` produce the text of Ztools' `infodump -i`, `-m`, `-a`, `-o`, `-t`, `-g` and `-d`; `formatTxd` and `formatRoutine` produce `txd`'s disassembly (`addresses: true` for `txd -n`). Where Ztools reads a story correctly, the output is byte for byte the same on every test fixture and sample. The exceptions, and why, are listed in `test/golden.test.ts` and `test/txd.test.ts`:

- **PunyInform** stories use Inform's version-3 grammar, which Ztools misreads as version 1. Their grammar sections and `txd`'s grammar notes have no reference. What is compared: every routine `txd` finished, without its notes, and the string section where `txd` reaches it. On two v3 stories `txd` stops partway, so their last routine and strings aren't compared.
- **`minimal`'s `-m`:** `infodump` sizes an empty property-names table as 0x20000 bytes. We print the true size.
- **Raw header bytes, and control characters from a story's Unicode table,** print as `?`, so a story can't put a terminal escape in our output. v3 flags2's unknown bits print with their own mask. None of the checked fixtures or samples has either, but a story that did would print differently from `infodump`. The [`frotzlens`](https://www.npmjs.com/package/frotzlens) CLI is built on these.

MIT. Part of [frotzlens](https://frotzlens.frotzinc.com), from [frotz, Inc.](https://frotzinc.com).
