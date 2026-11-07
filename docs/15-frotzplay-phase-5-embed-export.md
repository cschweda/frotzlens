# frotzplay — Phase 5: Embed, Export, Ship

**Document 15 · frotzplay Phase 5** (design: [`frotzplay-design.md`](frotzplay-design.md) §4, §7, §8; Phases [0](10-frotzplay-phase-0-shell.md)–[4](14-frotzplay-phase-4-site.md))
**Status:** embed and export built and tested 2026-11-07 (§4); shipping waits for Chris (§3).
**Deliverable:** the `<frotz-play>` web component, which embeds under `script-src 'self'; style-src 'self'`; **Export** of the story you're playing to one HTML file that plays from a double-click, or to a folder for any static host; `@frotzinc/zmachine`, `@frotzinc/player` and `frotzplay` ready for 0.1.0.

> **Exit criteria:** a plain page with `default-src 'self'; script-src 'self'; style-src 'self'` and `<frotz-play>` plays a turn and opens Settings with no CSP violation, in Chromium, Firefox and WebKit; an exported single file, opened from `file://`, plays a turn with no console errors; an exported folder, served statically, does the same; the release is ready for Chris's 2FA.

---

## 1. `<frotz-play>`

- `ZPlayer` as a custom element (Vue's `defineCustomElement`), built as **one self-contained script**, `frotz-play.js` (Vue inside), into `@frotzinc/player`'s `dist/`. No eval: Vue's runtime build, with templates compiled at build time.
- **Styles without `<style>` tags:** the player's CSS is applied to the shadow root as a constructable stylesheet (`adoptedStyleSheets`), which `style-src 'self'` doesn't govern; no inline `style` attributes anywhere (settings are custom properties set from script). The embed test proves it in all three browsers.
- **Attributes:** `src` (a story URL), `title`, `seed`, `font-base` (where `fonts/` is served; empty turns the OpenDyslexic option off), `autosave` (`off` to turn it off). **Property:** `story` (bytes), for a host that has the file already. **Events:** `turn`, `input-wanted`, `quit`, `save`, `error`, as `CustomEvent`s.
- Main thread only (docs/14 §5): the element is one script, nothing else to host.

## 2. Export

`bundle()` and `bundleFolder()` in `@frotzinc/player` (pure functions; the site and, later, the CLI and frotzpack call them):

- **One HTML file:** the element's script inline, the story as base64 in a `<script type="application/octet-stream">` (data, never run), the title, and a `<meta http-equiv="Content-Security-Policy">` that allows exactly its two inline scripts (the element, and a few lines that hand it the story) and its one inline style, by their SHA-256 hashes: `default-src 'none'; script-src 'sha256-…' 'sha256-…'; style-src 'sha256-…'; img-src blob:; base-uri 'none'; form-action 'none'`. No fetches, no workers; plays from a double-click.
- **A folder** (as a `.zip`, stored, no compression library): `index.html`, `frotzplay.js`, `frotzplay.css`, `story.js` (the story as base64, so `index.html` plays from `file://`, where a page can't fetch a file beside it), `boot.js`, `story.<ext>` (the story file itself, for any interpreter) and `README.txt` (*open index.html; to put it online, upload this folder to Netlify, itch.io or any static host*). No CSP of its own: the host it's uploaded to sets one, and everything in it is a plain `'self'` script, so `script-src 'self'` is all it needs.
- **Both are branded:** a header with frotzplay's mark (inline SVG, so the CSP stays closed) and name and the story's title; a footer with *Played with frotzplay* and links to frotzplay (the site that made the export, `siteUrl`), the source on GitHub and frotz, Inc.
- Neither carries the OpenDyslexic files (four fonts, 430 KB, would need `font-src data:` in a single file); the option is off in exports.
- **The site:** *Export* in the header while a story plays: a dialog offering the single file or the folder. The element's script is served by the site (`/frotz-play.js`) and fetched when exporting (precached by the PWA, so exporting works offline).

## 3. Ship

Versions 0.1.0 for `@frotzinc/zmachine` and `@frotzinc/player` (and `@frotzinc/zcode` 0.4.0, `@frotzinc/nuxt-base` 0.2.0, which they need), changelogs, and the `frotzplay` placeholder package; publishing waits for Chris (npm 2FA), through `publish.sh` as for the other packages.

## 4. Done

- **`<frotz-play>`** (`packages/player/src/element.ts`, built to `dist/frotz-play.js`: one classic script, 146 KB, 53 KB gzipped, no `eval`). **The embed test** (`e2e/embed.spec.ts`): a page with `default-src 'self'; script-src 'self'; style-src 'self'` and nothing else plays a turn, opens Settings, switches theme, with styles applied and **no CSP violation in Chromium, Firefox or WebKit**.
- **Found on the way, and fixed in the player:** WebKit counts even script-set style properties against `style-src`, so the text settings are now data attributes matched by plain CSS (no inline styles at all); and WebKit's own `<select>` markup trips a strict CSP (a bare `<select>` in an empty page does it), so the four text settings are now radio groups. Constructed stylesheets are fine in all three.
- **Export** (`src/export.ts`: `bundle`, `bundleFolder`, `zip`): the single file plays from `file://` under its own hash-based CSP; the folder (unzipped by the system's `unzip`, so the `.zip` is real) plays from `file://` too; both in all three browsers (`e2e/export.spec.ts`). **The site** has *Export* in the header while a story plays (tested: both downloads, axe).
- **Tests:** the player's suite is now 96 (contract 87, embed 3, export 6); the site's 42 (41 + the Firefox service-worker skip).

**Still to do, with Chris (§3):**
1. ~~Extend `publish.sh` for `zmachine` and `player`~~ Done (frotzlens 0.3.2): their runtime dependencies are other `@frotzinc` packages at exact versions already on npm, as the CLI's are; `scripts/smoke/zmachine.mjs` and `scripts/smoke/player.mjs` test the packed tarballs.
2. The release: versions (`@frotzinc/zcode` 0.4.0, `@frotzinc/nuxt-base` 0.2.0, `@frotzinc/zmachine` 0.1.0, `@frotzinc/player` 0.1.0), changelogs, tags, CI on the tags.
3. Publish in dependency order (zcode, nuxt-base, zmachine, player), each with Chris's npm 2FA link; then the `frotzplay` name.
