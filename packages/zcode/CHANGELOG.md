# Changelog

All notable changes to `@frotzinc/zcode`. Versions follow [Semantic Versioning](https://semver.org/). Part of [frotz, inc.](https://frotzinc.com).

## [0.4.1] - 2026-11-07

### Changed
- The family's names are lower case everywhere: frotzlens, frotzsmith, frotzplay, and frotz, inc. (the README, comments and any text shown).

## [0.4.0] - 2026-11-07

What frotzplay's interpreter needs from the decoder.

### Added
- `decodeZscii(ctx, zchars)`: Z-characters to ZSCII codes, by the same rules as `decodeZchars` but with nothing lost (no `?`, no caps, no budget), for an interpreter. A test checks the two agree on every string of every fixture.
- The interpreter's building blocks are exported: `decodeInstruction` and its types, the opcode tables (`op0`…`opExt`), `Bytes`, `OutOfBounds`, `Malformed`, and the text functions (`decodeZchars`, `decodeZscii`, `readZchars`, `zsciiToText`, `defaultExtra`, `readAlphabetTable`, `readUnicodeTable`, `textContextFor`).
- `@buffer_screen` (EXT:29, Standard 1.1) in the opcode table.

## [0.3.0] - 2026-11-07

- `decompileInform(story, { symbols })`: an Inform story back to Inform 6 source (Phase 6a, with a debug file). The library as `Include`s; the game's constants, globals, arrays, attributes, properties, classes (read from the prototype Inform keeps after each class object), objects and grammar (`Verb`, `Extend`, synonyms) as Inform declares them; routines as Inform assembly with names for what they refer to. Every debug fixture (versions 3, 4, 5 and 8, one in economy mode) recompiles to an equivalent story, 15 of 16 to the same bytes after the header (`test/decompile.test.ts`).
- The version-3, -4 and -8 fixtures and the economy-mode one are built with debug files too (the same story bytes), so the veneer signatures and the decompiler's proof cover every version; v3 and v4 veneer routines are now recognised.
- 6d: `idioms: true` writes the veneer's calls and strict mode's inlined checks as their syntax (`o.p`, `o.p = v`, `o.p()`, `provides`, `ofclass`, `metaclass`, `move`, `remove`, `give`, the `print (…)` forms, array access, `in`, `has`, `objectloop`, conditions as values); the veneer is written out only if something still calls it by name. `decompileChecked` tries idioms first; its result has `idiomatic`. Every fixture's game code comes out with no assembly and no veneer, with and without debug files. Without a debug file the game's individual properties are named too.
- 6c: `decompileInform(story, { symbols, statements: true, structure: true })` writes control flow as if/else, &&/||, while, do-until, switch and action cases; `decompileChecked` tries structured first and drops a routine to flat statements, then assembly, if it doesn't come back the same (`structurallyDifferingRoutines` tells a changed routine from one that only moved); its result has `structured`.
- 6b: `decompileInform(story, { symbols, statements: true })` writes routines as statements (expressions from the stack, assignments, prints, calls, give, move, remove, return, style), branches still as assembly; `decompileChecked(story, symbols, compile)` compiles the result again and keeps as assembly any routine that doesn't come back the same (`differingRoutines` compares two stories routine by routine). Every fixture's game routines come back as statements; the stories stay equivalent, and 15 of 16 the same bytes after the header, as before. `Decompiled` has `lineRoutines` and `statementRoutines`.
- Without a debug file: `findReference(story, compile)` compiles the story's library alone as the story was set up (trying each extension and library setting), and `inferSymbols(story, reference)` works out from it what a debug file would say, for `decompileInform`. Every fixture recompiles to an equivalent story without its debug file, 9 of 16 to the same bytes. Also `referenceSource`, `referenceMatch`, `REFERENCE_EXTENSIONS`, `LIBRARY_SWITCHES`, `LIBRARY_NUMBERS`.
- `readSymbols` keeps every declaration's place in the source (`symbols.declarations`, and `position` in a location).

## [0.2.0] - 2026-11-07

- ZIL's syntax tables, as `story.zilGrammar`, for stories that aren't Inform's (ZILF's, and Infocom's old parser): every verb with its words and syntax lines (prepositions, FIND flags, search options, TOPIC objects), the action and pre-action routines, and the prepositions. Found through the globals, without symbols; checked (locally: the stories aren't in this repository) against the `<SYNTAX>` forms of zillib and four ZILF games. `COMPACT-SYNTAXES?` lines and `COMPACT-PREACTIONS?` tables are read too. `parseZilGrammar`, `verbNumber`, `ZILLIB_SEARCH_FLAGS`, `INFOCOM_SEARCH_FLAGS`.
- `formatGrammar` prints ZIL's tables in infodump's layout, each line as its `SYNTAX` form reads (frotzlens's own text: Ztools can't read them). `formatZilGrammar`, `zilLineText`, `zilOptions`, `zilPreposition`, `zilVerbWord`.
- Cross-references: a ZIL verb word refers to its lines' action and pre-action routines and preposition words.

