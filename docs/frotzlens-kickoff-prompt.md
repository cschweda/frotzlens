# Frotzlens — Kickoff Prompt

## Before you paste (setup checklist for Chris)

Phase 0 edits two repos, so set up both before starting Claude Code:

1. **Clone Frotzsmith as a sibling** of the new repo, so the layout is `…/frotzlens/` and `…/frotzsmith/`. The prompt refers to it as `../frotzsmith`.
2. **Create the Frotzsmith branch yourself** so nothing lands on `main`:
   `git -C ../frotzsmith checkout -b frotzinc-packages`
3. **Start Claude Code inside `frotzlens/`.** That's its primary directory. It can read `../frotzsmith` freely and will ask permission the first time it edits a file there — say yes; that's correct behavior.
4. **Be logged in to `gh`** (`gh auth status`) so it can open the Phase 0 PR against Frotzsmith.
5. **npm publish will prompt for your 2FA code** (org enforcement is on). Claude runs the command; you type the code.
6. **Review gate:** the pre-code checklist makes Claude list every file it intends to move out of Frotzsmith before moving anything. Read that list with one question: *does any of this import from Frotzsmith's app code?* If yes, it belongs on the other side of the GPL/MIT line.
7. **Ask for the Frotzsmith change as a single commit on the branch, and to show the diff before pushing.** The extraction is mechanical, but it's the one step that can break a working app.
8. **Phase 3 needs you in the Netlify UI** to connect the repo (base directory `apps/web`); Claude can't do that part.
9. **Expect two licensing questions from Claude:** the Ztools (`txd`/`infodump`) license before it vendors them, and authorship of each Frotzsmith sample before it becomes a fixture.

Then paste everything below the line into the session.

---

You are the lead engineer on **Frotzlens**, a browser-based disassembler and inspector for Z-machine story files. I'm Chris Schweda (GitHub `cschweda`), a senior web developer and interactive-fiction author. You and I are building this together; you write the code, I review and direct. Work in phases, stop at each checkpoint for my review, and ask before making any architectural decision not already settled below.

## What Frotzlens is

Drop a `.z3`/`.z4`/`.z5`/`.z8` or `.zblorb` file into a browser tab and get a navigable, visual model of everything inside it: header, memory map, abbreviations, dictionary, object tree with attributes and properties, globals, grammar table, every routine as cross-referenced disassembly, and the string table. When given Inform 6's `gameinfo.dbg` debug file alongside the story, every address becomes symbolic (routine names, object names, property names, source line references).

