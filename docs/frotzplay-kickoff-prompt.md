# frotzplay — Kickoff Prompt

## Before you paste (setup checklist for Chris)

frotzplay is built **inside the `frotzlens` monorepo** (new packages `zmachine` and `player`, new app `apps/play`). Before starting:

1. **frotzlens 0.3.0 (Phase 6, including 6e) is released**, so nothing else is editing `apps/web`. Make sure the `release-0.3.0` work is merged and you're on an up-to-date `main` before branching. Phase 0 moves the header/footer/nav/About out of `apps/web`.
2. **Branch from `main`:** `git checkout main && git pull && git checkout -b frotzplay`.
3. **frotzsmith as a sibling** (`../frotzsmith`): Phase 1 uses `runReplay` (ZVM) as the transcript oracle. Its golden test covers only `demo.z5` (two commands), so Phase 1 writes walkthroughs for the samples. Nothing from it is shipped.
4. **Copy both frotzplay docs into `frotzlens/docs/`** (`frotzplay-design.md`, `frotzplay-kickoff-prompt.md`); the prompt below reads them from there. **Start Claude Code in the `frotzlens` directory.**
5. **`gh` logged in; npm 2FA ready.** Phase 0 publishes the `frotzplay` placeholder; Phase 5 publishes `@frotzinc/zmachine`, `@frotzinc/player`, `frotzplay`.
6. **Netlify:** Phase 4 needs a site on the monorepo with base `apps/play`; you connect it.
7. **NVDA on a Windows machine** for Phases 3 and 5. The Playwright suite checks what a browser can; NVDA checks the rest, with the checklist in `docs/accessibility.md`.
8. **Expect licensing questions:** Praxix and Czech (Phase 2); OpenDyslexic (Phase 3).
9. **frotztrace doesn't exist yet** (only its draft design in `../frotztrace/docs`). Nothing here depends on it. After frotzplay ships, revise that draft so its interpreter phases build on `@frotzinc/zmachine` instead of writing it.

Then paste everything below the line into the session.

---

You are the lead engineer on **frotzplay**, a Z-machine player for the web built for screen-reader users and for pages that can't allow `eval`, the third frotz, Inc. product after frotzsmith (IDE) and frotzlens (inspector). I'm Chris Schweda (GitHub `cschweda`); I lead digital accessibility compliance professionally and test with NVDA. You write the code, I review and direct. Work in phases, stop at each checkpoint, and ask before any architectural decision not settled here. The full design is `docs/frotzplay-design.md`; this is its imperative form.

## What frotzplay is

A player for version 3, 4, 5 and 8 story files, bare or in a Blorb, in the browser, nothing uploaded. Three deliverables: a hosted page (frotzplay.frotzinc.com: drop a file, or `?story=<url>` as Parchment does), an embeddable web component (`<frotz-play>`) that runs under `script-src 'self'; style-src 'self'` (no `'unsafe-eval'`, no `'unsafe-inline'`; the hosted Nuxt page itself still needs `'unsafe-inline'` like frotzlens, and that's fine), and an **Export** that turns a story into a playable bundle — one self-contained HTML file that plays from a double-click, or a folder ready for Netlify or itch.io. Every session has a seed (random by default, shown and copyable; fixed with `?seed=`). Quetzal saves as real files; autosave; undo; transcripts. A published, tested **accessibility contract** (WCAG 2.2 AA, which satisfies 2.1 AA). The frotz family look, dark by default.

**It is not Parchment and does not replace it.** Z-code only, by rule. Parchment is credited everywhere (§Hat tips below). What frotzplay does that Parchment doesn't, which is the whole pitch and must be visible on the front page: (1) a published, tested screen-reader contract; (2) no `eval` and no WebAssembly, so it embeds under a strict CSP (Parchment now runs Z-code on Bocfel in WebAssembly, so it needs `'wasm-unsafe-eval'`; its old ZVM needed `'unsafe-eval'`); (3) one-click export to a playable single HTML file or folder, carrying the contract (Parchment's Site Generator also makes single-file pages: say so); (4) deterministic play with a seed; (5) Quetzal saves as real files, autosave, undo, transcripts; (6) typography and theme controls; (7) the frotz family look and links to frotzlens.

