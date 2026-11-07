# Changelog

All notable changes to `@frotzinc/zcode`. Versions follow [Semantic Versioning](https://semver.org/). Part of [Frotz, Inc.](https://frotzinc.com).

## [Unreleased]

- `decompileInform(story, { symbols })`: an Inform story back to Inform 6 source (Phase 6a, with a debug file). The library as `Include`s; the game's constants, globals, arrays, attributes, properties, classes (read from the prototype Inform keeps after each class object), objects and grammar (`Verb`, `Extend`, synonyms) as Inform declares them; routines as Inform assembly with names for what they refer to. Every debug fixture recompiles to an equivalent story, 11 of 12 to the same bytes (`test/decompile.test.ts`).
- `readSymbols` keeps every declaration's place in the source (`symbols.declarations`, and `position` in a location).

## [0.2.0] - 2026-11-07

- ZIL's syntax tables, as `story.zilGrammar`, for stories that aren't Inform's (ZILF's, and Infocom's old parser): every verb with its words and syntax lines (prepositions, FIND flags, search options, TOPIC objects), the action and pre-action routines, and the prepositions. Found through the globals, without symbols; checked (locally: the stories aren't in this repository) against the `<SYNTAX>` forms of zillib and four ZILF games. `COMPACT-SYNTAXES?` lines and `COMPACT-PREACTIONS?` tables are read too. `parseZilGrammar`, `verbNumber`, `ZILLIB_SEARCH_FLAGS`, `INFOCOM_SEARCH_FLAGS`.
- `formatGrammar` prints ZIL's tables in infodump's layout, each line as its `SYNTAX` form reads (Frotzlens's own text: Ztools can't read them). `formatZilGrammar`, `zilLineText`, `zilOptions`, `zilPreposition`, `zilVerbWord`.
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
- `roomGraph(story, symbols)`: an Inform game's map from its direction properties: exits to rooms, through doors, to routines (with the rooms they can return) and to refusals; the start room, when it is a constant (the Standard Library's `location = Room;` in `Initialise`, PunyInform's `INITIAL_LOCATION_VALUE`, or the global's starting value). `toMapGraph`: Frotzsmith's map shape.
- `formatTxd`, `formatRoutine` and `routineView` take `symbols`: routines, globals, locals, attributes and properties by their source names (no longer txd's text, so the parity tests leave it out). Operand kinds `attr` and `prop` (test_attr's and get_prop's second operands, …), shown as numbers without symbols, as before.
