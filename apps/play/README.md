# frotzplay

[![License: GPLv3 (app), MIT (libraries)](https://img.shields.io/badge/License-GPLv3%20%2B%20MIT-blue.svg)](../../LICENSE)
[![Z-machine](https://img.shields.io/badge/Z--machine-v3%20%C2%B7%20v4%20%C2%B7%20v5%20%C2%B7%20v8-f59e0b.svg)](https://inform-fiction.org/zmachine/standards/)
[![Status](https://img.shields.io/badge/status-design-lightgrey.svg)](./CHANGELOG.md)

A Z-machine player for the web, built for two things no existing player is built for: **people who use screen readers**, and **pages that can't allow `eval`**. It plays version 3, 4, 5 and 8 story files, bare or in a Blorb, in the browser, with nothing uploaded. Part of [Frotz, Inc.](https://frotzinc.com), beside [Frotzsmith](https://frotzsmith.com) and [Frotzlens](https://frotzlens.frotzinc.com).

> **Status: design.** No code yet. frotzplay is built in this monorepo: the interpreter in `packages/zmachine`, the player in `packages/player`, and this hosted app in `apps/play`. See the docs.

## Standing on

frotzplay is a sibling of [Parchment](https://github.com/curiousdannii/parchment), not a rival. For Glulx, TADS, Hugo and everything that isn't Z-code, use Parchment.

- **[Parchment](https://github.com/curiousdannii/parchment)**, maintained by Dannii Willis since 2008, the web player for interactive fiction, and the prior art for everything here.
- **[ZVM / ifvms.js](https://github.com/curiousdannii/ifvms.js)**, Parchment's Z-machine engine, and frotzplay's test oracle (test-only; shipped in nothing).
- **[GlkOte](https://github.com/erkyrath/glkote)**, by Andrew Plotkin.
- **[The Z-Machine Standards Document 1.1](https://inform-fiction.org/zmachine/standards/)**, by Graham Nelson, Andrew Hunter and contributors, which the interpreter is written from.
- **[Quetzal](https://inform-fiction.org/zmachine/standards/quetzal/)**, the save-file format, by Martin Frost.
- **[Blorb](https://eblong.com/zarf/blorb/)**, the story-packaging format, by Andrew Plotkin.

## What it will do

- **A published, tested accessibility contract** (WCAG 2.2 AA): one announcement per turn, a status line announced only when it changes, verbosity settings, timed input you can pause, everything from the keyboard. Checked by Playwright + axe, and by NVDA before each release.
- **No `eval`.** The interpreter is TypeScript, not a JIT, so `<frotz-play>` embeds under `script-src 'self'; style-src 'self'`.
- **One-click export** to a single self-contained HTML file that plays from a double-click, or a folder ready for any static host.
- **Seeded play** (`?seed=`), Quetzal saves as real files, autosave, undo and transcripts.
- **Parchment's URLs:** `?story=<url>` works the same way, so a "play online" link works with either player.

## Docs

- [`docs/frotzplay-design.md`](../../docs/frotzplay-design.md): the design. What it is, why, the accessibility contract, architecture, testing, phases, open questions.
- [`docs/frotzplay-kickoff-prompt.md`](../../docs/frotzplay-kickoff-prompt.md): the same design in imperative form, for starting the build.

## Hosting

The hosted page is a static Nuxt site on Netlify at frotzplay.frotzinc.com. It is a second Netlify site on this repo with base directory `apps/play`; [`netlify.toml`](netlify.toml) carries its build, its security headers, and an `ignore` rule that skips the deploy when a commit touches nothing frotzplay is built from.

## Licensing

Frotz, Inc. policy: apps GPL-3.0-or-later, libraries MIT. The hosted app (`apps/play`) is GPL-3.0-or-later ([`LICENSE`](../../LICENSE)). The libraries, `@frotzinc/zmachine` and `@frotzinc/player`, will be MIT and carry their own `LICENSE`, so any site can embed the player. No code from GPL interpreters goes into them.
