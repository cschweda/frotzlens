# frotzplay — Design Document

**Status:** Draft 2, 7 November 2026 (review fixes: oracle limits, RNG, CSP scope, contract corrections)
**Author:** Christopher Schweda
**Companion:** `frotzplay-kickoff-prompt.md`
**Lives in:** the `cschweda/frotzlens` monorepo, as `packages/zmachine`, `packages/player`, `apps/play` · **Site:** frotzplay.frotzinc.com · **Family:** Frotz, Inc.

---

## 1. What it is, in one paragraph

frotzplay is a Z-machine player for the web, built for two things no existing player is built for: **people who use screen readers**, and **pages that can't allow `eval`**. It plays version 3, 4, 5 and 8 story files, bare or in a Blorb, in the browser, with nothing uploaded. It ships as a hosted page (drop a file, or open a story by URL) and as an embeddable web component (`<frotz-play>`) that any site can include under a strict Content Security Policy. It is an independent implementation: the interpreter is written in TypeScript from the Z-Machine Standard, and the screen is drawn from the Standard's own screen model rather than through Glk. It is Z-machine only, on purpose.

## 2. Why build it, and why not just use Parchment

Parchment is the web player for interactive fiction. Dannii Willis has maintained it since 2008; it is what IFDB, the IF Archive and most jams use; it plays Z-machine, Glulx, TADS, Hugo, ADRIFT and more by running the reference interpreters through Emscripten and GlkOte. Frotzsmith and Frotzlens embed it. frotzplay does not try to replace it and says so on its front page.

frotzplay exists for two gaps that are structural in Parchment, not bugs:

**Accessibility.** Parchment's Z-machine engine (ZVM) renders through GlkOte, a general display layer that was not designed around screen readers: status-line changes are not announced, output arrives as DOM mutations a reader may or may not pick up, verbosity is not a setting, and the upper window is a visual grid without a text alternative. Blind and low-vision players are a visible part of the IF community and play with workarounds. A player where every one of these is designed, tested with NVDA and documented as a contract would be the first.

**Embedding under a strict CSP.** ZVM is a JIT: it compiles Z-code routines to JavaScript at runtime, so every page embedding it needs `'unsafe-eval'`. Frotzlens had to put its Play view in an opaque-origin sandbox for exactly this reason. `@frotzinc/zmachine` interprets decoded instructions one at a time and never calls `eval`, so the `<frotz-play>` element and the exported bundle run under `script-src 'self'; style-src 'self'` with no `'unsafe-eval'` and no `'unsafe-inline'`: inside frotzlens's own origin without a sandbox, in frotzpack's generated game pages, on sites with security policies, and in a browser extension. (The hosted Nuxt page, `apps/play`, still needs the same `'unsafe-inline'` for Nuxt's inline payload that Frotzlens's `netlify.toml` has; the strict-CSP promise is about the player, not about a Nuxt app hosting it.)

Everything else frotzplay does better is a consequence of owning the whole stack: deterministic play with a seed, Quetzal saves as real files, autosave, transcript export, typography controls, and the Frotz family look.

## 3. Hat tips to Parchment

Because this is a sibling, not a rival, the credit is designed in:

- **The front page** says, under the drop zone: "For Glulx, TADS, Hugo and everything that isn't Z-code, use Parchment," with the link.
- **The About dialog** credits Parchment and ZVM by name as the prior art and the test oracle, with links.
- **URL compatibility.** Parchment opens a story with `?story=<url>`. frotzplay honours the same parameter, so an IFDB-style "play online" link works with either player by changing the host, provided the story's server sends CORS headers. Parchment reaches non-CORS servers through a proxy; frotzplay runs no server in v1, so a non-CORS URL fails with an error that says why and offers "download the story and drop it here" (open question 7). Any other Parchment URL forms (fragments, extra options) are checked against Parchment's current source before they're claimed. This is the most useful hat tip: no one has to learn a second URL scheme.
- **An "Open in Parchment" item** in the menu, which hands the same story URL to Parchment, for anyone who wants the familiar player. Shown only when the story came from a URL; a dropped or posted file has no URL to hand over, so the item is hidden.
- **The README** has a "Standing on" section before anything else: Parchment, ZVM, GlkOte, the Z-Machine Standard and its authors, Quetzal and Blorb and theirs.
- **frotzinc.com's product card** says what the two gaps are and that Parchment is the general-purpose player.

