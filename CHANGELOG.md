# Changelog

All notable changes to Frotzlens: the web app at [frotzlens.frotzinc.com](https://frotzlens.frotzinc.com), and this repository. The packages keep their own changelogs: [`@frotzinc/zcode`](packages/zcode/CHANGELOG.md), [`frotzlens`](packages/cli/CHANGELOG.md) (the CLI), [`@frotzinc/worker-rpc`](packages/worker-rpc/CHANGELOG.md), [`@frotzinc/nuxt-base`](packages/nuxt-base/CHANGELOG.md), [`@frotzinc/inform6-wasm`](packages/inform6-wasm/CHANGELOG.md). Versions follow [Semantic Versioning](https://semver.org/). Part of [Frotz, Inc.](https://frotzinc.com).

## [Unreleased]

### Added
- The design for Phase 6, decompiling a story back to Inform 6 source, for review before any code ([docs/09-decompiler.md](docs/09-decompiler.md)).
- **Source** (for Inform stories): where decompiling to Inform 6 has got, step by step. It shows the source itself once the routines read well.

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
