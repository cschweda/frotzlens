# Changelog

All notable changes to Frotzlens: the web app at [frotzlens.frotzinc.com](https://frotzlens.frotzinc.com), and this repository. The packages keep their own changelogs: [`@frotzinc/zcode`](packages/zcode/CHANGELOG.md), [`frotzlens`](packages/cli/CHANGELOG.md) (the CLI), [`@frotzinc/worker-rpc`](packages/worker-rpc/CHANGELOG.md), [`@frotzinc/nuxt-base`](packages/nuxt-base/CHANGELOG.md), [`@frotzinc/inform6-wasm`](packages/inform6-wasm/CHANGELOG.md). Versions follow [Semantic Versioning](https://semver.org/). Part of [Frotz, Inc.](https://frotzinc.com).

## [Unreleased]

### Added
- **Phase 6 is done: Inform 6 source, in the app and the CLI (step 6e).** The **Source** view shows the open story decompiled to Inform 6, made in a worker and checked there: compiled again with Inform 6.44 in WebAssembly, every routine compared with the story's, and any that doesn't come back the same written as assembly. Download it as an `.inf`, copy it, or follow a routine’s “This routine as Inform 6 source” link from the Routines view. With the story's debug file loaded, the source's own names; without, names made up from the story. The compiler is fetched only when Source is opened. `frotzlens --inform game.z5` does the same in a terminal ([details](docs/09-decompiler.md#5e-progress-6e-in-the-app-and-the-cli-2026-11-07)).
- The design for Phase 6, decompiling a story back to Inform 6 source, for review before any code ([docs/09-decompiler.md](docs/09-decompiler.md)).
- **Source** (for Inform stories): where decompiling to Inform 6 has got, step by step. It shows the source itself once the routines read well.
- **Decompiling to Inform 6, step 6a** (in `@frotzinc/zcode`, not yet in the app): with a story's debug file, an `.inf` with the library as `Include`s, the game's declarations, classes, objects and grammar, and its routines as Inform assembly. Every test game with a debug file (versions 3, 4, 5 and 8) compiles again to an equivalent story, and all but one to the same bytes after the header ([progress](docs/09-decompiler.md#5a-progress-6a-with-and-without-a-debug-file-2026-11-07)).
- **Decompiling, step 6d: idioms.** Calls to Inform's veneer and strict mode's inlined checks come out as the syntax that makes them: `o.p`, `o.p(args)`, `o provides p`, `o ofclass C`, `move`, `give`, `print (name)`, `a-->i`, `x in y`, `objectloop (x in p)`, and conditions used as values. No test game's code has any assembly left, and the veneer isn't written out: the compiler writes its own ([progress](docs/09-decompiler.md#5d-progress-6d-idioms-2026-11-07)).
- **Decompiling, step 6c: control flow.** Branches and jumps come out as `if`/`else`, `&&`/`||`, `while`, `do … until`, `switch` and an embedded routine's action cases (`Take, Drop: …`), in the shapes Inform compiles each to, each routine checked by compiling it again. Every routine of the small test games is structured, and nine in ten of the two big ones ([progress](docs/09-decompiler.md#5c-progress-6c-control-flow-2026-11-07)).
- **Decompiling, step 6b: statements.** The game's routines come out as Inform statements, the stack followed into nested expressions (`y = x*2 - g;`), with prints, calls, `give`, `move`, `return` and the rest; branches stay assembly for 6c. Each routine is checked by compiling it again and kept as assembly if its statements don't come back the same. Every game routine of every test game comes back as statements, and the stories are what they were ([progress](docs/09-decompiler.md#5b-progress-6b-statements-2026-11-07)).
- **Without a debug file, too:** the library is found by compiling it alone, set up as the story's was (its extensions and the game's library settings tried in turn), and lined up with the story routine by routine; the game's names are made up from what the story says. Every test game compiles again to an equivalent story, nine to the same bytes.

### Changed
- The Phase 6 design records the decisions: Inform 6 first and ZIL later, Frotzsmith's Inform 6 style, and the Source view held back until step 6c.

## [0.2.0] - 2026-11-07

`@frotzinc/zcode` 0.2.0 and the `frotzlens` 0.2.0 CLI carry the ZIL grammar, and are on npm.

### Added
- **An About menu** in the header, as in Drafter:
  - **About Frotzlens:** every version (the site's, with its commit and date, and each package the site is built from) and every licence, with "Copy technical details".
  - **What's new:** this changelog.
  - **Report a problem…** and **Suggest a feature…**: GitHub's issue form, filled in with what you write and the technical details, for you to review and submit there. Frotzlens sends nothing, and never the story file.
  - **Check for updates:** whether the site has been updated since the page opened.
- The footer links the changelog and shows the version.
- `SECURITY.md`, and GitHub issue forms for problems and features.
- The README has screenshots, who Frotzlens is for, and what it does that nothing else does.
- **ZIL grammar.** A ZILF-compiled story's syntax tables are decoded: every verb, its words and syntax lines (shown as each `SYNTAX` form reads), its action and pre-action routines, and the prepositions. They appear in the Grammar view and in `frotzlens -g`, and dictionary words link to their verbs. They're checked against the `<SYNTAX>` forms in zillib and four ZILF games ([details](docs/08-zil-grammar.md)).

## [0.1.0] - 2026-11-07

The first release. `@frotzinc/zcode` 0.1.0 and the `frotzlens` 0.1.0 CLI are on npm.

### Play (#14)
- A Play view runs the open story in Parchment, the interpreter Frotzsmith uses. It's sandboxed in an opaque-origin iframe with its own Content-Security-Policy, so a story can't reach the app ([details](docs/07-play.md)).

### SEO (#13)
- `robots.txt` and `sitemap.xml`, schema.org structured data, the social card's alt text, and a current description.

### Phase 5: debug symbols, fingerprinting, Blorb, the map (#9, #10, #11, #12)
- Blorb files (`.zblorb`, `.zlb`) open: the story inside is read, and the Overview lists the rest.
- Inform's `gameinfo.dbg` names routines, globals, locals, properties, attributes and actions everywhere, with a Names switch in the header.
- The Overview says what made the story: Inform or ZILF and its version, the Standard Library or PunyInform, and Inform's veneer routines.
- New views: Globals, Abbreviations, Symbols, and the Map (rooms and exits from the debug file).
- The CLI gains `--symbols`, `--info` and `--rooms`.

### ZILF-compiled stories (#8)
- Every part Ztools can read of a ZILF story matches it byte for byte.

### Phase 4: the data views (#7)
- Memory (the map and a hex viewer), Objects (a keyboard-operable tree), Dictionary, Grammar, Routines (linked disassembly) and Strings, each linked to the rest, each with "Copy as text" in Ztools' format.
- A Playwright smoke test opens a real story, visits every view, and runs axe on each, in CI.

### Phase 3: the web app (#5, #6)
- Drop a story file, or try the sample, and see the Overview: stats, a to-scale memory map, the story's facts.
- Parsing runs in a Web Worker, every view is a hash route, and ⌘K jumps anywhere.
- Live at frotzlens.frotzinc.com.

### Phase 2: the disassembler (#3, #4)
- Every routine and string, Inform grammar (versions 1, 2 and 3) and cross-references. The disassembly matches Ztools' `txd`, byte for byte.

### Phase 1: the parser and the CLI (#1, #2)
- `@frotzinc/zcode` reads the header, memory map, text, dictionary, objects and globals of versions 3, 4, 5 and 8, matching Ztools' `infodump` byte for byte. It never throws on a bad file.
- The `frotzlens` CLI.

### Phase 0: the shared libraries
- `@frotzinc/worker-rpc`, `@frotzinc/nuxt-base` and `@frotzinc/inform6-wasm` 0.1.0 were extracted from Frotzsmith and published to npm.