## [0.1.0] - 2026-11-06

First release.

- `parseStory(bytes)`: the header (§11), memory map (§1), text with abbreviations, custom alphabets and the Unicode table (§3), dictionary (§13), object table (§12) and globals (§6.2), for Z-machine versions 3, 4, 5 and 8. Never throws: problems come back in `errors`.
- `@frotzinc/zcode/format`: infodump-format text for the header, abbreviations, objects, object tree and dictionary, byte-identical to Ztools' `infodump` on every test fixture.
- Disassembly: every routine (all four instruction forms, stores, branches, inline text) and the string area, as `code` and `strings` in the model.
- Inform grammar, versions 1, 2 and 3 (PunyInform), as `grammar`.
- Cross-references, both ways, as `xrefs`.
- `formatTxd` and `formatRoutine`: Ztools' `txd` and `txd -n` output, byte-identical on every Standard Library and library-free fixture; `formatGrammar` and `formatMap`: `infodump -g` and `-m`.
- `routineView`: one routine's txd text in pieces, each routine, string, object, dictionary word and label it names marked, for showing it with links; joined, the pieces are exactly `formatRoutine(story, address, { width: 0 })`'s text (the pieces are unwrapped). `formatStrings`: txd's string listing on its own. `txdRoutineName`, `txdStringName`: txd's R0001 and S001 names.
- Cross-references: a property word that is exactly a dictionary entry's address (Inform's `name`) now refers to that word.
- `formatTxd` on ZILF-compiled stories: matches `txd -g` byte for byte on the nine checked (ZILF 1.9; `test/zil.test.ts`, local only). A variable-number operand that is itself a variable is bracketed (`LOAD [(SP)+]`); "program starts at" is the header's initial PC less one; the analysis pass's high address takes in the highest routine a call names. `READ`'s and `SOUND_EFFECT`'s fourth operands are routines, as txd shows them. (Ztools can't read ZIL's syntax tables, so its grammar output isn't comparable.)
- Blorb: `parseStory` unwraps a Blorb's story (`Exec 0`, or the first `ZCOD` chunk) and parses it; `story.blorb` lists the chunks, resources, cover (`Fspc`) and iFiction metadata (`IFmd`: title, author). `readBlorb`, `blorbStory`. The structural problems it can see (a chunk running past the end, a missing pad byte, bytes left over, an index entry pointing at no chunk or claiming more entries than it holds) are `bad-blorb` warnings, and the story is still read when its chunk can be found; a Blorb with no Z-machine story (a Glulx game's) is `blorb-unsupported`.
- `readSymbols(xml)`: Inform's `gameinfo.dbg` (6.33+) as tables of names: routines (with locals and source locations), objects, globals, properties, attributes, actions, classes, arrays, constants. Never throws; `problems` says what couldn't be read. `symbolsMatch(story, symbols)` checks the debug file is the story's.
- `story.fingerprint`: the compiler (Inform 6 or ZILF, and its version), the library (Standard Library or PunyInform, and its version), and Inform's veneer routines: `Main__` from where the story starts, the rest (`RT__Err`, `CA__Pr`, …) by their code, from signatures of Inform 6.44's veneer taken from the test fixtures. `fingerprint`, `routineShape`, `shapeHash`.
- `roomGraph(story, symbols)`: an Inform game's map from its direction properties: exits to rooms, through doors, to routines (with the rooms they can return) and to refusals; the start room, when it is a constant (the Standard Library's `location = Room;` in `Initialise`, PunyInform's `INITIAL_LOCATION_VALUE`, or the global's starting value). `toMapGraph`: frotzsmith's map shape.
- `formatTxd`, `formatRoutine` and `routineView` take `symbols`: routines, globals, locals, attributes and properties by their source names (no longer txd's text, so the parity tests leave it out). Operand kinds `attr` and `prop` (test_attr's and get_prop's second operands, …), shown as numbers without symbols, as before.
