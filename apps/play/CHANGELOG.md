# Changelog

All notable changes to frotzplay: the web player at frotzplay.frotzinc.com, and this repository. Versions follow [Semantic Versioning](https://semver.org/). Part of [Frotz, Inc.](https://frotzinc.com).

## [0.1.2] - 2026-11-07

### Added
- Privacy-friendly analytics by [Plausible](https://plausible.io): page views only, no cookies, nothing about the story being played. The CSP allows `https://plausible.io` in `script-src` and nothing else new.

### Changed
- `@frotzinc/zmachine` 0.1.0 and `@frotzinc/player` 0.1.0 are on npm, with `@frotzinc/zcode` 0.4.0 and `@frotzinc/nuxt-base` 0.2.0.

## [0.1.1] - 2026-11-07

### Changed
- The meta description (and the Open Graph and Twitter ones) is 149 characters, under the 160 that search results and link previews show.

### Added
- `datePublished` and `dateModified` in the structured data (JSON-LD); `dateModified` is the build's commit date, so it moves with each deploy. And `inLanguage`.

## [0.1.0] - 2026-11-07

The first release of frotzplay, live at [frotzplay.netlify.app](https://frotzplay.netlify.app) (and frotzplay.frotzinc.com once its DNS is set).

### Changed
- Exported stories carry frotzplay's branding: the mark, the name, and links back to frotzplay, its source on GitHub and Frotz, Inc.
- The story plays on its own page: warm dark paper, like Parchment's story column but dark by default; parchment in the light theme.
- The web app manifest is served as `application/manifest+json`.

### Added
- `llms.txt` ([llmstxt.org](https://llmstxt.org)): a plain-text summary of frotzplay for AI assistants, from `site.config.ts`.

### Added
- **Export** (Phase 5): the story you're playing, as one HTML file that plays from a double-click, or a folder (.zip) for any web host; made in the browser.
- **The site** (Phase 4, [docs/14](../../docs/14-frotzplay-phase-4-site.md)): the family shell; the start page (drop zone, *Choose a file*, the four samples, the Parchment pointer); the player filling the page; `?sample=`, `?story=` (this site, or another with CORS; worded errors otherwise), a story handed over by the opening window; Blorb titles, authors and covers; *Another story*, *Open in Parchment*; About crediting Parchment and ZVM; one theme for page and player; a PWA. Tested in three browsers against the built site with the production headers.
- **The social card and icons:** `public/og-image.svg` (rendered to `og-image.png`, 1200 × 630), in the family's style: an amber tile with frotzplay's mark (a play triangle as the Z-machine prompt, its cursor beside it), the wordmark, and a faint Dark Cellar session behind. `logo.svg`, `favicon.svg` and the PNG icons (32, 180, 192, 512).
- **SEO, ready for the site:** `site.config.ts` (identity, canonical URL, the start page's samples), `seo.ts` (title, description, Open Graph and Twitter cards, canonical, icons, theme colours, schema.org JSON-LD with accessibility properties), `scripts/seo-files.mjs` (`robots.txt`, `sitemap.xml`).
- **The README:** the social card, where things stand, a comparison with Parchment, and what the interpreter shows today.

### Changed
- **The Parchment comparison is corrected.** Parchment now runs Z-code on Bocfel in WebAssembly (ZVM is retired there), so a page embedding it needs `'wasm-unsafe-eval'`, not `'unsafe-eval'`; and its Site Generator already makes single-file pages. The design and kickoff say so.

### Added
- The design (`docs/frotzplay-design.md`) and the kickoff prompt (`docs/frotzplay-kickoff-prompt.md`), draft 2, in the monorepo's `docs/`.
- `apps/play/`: `README.md`, this changelog, and `netlify.toml` (security headers, and an `ignore` rule so Frotzlens-only commits don't redeploy frotzplay).

### Changed (draft 1 → draft 2 of the design)
- **The ZVM oracle's limits, written down.** Headless ZVM doesn't save or restore, takes no seed and runs no timers. Seeded random now uses ZVM's own xorshift, and the harness seeds ZVM to match. Quetzal is checked through an in-memory dialog or a fallback. The header values are pinned for tests. Walkthroughs and a v4 sample are Phase 1 work.
- **Embedding under a strict CSP.** The interpreter runs on the main thread by default, so `<frotz-play>` is one script tag; a same-origin worker is opt-in. The player's components are plain Vue with their own CSS (no Nuxt UI or Tailwind in the shadow root), with styles applied as constructable stylesheets. The strict-CSP promise covers the player and the export, not the hosted Nuxt page.
- **The accessibility contract.** Announcements go through a dedicated announcer, so verbosity can work; the three verbosity levels are defined. The status sentence is v3 only; v4+ reads the grid row as-is. Corrected WCAG citations (visible focus is 2.4.7). Style markup no longer claims meaning (`<b>`/`<i>`/spans). Timed input can be paused, and timer events are recorded so replays stay deterministic.
- **Seeds.** Every session has one, random by default and shown; `?seed=` fixes it.
- **Smaller fixes.** "Open in Parchment" hidden for dropped files; no CORS proxy, with a worded error for non-CORS URLs; Parchment URL forms to be checked against its source; the Phase 0 shell move includes `AboutDialogs`, its utils and `site.config` (and leaves `AppNav`, which is Frotzlens's views); high-contrast tokens go in `nuxt-base`; the docs no longer depend on frotztrace, which hasn't started.