## 4. Scope

### In scope for v1

- `@frotzinc/zmachine` (MIT): the interpreter, specified in §8.1 below: every v3/4/5/8 opcode, the §8 screen model, suspendable input (line, char, timed), seeded random (ZVM-compatible, §8), Quetzal 1.4 save/restore, undo. Zero DOM, zero `eval`. Serializable state.
- `@frotzinc/player` (MIT): the player UI as a Vue component set and as a framework-free **web component** (`<frotz-play src="…">` or with bytes passed in), built on the family tokens. The accessibility contract (§6) is implemented here, so every embedder gets it.
- `apps/play` (GPL): the hosted page at frotzplay.frotzinc.com. Drop a file, open `?story=`, play. Saves, transcripts, settings, About.
- Story sources: a dropped file, a file picker, a URL (same-origin or CORS-enabled, like Parchment), a `postMessage` from an opener (how Frotzlens's Play view will hand over a file).
- **Sample stories on the start page**, so a first-time visitor can play at once without having a story file: a "Try a sample" row beside the drop zone with a few of Chris's Frotzsmith samples, served from the site (no fetch from elsewhere), each one click to play. Proposed: *The Dark Cellar* (darkness and light; the featured one, as in Frotzlens), *The Locked Chest* (a small puzzle), *The Hermit* (a character to talk to) and *Magic 8-Ball* (random answers, which shows off the seed). `?sample` opens the featured one straight away and `?sample=<name>` a named one, so a link can show it, as Frotzlens's `?sample` does. They are the same files as `samples/`, copied in at build time.
- Blorb: the story inside, the cover shown, the iFiction title and author in the page title.
- Saves: Quetzal to a downloaded `.qzl` file and restore from one; **autosave** to IndexedDB per story (keyed by release/serial/checksum) with "continue where you left off"; `save_undo`/`restore_undo`.
- Transcript: export the session as text; optionally a Frotzsmith-style command script.
- Settings: theme (dark default, light, high-contrast; the high-contrast tokens are new and go in `nuxt-base`'s `css/palette.css` beside the others), font (the family stack, a dyslexia-friendly option, a monospace option), size, line length, reader verbosity (§6), motion.
- Offline: a PWA, as Frotzsmith is.
- **Export a playable bundle.** One click produces a game you can hand to anyone: a **single self-contained HTML file** (the player and the story inside it, no network, works from a double-click on the desktop or from any static host), or a **folder** (`index.html`, `story.z5`, `frotzplay.js`, `frotzplay.css`, `README.txt`) for people who want the story file separate. Both carry the cover, title and author, the accessibility contract, and the family look. This is the thing that is hard to do with Parchment and should be effortless here.
- Testing: the interpreter's transcripts equal Frotzsmith's `runReplay` (ZVM) on every fixture walkthrough (walkthroughs written in Phase 1; see §9 for the oracle's limits); conformance stories if licensed; the accessibility contract checked by Playwright + axe and by NVDA.

### Out of scope for v1 (designed for, not built)

- **Any format but Z-code.** Glulx, TADS, Hugo: use Parchment. This is a rule, not a backlog item; the moment frotzplay plays Glulx it is competing on Parchment's terms.
- **Version 6**, sound, graphics (beyond the Blorb cover).
- **The debugger.** That's frotztrace, a later product (not started; its draft design is in `../frotztrace/docs`). It will add a `Debugger` to `zmachine` and its views on top of this player's Screen. frotzplay owes it only the hooks and serializable state in §8.1; nothing here waits on it.
- **Replacing Parchment in Frotzlens and Frotzsmith.** Designed for: once frotzplay has shipped, Frotzlens's Play view can embed `<frotz-play>` and drop its sandbox. A later decision.
- **A cloud save sync.** Autosave is local.

## 5. Product principles

1. **Accessible by contract, not by accident.** §6 is a public document; the Playwright suite enforces it; NVDA verifies it before each release. If a change breaks the contract, it doesn't ship.
2. **No `eval`, ever.** The whole reason it can go where Parchment can't.
3. **Independent, and honest about it.** The Standard is the specification. Other interpreters may be read for understanding; anything copied is attributed per its license, and nothing GPL enters an MIT package. ZVM is the test oracle through Frotzsmith's `runReplay`; it is not shipped.
4. **Z-code only.** See §4.
5. **The family look.** Dark by default, the `@frotzinc/nuxt-base` tokens, the Frotzlens shell. All Frotz, Inc. apps share one look and feel.
6. **Nothing leaves the machine.** No upload, no analytics on play, saves local.
7. **Generous about Parchment.** §3.

## 6. The accessibility contract

This is the product. Written as testable statements, each with how it is checked.

**Output**
- The lower window is the **transcript**: a labelled region (`<section aria-label="Story">`) holding every turn as its own block (command echo, then output), browsable line by line in a reader's browse mode. It is not itself a live region, so what is *announced* can differ from what is *shown*.
- Announcements go through one **announcer**: a visually hidden `role="log"` (`aria-live="polite"`, `aria-relevant="additions"`) that receives exactly one appended block per turn, shaped by the verbosity setting below, so a reader speaks one coherent chunk, not a word at a time. *(Playwright: one announcer addition per turn.)*
- The status line is announced only when its text changes, through a separate polite region, never read as a grid. In **v3**, where the interpreter owns the status line and knows the room and the score/moves (or time), it is a sentence ("West of House. Score 0, moves 3."). In **v4+**, the upper window is the game's own grid and its fields can't be parsed reliably, so the first row's text is announced as-is, trimmed and with runs of spaces collapsed. *(Playwright: no announcement when unchanged; v3 and v5 fixtures.)*
- The upper window, when the game uses it for more than a status line (menus, maps, quote boxes), is a grid with a text alternative: its rows are read as lines, and a "Read upper window" command (and shortcut) speaks it on demand. *(NVDA.)*
- Text styles are marked up without claiming meaning the game didn't give: bold as `<b>`, italic as `<i>`, reverse video as a styled `<span>`, fixed-pitch as a styled `<span>` (and a `<pre>`-like block when it is a layout, below). Colour is never the only carrier of meaning.
- A **verbosity** setting, applied to the announcer only (the transcript always shows everything):
  - *full*: the command echo, the output, blank lines and the prompt;
  - *standard*: the output only: no command echo (you just typed it), no prompt, no blank lines;
  - *terse*: as standard, and the status line and upper window are announced only on demand (shortcut), not on change.

  Default *standard*.
- Timed input (`@aread`/`@read_char` with a timer) is announced ("The game is waiting; it will continue in 10 seconds") and can be paused or turned off from settings, meeting 2.2.1 Timing Adjustable. Pausing stops the clock (the timer routine is not called while paused), and the announcement says so. Timer firings are recorded as events in the session's command script (which input, after how many ticks), so a seeded replay feeds them back at the same points and stays deterministic (§7).

**Input**
- The command line is a labelled `<input>` that keeps focus after each turn; the page never steals it. Command history on arrow keys. Character input (`read_char`) is announced ("Press any key") and taken from the same control.
- Everything is operable from the keyboard; every control has a visible focus state (2.4.7) that is never hidden by sticky UI (2.4.11), aiming at the AAA focus-appearance size and contrast (2.4.13) as a stretch, not a requirement; no keyboard trap (2.1.2); a shortcuts dialog lists every binding and lets each be changed or turned off (2.1.4).
- Target sizes meet 2.5.8; no gesture-only interaction.

**Presentation**
- **Dark by default, with high-contrast text** (unlike Parchment's light page): in the default dark theme every piece of the player's text meets **7:1** (AAA), not just 4.5:1. The family palette already gives story text (`ink`, #e6dfcf on #0e1116) 14.25:1 and the amber prompt (`lamp-text`) 9.32:1; the muted grey (`ink-2`, 6.39:1) is not used for any text in the player, which uses `ink` or a lighter muted tone measured at ≥ 7:1. A light/dark toggle in the header (the family's color-mode button) switches at any time and is remembered. The first visit is always dark, whatever the system setting (the family default). *(Playwright + axe: AAA contrast rule on the player in dark.)*
- Contrast ≥ 4.5:1 in all three themes (the family amber uses the `lamp-text` variant on light, 5.65:1 on ground); a high-contrast theme at ≥ 7:1, which needs new tokens (light `lamp-text` doesn't reach 7:1), added to `nuxt-base`'s `css/palette.css` with their measured ratios in its header comment.
- Text resizes to 200% without loss (1.4.4) and reflows to 320 px without horizontal scrolling (1.4.10); line length and spacing controls honour 1.4.12.
- `prefers-reduced-motion` and `prefers-contrast` are honoured; nothing flashes.
- The game's own fixed-width layouts (maps, tables) stay in a `<pre>`-like block with horizontal scrolling inside it, never the page.

**Structure**
- One `<main>`, landmarks for the screen, the input and the settings; a skip link; a page title that is the story's title.
- Status messages (saved, restored, autosaved, transcript exported) use `role="status"` (4.1.3).
- Errors (a story that won't load, a bad save file) are described in text with what to do (3.3.1, 3.3.3).

**Target:** WCAG 2.2 AA throughout, which satisfies 2.1 AA (the ADA Title II standard). Checked by axe in Playwright on every view and state, and by NVDA on Windows before each release. The contract is published as `docs/accessibility.md` and linked from the About dialog, with a reporting path.

## 7. What it adds beyond Parchment

Besides the two gaps and the contract:

- **Deterministic play, on request.** Every session has a seed. By default it is chosen at random when the story starts (so players don't all get the same "random" game), shown in the About/session panel and copyable. A seed in the URL (`?seed=`) or settings fixes it; the same story, commands, timer events and seed play the same way, which matters for walkthroughs, teaching, and bug reports. Tests always pass a seed.
- **Real saves.** Quetzal to a file you own, restorable in any interpreter; autosave with "continue"; undo.
- **Transcripts** as text, and as command scripts Frotzsmith and frotzcheck can replay.
- **Typography.** The family type, a dyslexia-friendly face, line length and spacing controls, three themes.
- **A playable bundle, exported.** Drop a story, click Export, get `my-game.html` that plays anywhere, or a folder ready to upload to itch.io, Netlify or a thumb drive. No build step, no server, no CSP to configure (the file carries its own strict one), no instructions. Parchment can be made to do this; frotzplay does it for you.
- **An embed that behaves.** `<frotz-play>` is one script tag (and, optionally, one same-origin worker file; §8), needs no `'unsafe-eval'` or `'unsafe-inline'`, carries the contract, and exposes events (`turn`, `input-wanted`, `quit`, `save`) so a host page can build on it.
- **Blorb done properly.** Cover, title and author from the iFiction record; the page title is the story's.
- **The family.** One click to inspect the same story in Frotzlens (and, once frotztrace exists, to debug it there).

## 8. Architecture

```
frotzlens/
├── packages/
│   ├── zcode/        @frotzinc/zcode      MIT  (exists) decoder, model, Blorb, symbols
│   ├── zmachine/     @frotzinc/zmachine   MIT  NEW  interpreter: state, loop, opcodes, screen model, input, Quetzal, undo
│   ├── player/       @frotzinc/player     MIT  NEW  Vue components + the <frotz-play> web component; the contract lives here
│   ├── nuxt-base/    @frotzinc/nuxt-base  MIT  (exists; gains the shell from apps/web, and high-contrast tokens)
│   └── …
└── apps/
    ├── web/          Frotzlens            GPL  (exists)
    └── play/         frotzplay            GPL  NEW  hosted page: drop zone, ?story=, saves, settings
```

- **Why TypeScript and not WebAssembly.** The alternative was to compile an existing C interpreter with Emscripten, as Parchment does for Glulx and as the family already does for Inform 6. Frotz is GPL and so can't be in an MIT library; Bocfel (MIT, strictly conformant) could. But its screen and input layer would need Emscripten bindings that are most of the work anyway, its state isn't serializable from JavaScript (so snapshots, autosave and deterministic replay get awkward), and it has no instruction-level hooks, so frotztrace couldn't be built on it: the family would end up with one interpreter for playing and another for debugging. Performance is not a reason: a Z-machine turn is a few thousand instructions, well under a millisecond in TypeScript (ZVM JITs because ifvms also targets Glulx, where games are far heavier). WASM's one good use here is as a **second test oracle**: Bocfel compiled once, test-only, beside ZVM, so transcripts are checked against two implementations. Optional, Phase 2.
- **`zmachine`** is specified in §8.1. Hooks on writes, calls and prints exist from day one so a later debugger (frotztrace) can attach without changes. Where it runs:
  - **Main thread by default**, with a cooperative budget: `run(budget)` returns after N instructions and the host yields to the event loop before continuing, so a looping story can't hang the tab. This is the path for `<frotz-play>` and the exported bundle, and it is why `<frotz-play>` really is one script tag: no second file, no `blob:` worker (which `script-src 'self'` would block without `worker-src blob:`).
  - **In a worker, opt-in**, via `@frotzinc/worker-rpc`, when the host supplies a same-origin worker URL (`<frotz-play worker-src="/frotzplay.worker.js">`, shipped beside `frotzplay.js` on npm). `apps/play` does this. The screen model is posted to the main thread as a diff after each stop.

  Same code path, one flag.
- **`player`** draws the screen model and owns input, settings, saves and the contract. Its components are **plain Vue with the player's own CSS**: no Nuxt UI and no Tailwind inside them, because they must work in a shadow root under a strict CSP. Tailwind v4's `@property` registrations don't take effect inside a shadow root, Reka UI (under Nuxt UI) teleports dialogs to `<body>` outside the shadow root and its styles, and Nuxt UI sets inline `style` attributes that `style-src 'self'` blocks. So:
  - tokens come from `nuxt-base`'s `palette.css` (imported as CSS custom properties, one source);
  - the settings, shortcuts and saves dialogs are native `<dialog>` elements inside the component;
  - no inline `style` attributes; dynamic values (line length, size, spacing) are set as custom properties with `CSSStyleDeclaration.setProperty`, which CSP allows;
  - in the custom element, styles are applied as constructable stylesheets (`adoptedStyleSheets`), not injected `<style>` tags. The embed test (§9) is what proves this passes `style-src 'self'` in Chrome, Firefox and Safari; if a browser disagrees, the fallback is a same-origin `frotzplay.css` linked from inside the shadow root.

  `apps/play` wraps these components in the Nuxt UI shell. The web component is the same `ZPlayer` built with `defineCustomElement`, so an embedder needs one tag and no stylesheet.
- **`apps/play`** is thin: the family shell, the **drop zone that is the first thing on the page when the app starts** (drop a story anywhere on the window, or choose a file, or open a `?story=` link; the same as Frotzlens's start page), the URL loader, the `player` component, and **Export**.
- **Export** lives in `player` as a pure function (`bundle(story, options) → { html }` and `bundleFolder(…) → files[]`) so the CLI and frotzpack can call it too. The single-file form inlines the built `<frotz-play>` script and CSS (the app ships its own built copy as a string asset), the story as base64, and the cover as a data URI; it sets a `<meta http-equiv="Content-Security-Policy">` that forbids everything but itself (the inline script and stylesheet allowed by their `sha256-` hashes, images by `data:`), works from `file://` (no fetches, no workers: the main-thread path), and names the file from the story's title. The folder form is the same page split into files, with a `README.txt` that says "open index.html" and how to put it on a web host.
- **Shell extraction.** `AppHeader`, `AppFooter`, `AboutMenu`, `AboutDialogs`, `useAbout` and the report and markdown utils they use (`report.ts`, `markdown.ts`) move from `apps/web` into `nuxt-base`, so the apps share one header, About menu and footer. Today they import `~~/site.config` and hard-code "Frotzlens" and its repo URL; that becomes a typed `product` key in each app's `app.config.ts` (name, tagline, repo, npm and family URLs, licences), the changelog is passed in by the app, and `AppHeader` gets slots for each app's own buttons (Frotzlens's Go to…, Names and Open another file). `AppNav` stays in Frotzlens: it is Frotzlens's list of views, not shell. The move doesn't touch the views.

### 8.1 `@frotzinc/zmachine` — the interpreter

**Why a new interpreter and not ZVM.** ZVM (ifvms.js, what Parchment and Frotzsmith use) compiles each Z-code routine to a JavaScript function and runs that, which is why it needs `'unsafe-eval'`, and why it can't be stepped or hooked between instructions. `@frotzinc/zcode` already decodes; the interpreter is "apply this `Instruction` to this machine state."

**Machine state** (all serializable; one mechanism for Quetzal, undo, autosave and, later, rewind):

- Dynamic memory (a copy of the story's dynamic area; static and high memory read through to the story bytes).
- The stack: frames of `{ returnPC, locals[], evalStack[], storeVariable, argCount }`.
- PC. Random state (`{ mode, seed, state }`). Screen model. Input state (`awaiting: 'line' | 'char' | null`, any timeout). Instruction and turn counters. Undo ring.

**Execution loop.** `step()` decodes the instruction at PC with `zcode`'s decoder (cached per address, since code is immutable), runs it, advances. `run(budget)` steps until input is needed, the budget is spent, the game quits, or a fault. Every memory write, call, return, branch, print and input goes through a hook. Nothing in the loop touches the DOM.

**Screen model.** The Standard's §8, not Glk: a lower window (a scrollback of styled runs with a current line) and an upper window (a `rows × cols` character grid with a cursor), `buffer_mode`, output streams 1–4. `show_status` and the v3 status line render into the upper window, and for v3 the model also keeps the structured room/score/moves for the announcer (§6). The player draws the model; the Node runner flattens it to text the way Frotzsmith's `normalizeTurnOutput` expects.

**Header.** The interpreter number/version and screen size written into the header change what games print (wrapping, centring, version banners). They are parameters; the Node runner and the oracle tests use the values Frotzsmith's `headless-glkote` reports, pinned in one place, so transcripts differ only for real reasons.

**Input.** `read` and `read_char` suspend the machine (`awaiting` set, PC at the instruction) and return control; the host supplies the line or character and calls `resume()`. Timed input (v4+) is a deadline the host honours by calling `interrupt()`, which runs the timer routine as the Standard describes; the host records each firing (§6) so replays reproduce it.

**Random.** Two modes, matching ZVM so the oracle comparison holds (§9):
- *seeded*: a 32-bit xorshift (`s ^= s << 13; s ^= s >> 17; s ^= s << 5`, result `1 + ((s & 0x7FFF) % range)`), the algorithm ZVM uses after a game seeds it (MIT, attributed in a comment). The session seed (§7) starts it; a game's own `@random` with a negative or zero argument reseeds or switches mode exactly as ZVM does.
- *true random*: only when the user turns determinism off entirely.

This is a deliberate choice against the Standard 1.1 §2.4 *recommendation* (a predictable counting sequence for seeds under 1000), which is a "should," not a "must," and which ZVM also doesn't implement. It is documented in the README's conformance notes.

**Save and undo.** Quetzal 1.4: `IFhd`, `CMem` (XOR-RLE against the original dynamic memory) and `Stks`. `save` produces bytes the host stores or downloads; `restore` takes them. `save_undo`/`restore_undo` keep up to N snapshots in memory.

**Conformance.** Standard 1.1 for v3/4/5/8 (the versions ZVM, the oracle, supports), including the things interpreters get wrong; the list is the kickoff prompt's rule 6. Each cited in a comment.

## 9. Testing

- **Walkthroughs to test against.** Today Frotzsmith's golden test covers only `demo.z5` with two commands, and `samples/` has no walkthroughs and no v4 story. Phase 1 writes a command script for every sample (`samples/walkthroughs/<name>.txt`, Frotzsmith's `parseScript` format) that reaches the end or covers every room and verb, and adds a v4 build of at least two samples to `scripts/build-samples.mjs`.
- **What the ZVM oracle can and can't check.** The headless ZVM in `runReplay` does no file I/O (its `HeadlessDialog` answers every save/restore prompt with "cancelled"), has no seed parameter, and runs no timers. So:
  - *transcripts*: compared with ZVM seeded through the harness (the harness sets ZVM's `xorshift_seed` to the test's seed before boot, and frotzplay uses the same xorshift, §8.1), so random-using samples such as `magic-8-ball` compare too;
  - *save/restore*: first, give the vendored test harness an in-memory `Dialog` (a `Map` of filerefs) so ZVM can save and restore; if that isn't cheap, check Quetzal against Bocfel-in-WASM or against `.qzl` files saved by a desktop interpreter and committed with provenance. Either way, frotzplay's own round-trip (save at turn k, restore, continue = uninterrupted transcript) is always checked;
  - *timed input*: not oracle-checked; covered by opcode tests and by replaying recorded timer events.
- **Interpreter:** opcode unit tests with a tiny test assembler; every fixture walkthrough's transcript equals `runReplay`'s (seeded); optionally Bocfel-in-WASM as a second oracle; Praxix and Czech if licensed; Quetzal as above; determinism (same seed and timer events → same transcript).
- **Contract:** a Playwright suite that plays the sample with a scripted session and asserts each statement in §6 that a browser can check (announcer behaviour per verbosity, focus, keyboard operation, contrast via axe, reflow at 320 px, 200% zoom). NVDA by hand before release, with the checklist in `docs/accessibility.md`.
- **Embed:** a Playwright test loads a plain HTML page with `default-src 'self'; script-src 'self'; style-src 'self'` and `<frotz-play>` (main-thread path, then with `worker-src`), plays a turn, opens the settings dialog, and asserts no CSP violations and correct styling, in Chromium, Firefox and WebKit.
- **URL compatibility:** `?story=` with a same-origin story, a CORS story, and a non-CORS story (which must fail with the worded error); any further Parchment URL forms once checked against its source.

## 10. Licensing

Frotz, Inc. policy: apps GPL-3.0-or-later, libraries MIT. `@frotzinc/zmachine` and `@frotzinc/player` are MIT, which is deliberate: an embeddable player under GPL would keep most sites from using it. `apps/play` is GPL. Because the libraries are MIT, no code from GPL interpreters (Frotz, and anything derived from it) may be used in them; Parchment and ZVM are MIT and may be learned from, with attribution for anything copied. ZVM is a test-only oracle through Frotzsmith's engine and ships in nothing.

## 11. Branding and deployment

- Icon: the family badge with a play glyph drawn as a Z-machine prompt (`>` leaning into a triangle). Not a lantern.
- The Frotzlens header, footer and About menu; the shortcuts dialog; the family amber for focus and the prompt.
- frotzplay.frotzinc.com, static, Netlify, base `apps/play`, same monorepo site setup. Chris connects it. PWA like Frotzsmith.
- `frotzplay` reserved on npm with the placeholder pattern (GPL for the app name; the libraries are the `@frotzinc` ones).

## 12. Phases

| Phase | Builds | Done when |
|---|---|---|
| **0** | Shell extraction: `AppHeader`/`AppFooter`/`AboutMenu`/`AboutDialogs`/`useAbout` and their utils into `nuxt-base`, `site.config` replaced by a typed `product` app config, header slots for app buttons; Frotzlens uses them unchanged. Reserve `frotzplay` on npm. | Frotzlens Playwright green; placeholder published |
| **1** | `@frotzinc/zmachine`: state, loop, every opcode (v3/4/5/8), screen model, input suspension, ZVM-compatible seeded random, hooks, pinned header values. Opcode tests. A Node runner for scripts. Walkthrough scripts for every sample; v4 sample builds; the seeded oracle harness. | Every fixture walkthrough equals seeded `runReplay` |
| **2** | Quetzal in/out, undo, conformance stories (after the licence check), determinism tests, the oracle's in-memory `Dialog` (or the fallback in §9). | Quetzal checked per §9; same seed + timer events → same transcript |
| **3** | `@frotzinc/player`: the Screen, the announcer and verbosity, the command line, status announcements, settings, saves (file, autosave, undo), transcript; high-contrast tokens; the contract implemented and its Playwright suite. | Contract suite green; NVDA checklist passed on the sample |
| **4** | `apps/play`: drop zone, the sample stories on the start page and `?sample`, `?story=` (with the non-CORS error), `postMessage` source, Blorb cover and title, autosave wired to IndexedDB, PWA, About with Parchment credits, `netlify.toml`. | Playable at the Netlify preview with a dropped file and a `?story=` URL |
| **5** | The `<frotz-play>` web component with the strict-CSP embed test; **Export** (single HTML file and folder), with a Playwright test that opens the exported file from `file://` and plays a turn; `docs/accessibility.md`; README with "Standing on"; light and high-contrast passes; publish `@frotzinc/zmachine`, `@frotzinc/player`, `frotzplay` 0.1.0. | frotzplay 0.1.0 at frotzplay.frotzinc.com; `<frotz-play>` on npm; an exported `dark-cellar.html` plays from a double-click |

After this, frotztrace (not yet started) begins with the interpreter already done; its draft design's interpreter phases are revised to build on `@frotzinc/zmachine` rather than write it.

## 13. Open questions

1. **Praxix/Czech licences** (the answer carries over to frotztrace later).
2. **Dyslexia-friendly face.** OpenDyslexic (SIL OFL) is the usual choice and is self-hostable like the rest; confirm it's wanted, since opinions on it differ.
3. **Autosave cadence.** Every turn is cheap (dynamic memory ≤ 64 KB); confirm there's no story where that's wrong (timed-input games that write every tick).
4. **Web component bundle size.** Framing is settled (§8: Vue custom element over plain-Vue components, no Nuxt UI or Tailwind inside, constructable stylesheets). Still open: measure the bundle with the Vue runtime inside, and fall back to a hand-written element over the same screen model only if it is unreasonable.
5. **`file://` constraints for the exported bundle.** Workers and `fetch` are unreliable from `file://`; the bundle must run the interpreter on the main thread with a cooperative budget and read the story from the inlined base64. IndexedDB autosave may be unavailable from `file://` in some browsers; fall back to in-memory undo and a "download save" button. Verify in Chrome, Firefox, Safari and Edge.
6. **Status-line sentence format** for the v3 announcer (room first? score first?), to be settled with NVDA in hand.
7. **A CORS proxy for `?story=`.** Parchment uses one for servers without CORS headers. A proxy is a server that sees which stories people open, which is against "nothing leaves the machine"; v1 has none and says so in the error. Revisit if IFDB links commonly fail.
8. **Parchment URL forms.** Confirm against Parchment's current source which parameters and fragment forms it accepts, and honour those that make sense.

## 14. Later

Frotzlens's Play view on `<frotz-play>` (dropping the sandbox); Frotzsmith's player likewise, if it wants to; frotzpack's generated game page; frotztrace (once started) on the same Screen; a Chrome extension that plays `.z5` links in place; a "feelies shelf" when frotzpack exists.
