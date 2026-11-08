# Changelog

All notable changes to frotztrace, the site at [frotztrace.frotzinc.com](https://frotztrace.frotzinc.com). Versions follow [Semantic Versioning](https://semver.org/). Part of [frotz, Inc.](https://frotzinc.com).

## [0.2.0] - 2026-11-08

Source, time, polish (frotztrace Phase 5, docs/22).

### Added
- **Source**: the game's own file, the machine's line marked, and a gutter to set a breakpoint on a line.
- **Watches**, **Timeline** (every turn, "Go here", a scrubber over every instruction) and a **live Map** (the room you're in, the rooms visited).
- **F8**, **F9** and **?** (the shortcuts dialog).
- **From frotzlens**: its Debug button hands frotztrace the story it has open (and the debug file), with nothing uploaded.

### Fixed
- Watches and the "changed" marks compare stop to stop (they compared with the last slice of the run).
- "Go here" says which turn to a screen reader, in words that contain what's shown.

## [0.1.0] - 2026-11-08

The debugger (frotztrace Phase 4, docs/21).

### Added
- **Samples, so nothing of your own is needed**: five of frotzsmith's games (the Dark Cellar first, the Locked Chest, the Hermit, Magic 8-Ball, and the Dark Cellar on PunyInform), each built with its debug file and source, and its walkthrough, which "Type the next command" plays one step at a time. `?sample=<id>` opens one.
- **Your own story**: drop or choose the story, and if you have them its debug file and source.
- **The game**, drawn by `@frotzinc/player`'s own components, as frotzplay draws it; stopped mid-turn, the turn so far is shown.
- **The toolbar**: Run (F5), Pause (F6), Step into (F11), Step over (F10), Step out (Shift+F11), Step back (Shift+F10); and a status line: where the machine is, the source line, the turn, why it stopped, and the action with its noun.
- **The views**: Stack (named frames, locals, source lines), Code (the disassembly with the PC marked and a breakpoint gutter), Objects, Globals and Memory (live, with what changed lit), Breakpoints (add as text, with a condition; on, off, hits) and Trace.
- The machine runs on the page, in slices, so it stays responsive (decision A); the screen comes from the player (decision B).

## [0.0.6] - 2026-11-08

### Fixed
- The e2e test of the sent-report toast: Nuxt UI repeats a toast's title for screen readers, so the test takes the first of the two (it passed or failed on timing).

## [0.0.5] - 2026-11-08

### Added
- Report a problem / Suggest a feature can send by email (`netlify/functions/report.mjs`, Resend), once the site has its Resend settings.

## [0.0.4] - 2026-11-08

### Changed
- The social card's faded disassembly sits above and below the wordmark, as frotzplay's does.

## [0.0.3] - 2026-11-08

### Fixed
- The Netlify build: the library-build step runs with `--if-present`. frotztrace's only library so far, nuxt-base, has no build step, and pnpm fails a filtered `run` that finds no script, so the first Deploy Preview failed.

## [0.0.2] - 2026-11-08

### Changed
- The README names the Netlify site: `frotztrace` (frotztrace.netlify.app), base directory `apps/trace`, production branch `main`.

## [0.0.1] - 2026-11-08

### Added
- The site, before the debugger: a page saying what frotztrace will do, in the family shell and look (header, footer, About menu, dark by default), with its social card, icons, `robots.txt` and `sitemap.xml`. It gives the site its domain and Netlify settings now; the debugger arrives in Phase 4.