It is the browser-native successor to `txd` and `infodump` from the Ztools suite, with an Inform 6 focus. Everything runs client-side. Nothing is uploaded. It is the companion product to **Frotzsmith** (frotzsmith.com, repo `cschweda/frotzsmith`), a browser IDE for Inform 6 and ZIL, and part of the **Frotz, Inc.** family ([frotzinc.com](https://frotzinc.com)).

**Audience:** Inform 6 authors inspecting their own builds; IF archivists and reviewers poking at 1980s story files; people who lost their source. They are technical but not necessarily compiler people. The UI must make a binary file *legible*, not just dump it.

**Not in scope for v1:** Z-machine v6 (graphics), Glulx, decompilation to Inform 6 source, live execution/debugging (that's a future product, frotztrace). Build the intermediate representation so these are possible later; don't build them now.

## Licensing (settled)

**Apps are GPL-3.0-or-later. Libraries are MIT.** This is Frotz, Inc. policy across every product.

- `apps/web` and `packages/cli` (the `frotzlens` npm package, an app) → **GPL-3.0-or-later**. Frotzsmith is GPL because it bundles the GPLv3 ZILF compiler; Frotzlens matches it so the two apps can share code freely.
- Every `@frotzinc/*` package → **MIT**. These are infrastructure for other people's tools and must be usable without a license review.
- **Dependencies point one way: apps → libraries.** A library never imports from an app. If a library needs something that lives in an app, move it into a library first.
- **A library never bundles GPL code.** ZILF stays in the Frotzsmith app. The Inform 6 compiler (Artistic 2.0) may be wrapped in a library.
- Each package gets its own `LICENSE` file and a correct `"license"` field. The repo root carries `LICENSE` (GPL) for the apps and `LICENSING.md` stating the policy in two sentences.
- I retain copyright and may relicense my own code; nothing here changes that.

## Stack (settled — do not revisit)

- **Nuxt 4** with **Nuxt UI v4**, TypeScript strict, **pnpm** workspaces. Frotzsmith is on Yarn 1 and Nuxt 4.6 / Nuxt UI 4.12 as of November 2026; match or exceed those versions. Nuxt 5 if stable at build time; flag it, don't switch silently.
- **Monorepo:**
  - `packages/zcode` — `@frotzinc/zcode` (MIT): parser, disassembler, symbol loader. Pure TypeScript, zero DOM, zero Nuxt. `Uint8Array` in, typed model out. This is the asset; the app is a consumer.
  - `packages/worker-rpc` — `@frotzinc/worker-rpc` (MIT): extracted from Frotzsmith's `app/composables/worker-rpc.ts` and its tests. Long-lived worker, request IDs, timeouts, dead-worker recovery.
  - `packages/nuxt-base` — `@frotzinc/nuxt-base` (MIT): the shared Frotz, Inc. look and deploy kit, extracted from Frotzsmith: `main.css` (the `--frotz-amber` token, `.frotz-glow`, `.frotz-grid`, the reduced-motion block), color tokens for Nuxt UI, a base `nuxt.config` fragment (`ssr: false`, color mode defaulting to dark, preload hints; PWA as an opt-in), `safe-storage.ts`, `shortcut.ts`, `slug.ts`, and the **generic** Netlify tools: `inject-preloads.mjs`, `check-sw.mjs`, `version.mjs`, and a parameterized `redirects` test. **Leave behind** anything Frotzsmith-specific: `vendored-files.json` and its test, `supply-chain.test.ts`, `netlify-headers.test.ts` (they encode Frotzsmith's Parchment hashes and its `netlify.toml`). Do not generalize them in Phase 0. `nuxt`, `@nuxt/ui`, and `vue` are **peerDependencies**, never dependencies.
  - `packages/inform6-wasm` — `@frotzinc/inform6-wasm` (MIT wrapper; upstream Artistic 2.0): Frotzsmith's pinned Inform 6.44 Emscripten build (`inform6.mjs`, `inform6.wasm`) with its README, **plus the library texts the compiler needs** — Frotzsmith's `PROFILE_FILES` (Inform Standard Library, Artistic 2.0; PunyInform, MIT) from `app/modules/inform6/lib/`. Without them nothing that says `Include "Parser"` compiles. Expose `compile(source, { version, library: 'std' | 'puny', debug })` returning `{ story, dbg?, diagnostics }`; `debug: true` passes `-k` and reads `gameinfo.dbg` back out of Emscripten's virtual FS after the run.
  - `packages/cli` — `frotzlens` (GPL, unscoped, already reserved on npm as `0.0.1`): `npx frotzlens game.z5` prints a `txd`-style dump; `--strings`, `--objects`, `--dict`, `--routine 1b22`, `--json`. Wraps `@frotzinc/zcode`.
  - `apps/web` — the Nuxt app (GPL). Static (`nuxt generate`), deployed to Netlify. No server routes in v1; a user's story file never leaves their machine. If something later needs a server (shared links, heavy jobs), flag it and we'll use a DigitalOcean droplet, but default to "no server."
- **Web Workers** for parsing, via `@frotzinc/worker-rpc`, with the same worker-primary / main-thread-fallback shape as Frotzsmith's `useI6Wasm.ts`, so the core also runs in Node for tests.
- **Storage:** none required. OPFS or IndexedDB may cache recently opened files for convenience, wrapped in try/catch, never load-bearing.
- **Testing:** Vitest for packages, fixture-driven (see below); golden tests in Frotzsmith's `*.golden.test.ts` style. Playwright for one smoke test of the web app (drop a file, assert the object tree renders).
- **Tooling:** ESLint (Nuxt config), Prettier, Husky pre-commit running lint + package tests. GitHub Actions on push: lint, test, build, Netlify deploy preview. axe-core CLI in CI as Frotzsmith does.

## Architecture rules

1. **`@frotzinc/zcode` knows nothing about the UI.** No Vue imports, no DOM, no `window`. Progress is reported through a callback.
2. **The core model is the single source of truth.** The app never re-parses bytes; it renders what the core returns. Types live in the core and are imported by the app.
3. **Everything addressable is linkable.** Every routine, object, string, dictionary word, and global has a stable ID. The app routes on the hash (`#routine/1b22`, `#object/47`) so any view can be bookmarked and every reference in the UI is a link.
4. **Byte-accurate against the Standard.** Implement from the *Z-Machine Standards Document 1.1* (inform-fiction.org/zmachine/standards). Cite the section in a comment wherever the spec is non-obvious: packed addresses (×2/×4/×8), property size bytes (v1–3 vs v4+), abbreviation expansion, branch offsets, v4+ dictionary entries.
5. **Differential testing against txd/infodump.** The Ztools sources are small C. **First establish their license** (the IF Archive copy has no clear statement; check the source headers and Russotto's later releases) and report it to me. If it's compatible, compile `txd` and `infodump` with Emscripten into `packages/zcode/test/reference/`, test-only and excluded from the published package via `files`, and for every fixture assert that our routine boundaries, object counts, and string table match theirs. If the license is unclear, run the native binaries once, commit their text output as golden files with provenance noted, and diff against those instead. Where we deliberately differ (better string discovery, symbolic names), document it in the test.
6. **Graceful on bad input.** A truncated or corrupt file produces a model with an `errors[]` array and whatever could be recovered, never a thrown exception reaching the UI.
7. **No Infocom branding or trademarks** anywhere in the UI, copy, or marketing. We say "1980s story files" and "the Z-machine." We don't name the company or its games. Fixtures come only from our own sources or public-domain ones.

## Fixtures

Compiled at test time with `@frotzinc/inform6-wasm`, so tests are deterministic, no story-file binaries are vendored, and the test suite has no dependency on `../frotzsmith` being present:

- Copy the `.inf` sources from Frotzsmith's `app/modules/inform6/samples/` into `packages/zcode/test/fixtures/src/`: `dark-cellar`, `haunted-house`, `locked-chest`, `hermit`, `mingus-1`, `architect-legacy`, and `demo`. For each, check the header comment for authorship (they must be Chris's own) and confirm it compiles standalone; `grammar`, `list-exits`, and `magic-8-ball` may be snippets rather than games — include them only if they compile on their own. Build each as v5 with `debug: true`, so every fixture has a `.dbg` for symbolic tests. Build `dark-cellar` additionally as v3 and v8 (packed-address scaling) and once against PunyInform (a second library veneer).
- **No ZIL fixtures in v1.** ZILF is GPL, Frotzsmith's ZIL samples come from the ZILF repository under GPL, and running ZILF at test time would make this repo depend on Frotzsmith's build. Z-code is Z-code; the parser doesn't care which compiler produced it.
- `minimal.z5` — an empty `Main`, no library, the smallest valid file. This is also the "no veneer at all" case.
- `dark-cellar.zblorb` — the v5 build wrapped in Blorb with a small PNG cover. Nothing in the stack writes Blorb; add a ~40-line IFF/Blorb writer to the test helpers (and keep it — frotzpack will want it).
- `corrupt-truncated.z5`, `corrupt-badheader.z5` — generated in the test from `dark-cellar.z5`.

## UI direction

Dark mode by default, light mode via Nuxt UI color mode. Modern and sleek; the retro flavor comes from the amber accent and a monospace face for data, not from CRT effects.

- **Typography:** Segoe UI first — `"Segoe UI Variable Display"` for headings and `"Segoe UI Variable Text"` for body, each falling back to `"Segoe UI", "Open Sans", system-ui, sans-serif` — with Open Sans from Google Fonts as the web fallback. **Big type:** page titles 40–56px, section heads 24–28px, body 17px. Data in a monospace stack (`"Cascadia Code", "JetBrains Mono", "Courier Prime", monospace`) with `tabular-nums`.
- **Palette** (tokens from `@frotzinc/nuxt-base`; never hard-code a color in a component). Dark / light: `ground` `#0e1116` / `#f3f1ea`; `ink` `#e6dfcf` / `#17202a`; `ink-2` `#9a9688` / `#4b5563`; `panel` `#151a21` / `#e8e5da`; `rule` `#2a2f38` / `#c9c6bb`; `lamp` `#f2a33a` / `#d98b1e` for borders, glow, and selection; `lamp-text` `#f2a33a` / `#8a5208` for amber used as text, so it passes AA on both grounds. Two amber tokens on purpose: the bright one fails AA as text on paper.
- **Infographic-first.** After a drop, the landing state is a **dashboard**, not a table: a memory map drawn to scale as a horizontal bar (dynamic / static / high, with header, objects, dictionary, and routines as labeled segments), big-number tiles (objects, routines, strings, dictionary words, file size, version), and a short "what is this file" summary (Inform version from header bytes 0x3C–0x3F, release/serial, detected library). From there the user drills in.
- **Views** (left nav, each a route):
  - **Overview** — the dashboard.
  - **Memory** — the map, zoomable; clicking a segment opens a hex view with structures highlighted and annotated in the gutter.
  - **Objects** — collapsible, keyboard-navigable tree with a detail pane: attributes as a flag row, properties as a decoded table, parent/sibling/child as links. (Phase 5, symbolic mode only: derive a `RoomGraph` — rooms and direction edges — from the `n_to`/`s_to`/… properties. Define that type in `@frotzinc/zcode`; Frotzsmith's `app/composables/map-graph.ts` has the shape to match, but the type must live in the MIT library, never be imported from the GPL app.)
  - **Dictionary** — searchable list with entry bytes decoded; verbs link to their grammar.
  - **Grammar** — verb → action table, each action linking to its routine.
  - **Routines** — list with call counts; detail is disassembly with operands as links, branch targets as gutter arrows, and "called from" / "calls" panels. Strings referenced inline.
  - **Strings** — the full table, searchable, each with its referrers.
  - **Symbols** — drop zone for `gameinfo.dbg`; once loaded every view switches to symbolic names, with a toggle for raw addresses.
- **Intuitive by default:** a single large drop zone on first load with one sentence of explanation and a "try a sample" button that loads `dark-cellar.z5`. Command palette (`Cmd/Ctrl+K`) to jump to any routine, object, or string by name or address. Breadcrumbs. Every view has "copy as text," emitting the `txd`/`infodump` format for that section.
- **Accessible:** WCAG 2.2 AA minimum. Keyboard-operable tree and tables, visible focus, `prefers-reduced-motion` honored, color never the only signal, AA contrast in both themes. I will test with NVDA; build for that.
- **Responsive** to 400px; data views may scroll horizontally in their own container, the page never does.

## Branding

- Favicon and app icon: the amber rounded badge with a loupe over a row of bytes (I'll supply the SVG).
- Footer on every page: the Frotz, Inc. lantern mark + "From Frotz, Inc." linking to [frotzinc.com](https://frotzinc.com), GitHub and npm links, and: "Frotz, Inc. is a fiction. The Frotz interpreter is the work of its own authors and is not affiliated."
- `og:image` 1200×630 (I'll supply), full OpenGraph/Twitter meta, canonical URL `https://frotzlens.com/` (may later become `frotzlens.frotzinc.com`; keep it one config value).

## Phases

Each phase ends with a working, deployable state and a checkpoint for my review. Write the phase doc (Frotzsmith's `docs/` numbering: `00-master-design.md`, `01-phase-1-…`) before writing the code.

**Phase 0 — Extract the shared libraries from Frotzsmith.** Read `../frotzsmith` (already on branch `frotzinc-packages`; never touch its `main`; do not convert it to pnpm — it stays on Yarn 1). In this order:
1. Create `@frotzinc/worker-rpc`, `@frotzinc/nuxt-base`, and `@frotzinc/inform6-wasm` as MIT packages with their tests passing.
2. Validate against Frotzsmith with `yarn link` (or `file:` paths): swap its copies for the packages locally and get its build and tests green. Do not commit yet.
3. Publish the three packages as `0.1.0` with `npm publish --access public`. Each publish prompts me for a 2FA code; run the command and wait.
4. Now make the Frotzsmith change for real, pinned to the published versions, as **one commit on that branch**. Show me the full diff and wait for my approval before pushing or opening the PR.
Deliverable: the three packages are on npm; Frotzsmith builds and tests green on the PR branch importing them.

**Phase 1 — Core parser.** Header, memory map, ZSCII/abbreviations, dictionary, object table, globals. Fixtures compiled from Frotzsmith samples. CLI prints `infodump`-equivalent output. Differential tests against `infodump` (rule 5). Deliverable: `npx frotzlens --objects dark-cellar.z5` matches `infodump`.

**Phase 2 — Disassembler.** Opcode decoding for all forms (short/long/variable/extended), branch and store handling, routine discovery from the initial PC via the call graph followed by a conservative linear sweep of high memory for routines reachable only through computed calls (Inform `.call` property values, grammar action routines), string discovery including a heuristic scan for unreferenced strings, cross-reference index. Differential tests against `txd`. Deliverable: `npx frotzlens --routine <addr> dark-cellar.z5` matches txd.

**Phase 3 — Web app shell.** Nuxt 4 + Nuxt UI on `@frotzinc/nuxt-base`, worker wiring, drop zone, Overview dashboard with the scaled memory map and tiles, hash routing, command palette, footer. Write `netlify.toml` for a pnpm monorepo (base `apps/web`, publish `apps/web/.output/public`) and tell me the exact build settings; **I connect the repo in the Netlify UI** — you can't. Deliverable: drop a file, see the dashboard, on the Netlify preview URL once I've connected it.

**Phase 4 — Data views.** Objects, Dictionary, Grammar, Routines, Strings, Memory/hex. Linking everywhere. "Copy as text." Playwright smoke test. Deliverable: full navigation of `architect-legacy.z5`.

**Phase 5 — Symbols and polish.** `gameinfo.dbg` loader, symbolic mode, Inform fingerprinting (compiler version, veneer routine recognition, Standard Library vs PunyInform detection), Blorb unwrap, accessibility audit, light-mode pass, README and docs, publish `@frotzinc/zcode` and `frotzlens` 0.1.0.

## Before you write any code

1. Run `git -C ../frotzsmith branch --show-current`. If it is not `frotzinc-packages`, stop and tell me. Then confirm the Nuxt 4 / Nuxt UI v4 versions you'll pin, whether Nuxt 5 is stable, and what Frotzsmith is currently on.
2. Propose the monorepo file tree now. Propose the core model's top-level TypeScript types (`StoryFile`, `Header`, `MemoryMap`, `ZObject`, `Routine`, `Instruction`, `Operand`, `ZString`, `DictEntry`, `GrammarEntry`, `RoomGraph`, `Symbols`, `ParseError`) at the start of Phase 1, not before Phase 0.
3. List what you will extract from Frotzsmith in Phase 0, file by file, and what you will leave behind, so I can see the GPL/MIT line is drawn correctly.
4. List the Standard 1.1 sections you'll implement in Phase 1.

Ask me anything that's ambiguous. Don't guess on architecture; do guess on naming and layout details and tell me what you picked.