**Not in v1:** any format but Z-code, version 6, sound, the debugger (frotztrace), replacing Parchment in frotzlens/frotzsmith, cloud saves.

## Implementation stance (settled)

The interpreter is written in **TypeScript from the *Z-Machine Standards Document 1.1*** (plus Quetzal 1.4 and Blorb 2.0 for file formats); the screen is the Standard's §8 model, not Glk. **Not WebAssembly:** compiling a C interpreter (Bocfel, MIT; Frotz is GPL and excluded) would need Emscripten bindings for its whole I/O layer, would make state hard to serialize, and has no instruction hooks, so frotztrace couldn't share it; and performance isn't a reason, a turn is a few thousand instructions. You may read other interpreters (Parchment, ZVM, Bocfel) to understand a behaviour; cite what you learned in a comment, attribute anything you copy per its license, and **copy nothing from GPL sources into `@frotzinc/zmachine` or `@frotzinc/player`**, which are MIT. ZVM is the transcript oracle through frotzsmith's `runReplay`, test-only, shipped in nothing; Bocfel compiled to WASM may be added as a second test-only oracle in Phase 2 if it's cheap.

**The oracle's limits (settled; design §9).** Headless ZVM does no file I/O (`HeadlessDialog` cancels every save/restore), takes no seed, and runs no timers. So: seeded random uses **ZVM's own xorshift** (`ifvms/src/zvm/runtime.js` `random()`: MIT, attribute it), and the test harness sets ZVM's `xorshift_seed` to the test seed before boot. That is a deliberate departure from the Standard 1.1 §2.4 *recommended* predictable mode, which ZVM also skips; document it in the README's conformance notes. Quetzal is checked through an in-memory `Dialog` added to the vendored harness, or, if that's not cheap, Bocfel-in-WASM or committed `.qzl` files from a desktop interpreter. Timed input isn't oracle-checked. The header's interpreter number/version and screen size are parameters, pinned for tests to what `headless-glkote` reports.

## What already exists (read it before you plan)

