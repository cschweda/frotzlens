# Changelog

All notable changes to frotzlens: the web app at [frotzlens.frotzinc.com](https://frotzlens.frotzinc.com), and this repository. The packages keep their own changelogs: [`@frotzinc/zcode`](packages/zcode/CHANGELOG.md), [`@frotzinc/zcode-ui`](packages/zcode-ui/CHANGELOG.md), [`frotzlens`](packages/cli/CHANGELOG.md) (the CLI), [`@frotzinc/worker-rpc`](packages/worker-rpc/CHANGELOG.md), [`@frotzinc/nuxt-base`](packages/nuxt-base/CHANGELOG.md), [`@frotzinc/inform6-wasm`](packages/inform6-wasm/CHANGELOG.md). Versions follow [Semantic Versioning](https://semver.org/). Part of [frotz, Inc.](https://frotzinc.com).

## [0.3.7] - 2026-11-08

frotztrace begins. frotzlens looks and works as before.

### Added
- **`@frotzinc/zcode-ui`** ([packages/zcode-ui](packages/zcode-ui), MIT, 0.1.0): frotzlens's story views as a Nuxt layer, so frotztrace can show a running story with the same components and the same look (frotztrace Phase 0, [docs/17](docs/17-frotztrace-phase-0-zcode-ui.md)). `ObjectTree`, `GlobalsView`, `MapView`, `SearchPalette`, `AppNav`, the links and headers they use, `useHashRoute`, `useSymbols` and the naming utils move out of `apps/web`; the hex pane and the disassembly are split out of the Memory and Routines views as `HexPane` and `Disassembly`. The views take an optional `live` prop, unused until frotztrace has a machine to show. frotzlens extends the layer; its Playwright and axe suite passes unchanged.
- `publish.sh` publishes `zcode-ui`, with a smoke test (`scripts/smoke/zcode-ui.mjs`) that also fails if the layer ever ships CSS: the look stays in `@frotzinc/nuxt-base`.
- **frotztrace's design, Draft 2** ([docs/frotztrace-design.md](docs/frotztrace-design.md)) and its kickoff prompt ([docs/frotztrace-kickoff-prompt.md](docs/frotztrace-kickoff-prompt.md)), revised for what frotzplay built: the debugger goes into the existing `@frotzinc/zmachine` as an additive `Debugger`, the Screen pane reuses `@frotzinc/player`, the ZVM oracle and the conformance licences are settled, and the phases are re-cut (§10, §13). Its social card is drafted in `docs/frotztrace/`.
- The README lists frotztrace as in development.

## [0.3.6] - 2026-11-08

### Changed
- The README opens by saying what this repository holds: two apps, **frotzlens** (`apps/web`, frotzlens.frotzinc.com) and **frotzplay** (`apps/play`, frotzplay.frotzinc.com), and the `@frotzinc/` libraries and `frotzlens` CLI they share. Its status badge says v0.3.6.
- "the frotz family", lower case, in the README and two frotzplay design docs.
- [docs/16](docs/16-frotzsmith-on-frotzplay.md): the folder (.zip) export is done, in frotzsmith 0.2.2.

## [0.3.5] - 2026-11-07

### Changed
- The family's names are lower case everywhere: frotzlens, frotzsmith, frotzplay, and frotz, Inc. (the README, comments and any text shown).
- The og:image and logo say frotzlens; the og:image is re-rendered.

## [0.3.4] - 2026-11-07

### Changed
- [docs/16](docs/16-frotzsmith-on-frotzplay.md) records what's done: `@frotzinc/player` 0.2.0 is on npm, and frotzsmith 0.2.0 plays in frotzplay, with Parchment as a choice.

## [0.3.3] - 2026-11-07

### Added
- [docs/16](docs/16-frotzsmith-on-frotzplay.md): a plan for moving frotzsmith from Parchment to frotzplay. Play, Send-to-Play, the transcript, auto-map and Skein go through `ZPlayer`; *Export* uses frotzplay's single file; Parchment stays behind a setting for a release or two, and is then retired.

## [0.3.2] - 2026-11-07

frotzlens itself is unchanged; this release gets frotzplay's packages ready for npm.

### Changed
- **`publish.sh` publishes `@frotzinc/zmachine` and `@frotzinc/player`.** A library may now depend at run time on the `@frotzinc` package it's built on (zmachine on zcode, player on zmachine), at an exact version already on npm, as the CLI does. Each has a smoke test in `scripts/smoke/` that installs the packed tarball on its own: zmachine plays a 72-byte story made in the test, and the player (with Vue, its peer) exports one as a single file and as a `.zip`.
- **frotzplay runs its interpreter on the main thread, decided** ([docs/14 §5](docs/14-frotzplay-phase-4-site.md)): its cooperative budget already keeps a looping story from freezing the page, so there's no worker.

## [0.3.1] - 2026-11-07

frotzlens itself looks and works the same; this release moves its shell into `@frotzinc/nuxt-base` and brings frotzplay into the repository.

- **frotzplay 0.1.0** is live at [frotzplay.netlify.app](https://frotzplay.netlify.app): the site, `@frotzinc/zmachine` 0.1.0 and `@frotzinc/player` 0.1.0 ([its changelog](apps/play/CHANGELOG.md)). The player now sits on its own warm "paper" page.

### Added
- **frotzplay** begins in this repository: an accessible Z-machine player for screen-reader users and strict-CSP pages ([design](docs/frotzplay-design.md)). Its interpreter, `@frotzinc/zmachine`, plays every sample exactly as ZVM does ([Phase 1](docs/11-frotzplay-phase-1-interpreter.md)), saves games that restore in ZVM and the other way round, and passes the Czech and Praxix conformance suites ([Phase 2](docs/12-frotzplay-phase-2-state.md)). Its player, `@frotzinc/player`, has the accessibility contract built in and tested in three browsers ([Phase 3](docs/13-frotzplay-phase-3-player.md), [the contract](docs/accessibility.md)). Its site, `apps/play`, is built: the start page with sample stories, every way a story arrives, Blorb covers, a PWA ([Phase 4](docs/14-frotzplay-phase-4-site.md)). The `<frotz-play>` web component embeds under a strict CSP, and *Export* makes a single HTML file or a folder that plays from a double-click ([Phase 5](docs/15-frotzplay-phase-5-embed-export.md)).
- `samples/`: v4 builds of *The Dark Cellar* and *The Locked Chest* (PunyInform), and a walkthrough for every sample game (`samples/walkthroughs/`).

### Changed
- The header, footer and About menu moved into `@frotzinc/nuxt-base`, to share with frotzplay. frotzlens looks and works the same. Its identity is now `product` in `app/app.config.ts` (built from `site.config.ts`), and its own header buttons are `HeaderActions`.

## [0.3.0] - 2026-11-07

Phase 6: decompiling to Inform 6. `@frotzinc/zcode` 0.3.0 and the `frotzlens` 0.3.0 CLI carry it, and are on npm.

### Added
- **The Source view: Inform 6 source.** An Inform story (versions 3, 4, 5 and 8; the Standard Library, PunyInform or none) decompiled to one `.inf`, made in a worker and checked there: compiled again with Inform 6.44 in WebAssembly, every routine compared with the story's, and any that doesn't come back the same written plainer, down to Inform assembly. The compiler is fetched only when Source is opened. Download it as an `.inf`, copy it, or follow a routine's "This routine as Inform 6 source" link from the Routines view. With the story's debug file loaded, the source's own names; without one, names made up from the story ([details](docs/09-decompiler.md)).
  - **The library as `Include`s,** and the game's constants, globals, arrays, attributes, properties, classes (read from the prototype Inform keeps after each class object), objects and grammar (`Verb`, `Extend`) as Inform declares them (6a).
  - **Routines as statements:** the stack followed into nested expressions (`y = x*2 - g;`), with prints, calls and returns (6b).
  - **Control flow:** `if`/`else`, `&&`/`||`, `while`, `do … until`, `switch`, `objectloop` and action cases (`Take, Drop: …`), in the shapes Inform compiles each to (6c).
  - **Inform's syntax for what its veneer does:** `o.p`, `o.p(args)`, `provides`, `ofclass`, `move`, `give`, `print (name)`, `a-->i`, `x in y`, with strict mode's inlined checks taken out (they come back when it's compiled). The veneer isn't written out: the compiler writes its own (6d).
  - **Without a debug file, too:** the library is found by compiling it alone, set up as the story was (its extensions and the game's library settings tried in turn), and lined up with the story routine by routine.
  - **The proof, in CI:** every test game, with and without its debug file, compiles again to an equivalent story, every routine as Inform with no assembly left; with its debug file, every one byte for byte.
- `frotzlens --inform game.z5` does the same in a terminal.
- A link with `?sample` opens the sample straight away: `/?sample#source` is its Inform 6 source.
- The README has a screenshot of the Source view, and Phase 7 (decompiling to ZIL) as coming soon.

### Changed
- The site's Content-Security-Policy allows `wasm-unsafe-eval`, for the Source view's compiler.
- The test stories for versions 3, 4 and 8 and economy mode are built with debug files too.

## [0.2.0] - 2026-11-07

`@frotzinc/zcode` 0.2.0 and the `frotzlens` 0.2.0 CLI carry the ZIL grammar, and are on npm.

### Added
- **An About menu** in the header, as in Drafter:
  - **About frotzlens:** every version (the site's, with its commit and date, and each package the site is built from) and every licence, with "Copy technical details".
  - **What's new:** this changelog.
  - **Report a problem…** and **Suggest a feature…**: GitHub's issue form, filled in with what you write and the technical details, for you to review and submit there. frotzlens sends nothing, and never the story file.
  - **Check for updates:** whether the site has been updated since the page opened.
- The footer links the changelog and shows the version.
- `SECURITY.md`, and GitHub issue forms for problems and features.
- The README has screenshots, who frotzlens is for, and what it does that nothing else does.
- **ZIL grammar.** A ZILF-compiled story's syntax tables are decoded: every verb, its words and syntax lines (shown as each `SYNTAX` form reads), its action and pre-action routines, and the prepositions. They appear in the Grammar view and in `frotzlens -g`, and dictionary words link to their verbs. They're checked against the `<SYNTAX>` forms in zillib and four ZILF games ([details](docs/08-zil-grammar.md)).

## [0.1.0] - 2026-11-07

The first release. `@frotzinc/zcode` 0.1.0 and the `frotzlens` 0.1.0 CLI are on npm.

### Play (#14)
- A Play view runs the open story in Parchment, the interpreter frotzsmith uses. It's sandboxed in an opaque-origin iframe with its own Content-Security-Policy, so a story can't reach the app ([details](docs/07-play.md)).

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
- `@frotzinc/worker-rpc`, `@frotzinc/nuxt-base` and `@frotzinc/inform6-wasm` 0.1.0 were extracted from frotzsmith and published to npm.
