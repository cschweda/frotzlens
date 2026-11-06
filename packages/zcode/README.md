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

It covers versions 3, 4, 5 and 8. For versions 1, 2, 6 and 7 it reads the header and reports `unsupported-version`. It recognises a Blorb file and reports `blorb-unsupported`; unwrapping comes later.

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
| `xrefs` | For each routine, string, object, global and dictionary word: what refers to it, and what it refers to | |
| `errors` | `{ code, severity, message, address? }`. A table that can't be read comes back empty and the others still come back. Nothing throws. | |

The model is plain data: it survives `structuredClone` (so it crosses a worker boundary), and everything but `bytes`, the story itself, serialises to JSON as it is. Every addressable thing has a stable `id` (`object:47`, `dict:1ca3`, `global:3`, `abbrev:12`).

## infodump-format text

```ts
import { formatObjects } from '@frotzinc/zcode/format'

process.stdout.write(formatObjects(story, { fileName: 'game.z5' }))
```

`formatHeader`, `formatMap`, `formatAbbreviations`, `formatObjects`, `formatTree`, `formatGrammar` and `formatDictionary` produce the text of Ztools' `infodump -i`, `-m`, `-a`, `-o`, `-t`, `-g` and `-d`; `formatTxd` and `formatRoutine` produce `txd`'s disassembly (`addresses: true` for `txd -n`). On every test fixture the output is byte for byte the same. The deliberate differences, none of which any fixture shows, are listed in `test/golden.test.ts`: one `infodump` mislabelling of v3 flags, and non-printable header bytes (and control characters from a story's Unicode table) printed as `?`. The [`frotzlens`](https://www.npmjs.com/package/frotzlens) CLI is built on these.

MIT. Part of [Frotzlens](https://frotzlens.com), from Frotz, Inc.