- **`packages/zcode`** (`@frotzinc/zcode`): `decode.ts` turns bytes at an address into a typed `Instruction` (form, count, opcode, operands with kind/value, store, branch with onTrue/returns/target, inline text, jumpTarget, info). `opcodes.ts`, `address.ts` (packed addresses by version), `text.ts` (ZSCII), `objects.ts`, `dictionary.ts`, `globals.ts`, `header.ts`, `blorb.ts` (`readBlorb`, `blorbStory`, iFiction metadata). **The interpreter decodes with `decode.ts`.** One decoder in the family.
- **`apps/web`** (frotzlens): the shell (`AppHeader`, `AppFooter`, `AboutMenu`, `AboutDialogs`, `useAbout`, `utils/report.ts`, `utils/markdown.ts`, and `site.config`, which they import; `AppNav` is frotzlens's views and stays), `DropZone`, the worker wiring with `@frotzinc/worker-rpc`, the Playwright + axe suite, `netlify.toml` with CSP, PWA config. `PlayView.vue` and `docs/07-play.md` show how a story is handed to an iframe by `postMessage` with a ready handshake; reuse the handshake for the opener → frotzplay path.
- **`packages/nuxt-base`**: the family look as a Nuxt layer; tokens in `css/palette.css` (ground `#0e1116`, ink `#e6dfcf`, panel, rule, the family amber `#f0a830` as `lamp`, `#8a5208` as light `lamp-text`, 5.65:1), fonts self-hosted via `@nuxt/fonts`. No high-contrast tokens yet: Phase 3 adds them here. Nothing visual goes anywhere else.
- **`packages/inform6-wasm`**, `scripts/build-samples.mjs`, `samples/`: the fixture stories (v3, v5, v8; **no v4 yet**), reproducible builds, **no walkthroughs yet**.
- **`../frotzsmith/app/modules/inform6/engine/`**: `replayCore.ts` (`runReplay(story, 'zmachine', commands)` → per-turn transcript, Node-safe), `ZmachineEngine.ts` (ZVM via `ifvms`, `headless-glkote.ts`, `headless-dialog.ts`), `normalizeTurnOutput.ts`, `parseScript.ts`, and `replay.golden.test.ts` (only `demo.z5`, two commands).
- `docs/00-master-design.md` decisions stand (`file:` tarballs; golden files; self-hosted fonts; one amber).

## Licensing (settled)

Apps GPL-3.0-or-later, libraries MIT; dependencies apps → libraries; no library bundles GPL. **`@frotzinc/zmachine` MIT, `@frotzinc/player` MIT** (an embeddable player under GPL would stop most sites using it), **`apps/play` GPL, `frotzplay` placeholder GPL.** Shell components moved from `apps/web` to `nuxt-base` are relicensed MIT (Chris's own code), as in frotzlens Phase 0. Update `LICENSING.md`.

## Stack (settled — do not revisit)

The monorepo's: Nuxt 4.6.x, Nuxt UI 4.12, TypeScript strict, pnpm, Vitest, Playwright, the same lint and CI.

- `packages/zmachine` — `@frotzinc/zmachine`: interpreter. Pure TypeScript. **Zero DOM, zero Vue, zero `eval`/`new Function`.** Runs in a worker, on the main thread, in Node.
- `packages/player` — `@frotzinc/player`: Vue components (`ZScreen`, `ZAnnouncer`, `ZCommandLine`, `ZStatusAnnouncer`, `ZSettings`, `ZSaves`, `ZTranscript`, `ZPlayer` composing them), the `<frotz-play>` custom element built from `ZPlayer` with `defineCustomElement`, and **`bundle()`/`bundleFolder()`** export functions. **The components are plain Vue with the player's own CSS: no Nuxt UI, no Tailwind** (Tailwind v4's `@property` doesn't register in a shadow root; Reka UI teleports dialogs to `<body>`; Nuxt UI's inline `style` attributes fail `style-src 'self'`). Tokens are imported from `nuxt-base`'s `palette.css`; dialogs are native `<dialog>`; no inline `style` attributes (dynamic values via `style.setProperty` on custom properties); the custom element applies its CSS with `adoptedStyleSheets` (fallback: a same-origin `frotzplay.css` linked inside the shadow root, if the embed test shows a browser blocking it). Vue is a peer dependency for the components; the custom element bundle is self-contained.
- `apps/play` — the hosted page. Extends `@frotzinc/nuxt-base`; Nuxt UI for the shell around `ZPlayer`. Static, Netlify, PWA.
- The machine runs **on the main thread by default** with a cooperative yield every N instructions (`<frotz-play>`, the exported bundle). That's what keeps the embed to one script tag: a `blob:` worker would need `worker-src blob:`. **In a worker via `@frotzinc/worker-rpc`, opt-in**, when the host gives a same-origin worker URL (`<frotz-play worker-src="…">`; `frotzplay.worker.js` ships beside `frotzplay.js`). `apps/play` uses the worker. Same code path, one flag.

## Architecture rules

1. **The look is the family's.** Same header, footer, About menu, tokens, fonts and keyboard palette as frotzsmith and frotzlens; no seam between the apps. Anything visual lives in `nuxt-base` or `player`, never in `apps/play` alone. Dark by default.
2. **`zmachine` decodes with `zcode`.** The interpreter is "apply this `Instruction` to this state."
3. **All machine state is serializable:** dynamic memory, frames (`returnPC`, `locals`, `evalStack`, `storeVariable`, `argCount`), PC, random `{ seed, n }`, screen model, input state, counters, undo ring. One mechanism for Quetzal, undo, autosave, and (later) frotztrace's rewind.
4. **Always seeded.** Every session has a seed: chosen at random at start by default, shown and copyable, fixed by `?seed=` or settings; tests always pass one. Same story + commands + timer events + seed → identical transcript. Timer firings are recorded in the command script (which input, after how many ticks) and replayed. Turning determinism off entirely (true `Math.random`) is a setting.
5. **Hooks exist from day one** on every memory write, call, return, branch, print and input, even though only autosave and the changed-set use them now. A later debugger (frotztrace, not yet started) attaches to them without changes.
6. **Byte-accurate against the Standard**, cited in comments where it bites: `@je` with one operand; `@inc_chk`/`@dec_chk` signedness; `@art_shift` vs `@log_shift`; indirect variables via `@load`/`@store`/`@pull` (variable 0 = stack in place); `@aread` text-buffer layout by version and the v5 zero-length case; `@read_char` and timed input with the interrupt routine; `@print_table`; `@tokenise` with a custom dictionary and the flag; `@encode_text`; `@check_arg_count`; `@catch`/`@throw`; `@output_stream` 3 nesting; header Flags 1/2 negotiation and what `@restart` preserves; the v3 status line and `@show_status` (keep the structured room/score/moves for the announcer); `@split_window`/`@set_window`/`@set_cursor`/`@erase_window` semantics; `@set_colour` and `@set_text_style` as data.
7. **The screen model is the Standard's §8**, not Glk: a lower window of styled runs with scrollback, an upper window grid with a cursor, `buffer_mode`, output streams 1–4. The player draws it; the Node runner flattens it to text exactly as `normalizeTurnOutput` expects.
8. **Differential testing against ZVM.** Every fixture walkthrough's normalized transcript equals seeded `runReplay`'s, with the header pinned. No deliberate differences except those listed in the README's conformance notes (the RNG mode above is the first).
9. **Graceful on bad input.** Corrupt story, illegal instruction, bad save file → a `fault` with a message the UI shows in words; nothing throws past the package.
10. **Z-code only. No Infocom branding.**

## The accessibility contract (settled; implement all of it, test what a browser can)

Target **WCAG 2.2 AA**. The full contract is `docs/frotzplay-design.md` §6; write it out as `docs/accessibility.md` in Phase 3 with each statement's test named. The load-bearing items:

- Lower window = the **transcript**: a labelled, browsable region (not live), each turn a block (echo, then output). Announcements go through a separate visually hidden **announcer** (`role="log"`, `aria-live="polite"`, `aria-relevant="additions"`): **one appended block per turn**, shaped by verbosity. (Playwright: one announcer addition per turn.)
- **Verbosity** (announcer only; the transcript always shows everything): *full* = echo + output + blank lines + prompt; *standard* (default) = output only; *terse* = standard, with status line and upper window announced on demand only.
- Status line: a separate polite region announcing **only on change**, never as a grid. **v3:** a sentence from the structured fields ("West of House. Score 0, moves 3."). **v4+:** the upper window's first row as-is, trimmed, space runs collapsed (its fields can't be parsed reliably).
- Upper window beyond the status line: a grid with a text alternative and a "Read upper window" command and shortcut.
- Styles: bold `<b>`, italic `<i>`, reverse and fixed-pitch as styled `<span>`s (a `<pre>`-like block for layouts); colour never the only signal.
- Timed input announced, pausable and turn-off-able (2.2.1); paused means the timer routine isn't called, and the announcement says so.
- The command line is a labelled input that keeps focus; the page never steals it; history on arrows; `read_char` taken from the same control with an announcement.
- Everything keyboard-operable; visible focus (2.4.7), never hidden by sticky UI (2.4.11), 2.4.13 (AAA) as a stretch; no trap (2.1.2); a shortcuts dialog where each binding can be changed or turned off (2.1.4); target sizes (2.5.8).
- Contrast ≥ 4.5:1 in dark and light, and ≥ 7:1 in a high-contrast theme (new tokens in `nuxt-base`'s `palette.css`, ratios in its header comment); 200% zoom (1.4.4); reflow at 320 px (1.4.10); spacing controls (1.4.12); reduced motion and `prefers-contrast` honoured; nothing flashes.
- Landmarks, skip link, page title = story title; `role="status"` for save/restore/export messages (4.1.3); errors in words with what to do (3.3.1/3.3.3).

## Export (settled)

`bundle(story, { cover?, title?, author?, seed? }) → { filename, html }` and `bundleFolder(…) → File[]` in `@frotzinc/player`:

- **Single file:** the built `<frotz-play>` script and CSS inlined as strings (the app ships its own built copy as an asset), the story as base64, the cover as a data URI, a `<meta http-equiv="Content-Security-Policy">` allowing only itself (the inline script and style by `sha256-` hash, images by `data:`), no fetches, no workers (main-thread path), named from the story's title (`dark-cellar.html`). Plays from `file://` by double-click.
- **Folder:** `index.html`, `story.<ext>`, `frotzplay.js`, `frotzplay.css`, `README.txt` ("open index.html; to put it online, upload this folder to Netlify, itch.io or any static host"). Plays from `file://` and from a static host.
- Both carry the contract and the family look. A Playwright test opens the exported single file via `file://`, plays a turn, and asserts no console errors and no CSP violations; and a second serves the folder statically and does the same.
- Autosave from `file://`: try IndexedDB; if unavailable, keep undo in memory and show "Download save" instead, with a `role="status"` note.

## Hat tips to Parchment (settled)

- Front page, under the drop zone: "For Glulx, TADS, Hugo and everything that isn't Z-code, use Parchment," linked.
- About dialog: Parchment, ZVM and GlkOte credited as prior art and (ZVM) the test oracle, with links.
- **URL compatibility:** honour `?story=<url>` as Parchment does, so a "play online" link works on either host when the story's server sends CORS headers. Before claiming any other Parchment URL form (fragments, options), check Parchment's current source and report. No CORS proxy in v1 (it would see what people play): a non-CORS URL fails with a worded error offering "download it and drop it here."
- Menu item **"Open in Parchment"** handing the same story URL across; hidden when the story was dropped or posted (no URL to hand over).
- README opens with a "Standing on" section: Parchment, ZVM, GlkOte, the Standard and its authors, Quetzal, Blorb.

## Tests

- Opcode unit tests with a tiny test assembler in `zmachine/test/`, covering every opcode per version and every item in rule 6.
- **Walkthroughs:** write a command script for every sample in `samples/walkthroughs/<name>.txt` (`parseScript` format), reaching the end or covering every room and verb; add a v4 build of at least two samples to `scripts/build-samples.mjs`.
- Walkthrough transcripts vs **seeded** `runReplay` for every fixture, via a test-only dev dependency on the sibling checkout or a small test-only vendored copy of `replayCore` + `ZmachineEngine` + `headless-*` (GPL, never in a package; say which, and note it in `LICENSING.md`). The harness sets ZVM's `xorshift_seed` before boot and pins the header. Optionally Bocfel in WASM as a second oracle, test-only.
- Praxix (Andrew Plotkin) and Czech (Amir Karger): **establish licences first and report**; if usable, golden output with provenance; if not, local pass/fail only.
- Determinism: same story + script + timer events + seed twice → identical transcript.
- Quetzal: frotzplay's own round-trip always (save at turn k, restore, continue = the uninterrupted transcript). Cross-interpreter: give the vendored harness an in-memory `Dialog` so ZVM can save/restore, then save here → restore in ZVM and the reverse. If that isn't cheap, Bocfel-in-WASM or committed `.qzl` files with provenance; report which.
- Contract: Playwright on the sample with a scripted session asserting each browser-checkable statement (announcer per verbosity, v3 and v5 status behaviour); axe on every view and state; 320 px reflow; 200% zoom.
- Embed: a plain HTML page with `default-src 'self'; script-src 'self'; style-src 'self'` and `<frotz-play>`, main-thread and with `worker-src`; play a turn, open settings; no violations and styles applied; Chromium, Firefox, WebKit.
- URLs: `?story=` same-origin, CORS, and non-CORS (worded error).
- Export: as above.

## Phases

Write the phase doc in `docs/` (frotzlens's numbering continues) before each phase's code.

**Phase 0 — Shell into `nuxt-base`.** Move `AppHeader`, `AppFooter`, `AboutMenu`, `AboutDialogs`, `useAbout` and the utils they use (`report.ts`, `markdown.ts`) from `apps/web` into `nuxt-base`, with `site.config` and the hard-coded "frotzlens"/repo URL replaced by a typed `product` key in each app's `app.config.ts`, the changelog passed in by the app, and `AppHeader` slots for each app's own buttons. `AppNav` stays in frotzlens (it's frotzlens's views). frotzlens uses them; its Playwright + axe suite passes unchanged. Publish the `frotzplay` npm placeholder (GPL, `@frotzinc` scope in the README, no `infocom` keyword). One commit for the move; show me the diff before pushing. Deliverable: frotzlens green; placeholder on npm.

**Phase 1 — The interpreter.** `@frotzinc/zmachine`: state, loop, every opcode for v3/4/5/8, the §8 screen model, input suspension (line, char, timed), ZVM-compatible seeded random, hooks, pinned header parameters, the main-thread/worker switch. Opcode tests. The walkthroughs and v4 sample builds. The seeded oracle harness. A Node runner: `node run.mjs story.z5 script.txt [--seed N]` prints the normalized transcript. Deliverable: every fixture walkthrough's transcript equals seeded `runReplay`'s.

**Phase 2 — State.** Quetzal 1.4 in/out, `save_undo`/`restore_undo`, snapshots, determinism tests (with recorded timer events), the oracle's in-memory `Dialog` or its fallback, conformance stories after the licence check. Deliverable: Quetzal checked as in Tests; same seed + timer events → same transcript.

**Phase 3 — The player.** `@frotzinc/player`: `ZScreen` (transcript, upper grid), `ZAnnouncer` and verbosity, status announcements, `ZCommandLine`, settings (themes incl. the new high-contrast tokens in `nuxt-base`, fonts incl. a dyslexia-friendly option after the licence check, size, line length, spacing, verbosity, motion, timed-input pause), saves (Quetzal file, autosave component, undo), transcript export, the shortcuts dialog. `docs/accessibility.md` written and its Playwright suite green. Deliverable: the sample plays in a dev page meeting the contract; I run the NVDA checklist.

**Phase 4 — The site.** `apps/play`: the family shell from `nuxt-base`, drop zone, **sample stories on the start page** (The Dark Cellar featured, The Locked Chest, The Hermit, Magic 8-Ball; copied from `samples/` at build time; `?sample` and `?sample=<name>`; a Playwright test opens each and plays a turn), `?story=` (same-origin and CORS; non-CORS fails in words), `postMessage` source with the handshake, Blorb cover/title/author, autosave wired to IndexedDB, PWA, About with the Parchment credits, "Open in Parchment," `netlify.toml` (base `apps/play`; I connect the site). Deliverable: playable on the Netlify preview from a dropped file and a `?story=` URL.

**Phase 5 — Embed, export, ship.** The `<frotz-play>` custom element and its strict-CSP test; **Export** (single file + folder) and its `file://` and static tests; README with "Standing on"; light and high-contrast passes; publish `@frotzinc/zmachine`, `@frotzinc/player` and `frotzplay` 0.1.0. Deliverable: frotzplay 0.1.0 live; `<frotz-play>` on npm; an exported `dark-cellar.html` plays from a double-click in Chrome, Firefox, Safari and Edge.

## Before you write any code

1. `git branch --show-current` must be `frotzplay`, branched from an up-to-date `main`; stop if not. Confirm pinned Nuxt/Nuxt UI match `apps/web` (today: `nuxt` 4.6.4, `@nuxt/ui` 4.12.0).
2. Read `docs/frotzplay-design.md`, `docs/00-master-design.md`, `docs/07-play.md`, `packages/zcode/src/{decode,types,blorb}.ts`, `packages/nuxt-base/css/palette.css`, `apps/web/app/components/{AppHeader,AppFooter,AboutMenu,AboutDialogs,PlayView,DropZone}.vue`, `apps/web/app/utils/{report,markdown}.ts`, `apps/web/site.config.ts`, `../frotzsmith/app/modules/inform6/engine/`, and `random()` in `../frotzsmith/node_modules/ifvms/src/zvm/runtime.js`. Ten lines on what you'll reuse from each.
3. List, file by file, what Phase 0 moves into `nuxt-base` and how the product parameterization is typed. I approve before anything moves.
4. At the start of Phase 1: propose `zmachine`'s top-level types (`Machine`, `MachineState`, `Frame`, `ScreenModel`, `Window`, `StopReason`, `Snapshot`, `Hooks`) and list the Standard 1.1 sections implemented with the opcode count per version.
5. At the start of Phase 3: propose the `player` component tree and the `docs/accessibility.md` outline, statement by statement, with each statement's test.

Ask me anything ambiguous. Don't guess on architecture; do guess on naming and layout and tell me what you picked.
