# frotzlens — Design Document

**Status:** Draft 1, 6 November 2026
**Author:** Christopher Schweda
**Companion:** `frotzlens-kickoff-prompt.md` (the imperative version of this document, pasted into Claude Code)
**Repo:** `github.com/cschweda/frotzlens` · **Site:** [frotzlens.frotzinc.com](https://frotzlens.frotzinc.com) · **Family:** [frotz, inc.](https://frotzinc.com)

---

## 1. What it is, in one paragraph

frotzlens is a browser-based disassembler and inspector for Z-machine story files. You drop a `.z3`, `.z4`, `.z5`, `.z8`, or `.zblorb` into a tab and get a navigable, visual model of everything inside it: the header, the memory map, the object tree, the dictionary and grammar, every routine as cross-referenced disassembly, and every string. Supply Inform 6's `gameinfo.dbg` alongside the story and every address becomes a name. It is the browser-native successor to `txd` and `infodump`, the two Ztools utilities that have been the only way to look inside a story file since the early 1990s. Everything runs client-side; nothing is uploaded.

## 2. Why build it

**The gap is real and old.** The tools that exist for this job are `txd` and `infodump` (C, command-line, 1990s), Reform (a Haskell decompiler from 2004 that no longer builds on current Haskell), and UnZ (a VB.NET decompiler, in beta as of 2024). None runs in a browser. None is interactive. None knows it's looking at Inform output. Anyone who wants to see inside a story file today either compiles a C tool or gives up.

**The audience is small but exactly ours.** Inform 6 authors inspecting their own builds ("what did the compiler actually produce?"); IF archivists and reviewers looking at 1980s story files; people who lost their source and have only the binary. These are technical people who are not compiler people. They want the file made *legible*, not dumped.

**It feeds the rest of the family.** The parser frotzlens is built on (`@frotzinc/zcode`) is the foundation for frotztrace (the debugger), frotzpack's generated feelies (the map comes from the object tree), and a frotzsmith "inspect this build" panel. frotzlens is the first consumer of a library the whole product line needs.

**It fits what I already know.** I have a Z80 disassembler (Fugløy) with cross-reference and labeling passes, and a working Inform 6 toolchain in the browser (frotzsmith). The Z-machine is a smaller, better-documented target than the Z80, and the fixture corpus already exists.

## 3. Scope

### In scope for v1

- Z-machine versions 3, 4, 5, and 8, plus Blorb-wrapped story files (`.zblorb`), which are unwrapped to the embedded story.
- Full static model: header, memory map, abbreviations, ZSCII decoding, dictionary, object table with attributes and properties, globals, grammar table (Inform grammar versions 1 and 2), routine discovery and disassembly, string table, bidirectional cross-references.
- Symbolic mode from `gameinfo.dbg` (Inform 6's XML debug format, 6.33+).
- Inform fingerprinting without debug info: compiler version from header bytes `0x3C–0x3F`, recognition of the veneer and library routines (`Main__`, `FindIndivPropValue`, `RT__ChT`, the `Class`/`Object`/`Routine`/`String` metaclass objects), Standard Library vs PunyInform detection.
- A web app (the product) and a CLI (`npx frotzlens`) that prints `txd`/`infodump`-compatible text.
- "Copy as text" from every view, in the Ztools format, so frotzlens output is drop-in for anyone with scripts that parse `txd`.

### Out of scope for v1 (designed for, not built)

- **Version 6** (graphics windows, different routine addressing; almost nobody targets it).
- **Glulx.** A different VM. frotzsmith's Glulx target gets its own inspector later, likely sharing the UI shell.
- **Decompilation to Inform 6 source.** The prize for phase two. Z-code routines are stack-machine code with structured origins, so `if`/`else`/`while` recovery from branch targets is tractable, and object/property definitions decompile almost mechanically. The IR built in v1 (routines as basic blocks with typed operands) is the shape a decompiler needs.
- **Live execution** (breakpoints, stepping, watches). That's frotztrace, a separate product; frotzsmith's headless `ZmachineEngine` is its seed.
- **Any server.** Shared links and heavy jobs would need one; v1 does not.

## 4. Product principles

1. **Legible, not dumped.** The first thing you see after a drop is a dashboard, not a hex table. Every number is explained; every address is a link.
2. **Nothing leaves the machine.** No upload, no analytics on file contents, no server. This is a privacy promise and a simplicity promise.
3. **Byte-accurate.** The parser implements the *Z-Machine Standards Document 1.1* and is tested differentially against `txd` and `infodump`. Where frotzlens differs from them, the difference is deliberate and documented.
4. **Symbolic when it can be, honest when it can't.** With debug info, names everywhere. Without it, fingerprinting labels what it can recognize and leaves the rest as addresses. It never invents a name.
5. **No Infocom branding.** We say "the Z-machine" and "1980s story files." The product does not name the company or its games anywhere in UI, copy, or marketing, and fixtures are our own sources or public-domain ones.
6. **Accessible by construction.** WCAG 2.2 AA minimum, keyboard-operable everything, tested with NVDA. A tool that makes binaries legible to sighted users and opaque to screen-reader users has failed at its own premise.

## 5. Architecture

### 5.1 Shape

A pnpm monorepo with a strict one-way dependency rule: apps import libraries, never the reverse.

```
frotzlens/
├── packages/
│   ├── zcode/           @frotzinc/zcode          MIT   parser, disassembler, symbols
│   ├── worker-rpc/      @frotzinc/worker-rpc     MIT   extracted from frotzsmith
│   ├── nuxt-base/       @frotzinc/nuxt-base      MIT   shared look + Netlify kit
│   ├── inform6-wasm/    @frotzinc/inform6-wasm   MIT   Inform 6.44 + library texts
│   └── cli/             frotzlens                GPL   npx frotzlens
├── apps/
│   └── web/             (unpublished)            GPL   the Nuxt app
├── docs/
├── LICENSE              GPL-3.0-or-later (apps)
└── LICENSING.md         "Apps are GPL. Libraries are MIT."
```

### 5.2 `@frotzinc/zcode` — the core

Pure TypeScript. No DOM, no Vue, no `window`. `Uint8Array` in, typed model out. Progress via callback. Runs identically in a Web Worker, on the main thread, and in Node (which is how it's tested).

**Pipeline:**

1. **Container** — detect Blorb (`FORM` … `IFRS`); extract the `ZCOD` chunk and any `Fspc`/`Pict` cover reference. Otherwise treat the bytes as a bare story.
2. **Header** — version, release, serial, the five table addresses (abbreviations, dictionary, objects, globals, static/high memory bounds), initial PC, checksum, Inform compiler version bytes. Validate; record errors rather than throw.
3. **Memory map** — dynamic / static / high boundaries, and the located tables as labeled segments. This is what the dashboard draws.
4. **Text** — ZSCII decoder with the three alphabets, shift/lock semantics by version, abbreviation expansion, and the Unicode translation table (v5+). Packed-address scaling ×2/×4/×8 by version.
5. **Dictionary** — word separators, entry length, entry count; 4-byte (v1–3) or 6-byte (v4+) encoded words; the data bytes decoded as Inform's verb/adjective/noun flags where the file fingerprints as Inform.
6. **Objects** — property defaults table; per-object attributes (32 or 48 flags), parent/sibling/child, short name, property list with the v1–3 vs v4+ size-byte encodings. Rendered as a tree.
7. **Globals** — 240 words, each with its referrers once disassembly has run.
8. **Routines** — discovery by a linear sweep of the code area from the end of the dictionary, as txd does (*as built: on every story checked, a complete sweep finds exactly txd's routines, reachable or not, so no separate call-graph walk is needed. A crafted file that exhausts the sweep's work budget gets a partial list and a warning. See `03-phase-2-disassembler.md`*). Each routine decodes to instructions with typed operands (large constant, small constant, variable), stores, and branches (with the branch-on-true/false bit and the two offset encodings), in all four opcode forms (short, long, variable, extended).
9. **Grammar** — Inform's verb table: for each dictionary verb, its grammar lines → action numbers → action routines. Grammar version 1 and 2 encodings.
10. **Strings** — the string area after the code, read in order to the end of the file, as txd does: every string Inform writes, referenced or not (*as built: no heuristic scan or threshold — open question 6 is closed*).
11. **Cross-references** — for every routine, object, string, dictionary word, and global: who refers to it, and what it refers to. Bidirectional.
12. **Symbols** — optional overlay from `gameinfo.dbg`: routine names, object names, property and attribute names, action names, global names, array names, and source-line mappings. Applied as a layer over the model so the UI can toggle symbolic/raw without re-parsing.

**Model (top-level types):** `StoryFile`, `Header`, `MemoryMap`, `ZObject`, `Routine`, `Instruction`, `Operand`, `ZString`, `DictEntry`, `GrammarEntry`, `RoomGraph`, `Symbols`, `ParseError`. Every addressable thing has a stable ID (`routine:1b22`, `object:47`, `string:0412`) that the UI routes on.

**Error policy:** a truncated or corrupt file yields a model with `errors[]` populated and whatever could be recovered. Nothing throws past the core's boundary.

### 5.3 The extracted libraries

Three packages come out of frotzsmith in Phase 0, so the two apps share one source of truth:

- **`@frotzinc/worker-rpc`** — frotzsmith's `worker-rpc.ts`: long-lived worker, request IDs, timeouts, dead-worker recovery, explicit `ok | error | unavailable | timeout` outcomes. frotzlens uses it for the parse worker with the same worker-primary / main-thread-fallback shape as frotzsmith's `useI6Wasm`.
- **`@frotzinc/nuxt-base`** — `main.css` (the `--frotz-amber` token, `.frotz-glow`, `.frotz-grid`, the reduced-motion block), Nuxt UI color tokens, a base `nuxt.config` fragment (`ssr: false`, dark-default color mode, preload hints), `safe-storage`, `shortcut`, `slug`, and the generic Netlify tools (`inject-preloads`, `check-sw`, `version`, a parameterized redirects test). frotzsmith-specific tests (vendored-file hashes, its `netlify.toml`) stay in frotzsmith. Nuxt, Nuxt UI, and Vue are peer dependencies.
- **`@frotzinc/inform6-wasm`** — the pinned Inform 6.44 Emscripten build with its README (the 8 MB stack gotcha included), the Standard Library and PunyInform texts, and `compile(source, { version, library, debug })`. `debug: true` passes `-k` and reads `gameinfo.dbg` back from the virtual FS. This is how fixtures get built.

### 5.4 The CLI

`frotzlens` (GPL, unscoped, reserved on npm as `0.0.1`). `npx frotzlens game.z5` prints a `txd`-style dump; `--objects`, `--dict`, `--strings`, `--routine <addr>`, `--json`. It exists so the people who live in a terminal get the `txd` replacement they're searching for, and so the core's output can be diffed against the real `txd` in CI.

### 5.5 The web app

Nuxt 4, Nuxt UI v4, static output (`nuxt generate`), Netlify. The core runs in a worker. Hash routing (`#routine/1b22`) so every view is bookmarkable. Optional OPFS/IndexedDB cache of recently opened files, wrapped in `try/catch`, never load-bearing.

## 6. User interface

### 6.1 Direction

Dark by default, light available. Modern and sleek; the retro comes from one amber accent and a monospace face for data, not from CRT effects. Big type: titles 40–56px, section heads 24–28px, body 17px. Infographic-first: the post-drop landing state is a dashboard, not a table.

**Type:** Segoe UI Variable Display for headings, Segoe UI Variable Text for body, each falling back to Segoe UI → Open Sans (Google Fonts) → system. Data in Cascadia Code → JetBrains Mono → Courier Prime, with tabular numerals.

**Palette** (Nuxt UI tokens from `@frotzinc/nuxt-base`; nothing hard-coded in components):

| Token | Dark | Light | Use |
|---|---|---|---|
| ground | `#0e1116` | `#f3f1ea` | page |
| ink | `#e6dfcf` | `#17202a` | text |
| ink-2 | `#9a9688` | `#4b5563` | secondary |
| panel | `#151a21` | `#e8e5da` | cards, code |
| rule | `#2a2f38` | `#c9c6bb` | borders |
| lamp | `#f0a830` | `#d98b1e` | accent: borders, glow, selection |
| lamp-text | `#f0a830` | `#8a5208` | accent as text (AA on both grounds) |

### 6.2 First load

One large drop zone. One sentence: "Drop a Z-machine story file to see what's inside." A "try a sample" button that loads `dark-cellar.z5`. Nothing else. The page must be complete at rest and obvious to someone who has never heard of a Z-machine.

### 6.3 After a drop: the Overview

- **Memory map**, drawn to scale as a horizontal bar: dynamic / static / high, with the header, object table, dictionary, globals, abbreviations, and routine region as labeled segments. Hover shows byte ranges; click opens that segment in the Memory view.
- **Tiles:** objects, routines, strings, dictionary words, file size, version. Big numbers, small labels.
- **"What is this file":** version and release/serial; Inform compiler version if fingerprinted; detected library (Standard Library 6.x / PunyInform / none); Blorb cover if present; whether debug symbols are loaded.
- Any `errors[]` from the parse, shown plainly at the top.

### 6.4 Views (left nav, each a route)

| View | Shows | Links to |
|---|---|---|
| **Memory** | The map, zoomable; a hex pane for the selected segment with structures highlighted and annotated in the gutter | everything at that address |
| **Objects** | Collapsible, keyboard-navigable tree; detail pane with attributes as a flag row, properties as a decoded table, parent/sibling/child | property values that are routines or strings; the object's referrers |
| **Dictionary** | Searchable list; entry bytes decoded; verb/noun flags when Inform | a verb's grammar; words' referrers |
| **Grammar** | Verb → grammar lines → action → routine | dictionary words, action routines |
| **Routines** | List with call counts; detail is disassembly with operands as links, branch targets as gutter arrows, strings inlined, "calls" and "called from" panels | everything an instruction touches |
| **Strings** | The full table, searchable, each with its referrers | referring routines and properties |
| **Symbols** | Drop zone for `gameinfo.dbg`; status of what loaded | toggles symbolic mode globally |

**Global:** command palette (`Cmd/Ctrl+K`) to jump to any routine, object, string, or dictionary word by name or address; breadcrumbs; a symbolic/raw toggle in the header once symbols are loaded; "copy as text" on every view, emitting the Ztools format for that section.

**Phase 5, symbolic only:** a `RoomGraph` derived from `n_to`/`s_to`/… properties, exported in the shape frotzsmith's map renderer draws, so an auto-map of any Inform game with debug info is one click.

### 6.5 Accessibility

WCAG 2.2 AA minimum. The tree and tables are keyboard-operable (arrow keys, Home/End, type-ahead). Focus is always visible. `prefers-reduced-motion` is honored. Color never carries meaning alone (the memory map segments are labeled; the branch arrows have text equivalents). AA contrast in both themes, including the amber, which is why there are two amber tokens. Tested with NVDA before each release.

### 6.6 Responsive

Works to 400px. Data views scroll horizontally inside their own containers; the page never does. On phones the nav collapses and the memory map stacks its labels.

## 7. Testing strategy

- **Fixtures** are compiled at test time by `@frotzinc/inform6-wasm` from `.inf` sources copied out of frotzsmith's samples (my own games: `dark-cellar`, `locked-chest`, `hermit`, `mingus-1`, `architect-legacy`, `demo`, `grammar`, `list-exits`, `magic-8-ball`; `haunted-house` is excluded, see §11), each with a fixed serial so builds are reproducible. Most are built with `-k`, so there is a `.dbg` to test symbolic mode against. `dark-cellar` is built as v5 and v8; its PunyInform port as v3, v4 and v5 (the Standard Library needs v5+). `minimal.z5` (an empty `Main`, no library) is the no-veneer case, `gv1` uses grammar version 1, and `abbrev` is compiled in economy mode so the abbreviation table is real. A `.zblorb` will come from a small IFF writer in the test helpers (Phase 5). Corrupt files are generated in the tests from the fixtures.
- **No ZIL fixtures in v1.** ZILF is GPL, its sample games are GPL, and running it would tie this repo to frotzsmith's build. Z-code is Z-code.
- **Differential tests against `txd`/`infodump`,** compiled to WASM into the test tree if their license allows (to be established first), otherwise against committed golden output from one native run. Routine boundaries, object counts, and string tables must match; documented deliberate differences are allowed.
- **Spec citations.** Wherever the Standard is non-obvious (packed addresses, property size bytes, abbreviation expansion, branch offsets, v4+ dictionary entries), the code comment cites the section.
- **App:** one Playwright smoke test (drop a file, assert the object tree renders); axe-core in CI; Vitest for composables.

## 8. Licensing

**Apps are GPL-3.0-or-later. Libraries are MIT.** This is [frotz, inc.](https://frotzinc.com) policy.

frotzsmith is GPL because it bundles the GPLv3 ZILF compiler; frotzlens's app and CLI match it so the two can share code freely. Every `@frotzinc/*` package is MIT so that other people's tools — editor extensions, interpreters, archive bots — can depend on the parser without a license review. Two rules keep the line clean: dependencies point only from apps to libraries, and no library ever bundles GPL code. The Inform 6 compiler (Artistic 2.0), the Standard Library (Artistic 2.0), and PunyInform (MIT) are all fine to wrap in a library; ZILF stays in the frotzsmith app.

I hold copyright on all of it and can relicense my own code at any time; the policy constrains users, not me.

## 9. Branding and deployment

- Icon: the amber rounded badge with a loupe over a row of bytes. Same badge shape as frotzsmith's hammer; the family rule is "same badge, different instrument."
- Every page's footer: the frotz, inc. lantern mark + "From frotz, inc." → [frotzinc.com](https://frotzinc.com); GitHub and npm; "frotz, inc. is a fiction. The Frotz interpreter is the work of its own authors and is not affiliated."
- Social card 1200×630 in the house style (already made). Full OpenGraph/Twitter meta.
- Canonical URL `https://frotzlens.frotzinc.com/` (the family's subdomain, decided 2026-11-06), as one config value (`apps/web/site.config.ts`).
- Netlify, static, pnpm monorepo with base `apps/web`. I connect the repo in the Netlify UI; the kickoff prompt tells Claude it can't. **The site goes in Chris's personal Netlify account, not the ICJIA (work) team.**

## 10. Phases

| Phase | Builds | Done when |
|---|---|---|
| **0** | Extract `worker-rpc`, `nuxt-base`, `inform6-wasm` from frotzsmith; validate with `yarn link`; publish 0.1.0; one commit on frotzsmith's `frotzinc-packages` branch importing them | Packages on npm; frotzsmith green on the branch |
| **1** | Core parser: header, memory map, text, dictionary, objects, globals; fixtures; CLI | `npx frotzlens --objects dark-cellar.z5` matches `infodump` |
| **2** | Disassembler: all opcode forms, branches, routine discovery, strings, cross-refs; differential tests | `npx frotzlens --routine <addr> dark-cellar.z5` matches `txd` |
| **3** | Web app shell: drop zone, Overview dashboard, hash routing, command palette, footer, `netlify.toml` | Dashboard renders on the Netlify preview |
| **4** | Data views: Objects, Dictionary, Grammar, Routines, Strings, Memory/hex; linking everywhere; copy-as-text; Playwright smoke | Full navigation of `architect-legacy.z5` |
| **5** | Symbols from `.dbg`, Inform fingerprinting, Blorb unwrap, `RoomGraph`, accessibility audit, light-mode pass, docs; publish `@frotzinc/zcode` and `frotzlens` 0.1.0 | frotzlens 0.1.0 live at frotzlens.frotzinc.com |

Each phase ends with a working, deployable state and a review checkpoint.

## 11. Open questions

Settled in the first session, recorded here as they close:

1. **Ztools license.** Determines whether `txd`/`infodump` are compiled into the test tree or run once for golden files.
2. **Sample authorship.** Each frotzsmith sample is checked before it becomes a fixture.
3. **`yarn link` vs `file:` paths** for validating the Phase 0 extraction against frotzsmith.
4. **Nuxt 5.** If stable at build time, flag it; don't switch silently.
5. **Canonical domain.** Decided 2026-11-06: `frotzlens.frotzinc.com` (DNS at DNSimple). One config value either way.
6. **String-scan heuristics.** How aggressive the unreferenced-string sweep should be before it produces garbage. Tune against the fixtures; document the threshold. *(Closed: no heuristic — see below.)*

### Decisions recorded, 6 November 2026

- **Q3 closed — `file:` tarballs.** Phase 0 validates frotzsmith against `npm pack` tarballs referenced by `file:` paths, not `yarn link`, so the published `files` field is exercised.
- **Q4 closed — no Nuxt 5.** No 5.x on npm (`latest` is 4.6.4). Pin Nuxt 4.6.4, Nuxt UI 4.12.0.
- **Placeholder package corrected.** The 0.0.1 README/`package.json` said MIT, an `@frotzlens` scope, and carried an `infocom` keyword. The CLI is GPL-3.0-or-later, the scope is `@frotzinc`, and the keyword goes (principle 5). 0.0.1 stays MIT on npm; 0.1.0 ships GPL.
- **`@frotzinc/nuxt-base` is a Nuxt layer** (consumed via `extends`) for CSS, tokens, and the config fragment, plus plain exports for `safe-storage`, `shortcut`, `slug`, and the Netlify tools.
- **Fixtures added:** a **v4** build (v4 is in scope), and a small **grammar-version-1** fixture (`Constant Grammar__Version 1;`), since Inform 6.44 defaults to GV2. *(The v4 build turned out to need PunyInform; superseded by the Phase 1 fixtures note below.)*
- **Non-Inform story files:** v1 decodes header, memory map, text, dictionary, objects, globals, routines, and strings for any Z-machine file; the Grammar view shows "grammar not decoded (non-Inform file)". Grammar decoding is Inform GV1/GV2 only.
- **Fonts are self-hosted** via `@nuxt/fonts`; the site makes no third-party requests.
- **One amber for the family.** Dark `lamp`/`lamp-text` is frotzsmith's `--frotz-amber` `#f0a830` (was `#f2a33a` in Draft 1), so both apps look alike; `--frotz-amber` is an alias of `lamp`. Contrast: 9.32:1 on ground, 8.61:1 on panel. Light `lamp-text` `#8a5208`: 5.65:1 on ground, 5.06:1 on panel.
- **Q1 closed — Ztools has no license.** No grant, notice, or license file in 7/3.1 (1998), the 2024 modern-C update, or Russotto's GitLab repo; default is all rights reserved. Use the fallback: build `txd`/`infodump` natively outside the repo, run once per fixture, commit their text output as golden files with provenance (Ztools version, exact command). Nothing from Ztools is committed or redistributed.
- **Q2 closed — sample authorship.** Chris confirms every frotzsmith sample is his own. `haunted-house` is still excluded from fixtures: its header says it is reverse-engineered from a 1979 commercial game.
- **`@frotzinc/inform6-wasm` replaces frotzsmith's compile path.** frotzsmith imports `compile()` instead of its own `compile-main.ts`. The API carries what frotzsmith needs: `extensions` (with `overridesLibrary`), stats, raw output, and a `locateFile` option for the bundler-emitted `.wasm` URL.
- **Relicensed to MIT on extraction** (Chris's own GPL code): `parse-diagnostics.ts` and the `Exits.h` helper.
- **Q6 closed — no string-scan heuristic.** Like txd, the string area is read whole, in order, from the end of the code to the end of the file; every string Inform writes is found, referenced or not, with no threshold to tune. See `03-phase-2-disassembler.md`.
- **The CLI's default is the txd disassembly** (as §5.4 always said); Phase 1 printed the header while there was no disassembler.
- **Phase 1 fixtures (2026-11-06):** the Standard Library targets v5+ only, so the v3 and v4 fixtures are `puny-dark-cellar`; `dark-cellar` is built as v5 and v8. Every fixture gets `Serial "000000";` so builds are byte-for-byte reproducible. See `02-phase-1-core-parser.md` §8.

### Decisions recorded, 6 November 2026 (after Phase 5)

- **Play.** The open story can be played in a Play view, through Parchment, as in frotzsmith. It runs in a sandboxed, opaque-origin iframe with its own CSP under `/play/`, the only place with `'unsafe-eval'`. It's the game itself, not the deferred live debugger (frotztrace). See `07-play.md`.

## 12. Later

In rough order of likelihood: decompilation to Inform 6 (the phase-two prize); a frotzsmith "inspect build" panel using the same core; story-file diff (two builds, or two releases of the same game); Glulx; frotztrace, which starts from this model plus frotzsmith's headless engine.
