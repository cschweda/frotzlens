# Changelog

All notable changes to frotzplay: the web player at frotzplay.frotzinc.com, and this repository. Versions will follow [Semantic Versioning](https://semver.org/). Part of [Frotz, Inc.](https://frotzinc.com).

## [Unreleased]

### Added
- The design (`docs/frotzplay-design.md`) and the kickoff prompt (`docs/frotzplay-kickoff-prompt.md`), draft 2, in the monorepo's `docs/`.
- `apps/play/`: `README.md`, this changelog, and `netlify.toml` (security headers, and an `ignore` rule so Frotzlens-only commits don't redeploy frotzplay).

### Changed (draft 1 → draft 2 of the design)
- **The ZVM oracle's limits, written down.** Headless ZVM doesn't save or restore, takes no seed and runs no timers. Seeded random now uses ZVM's own xorshift, and the harness seeds ZVM to match. Quetzal is checked through an in-memory dialog or a fallback. The header values are pinned for tests. Walkthroughs and a v4 sample are Phase 1 work.
- **Embedding under a strict CSP.** The interpreter runs on the main thread by default, so `<frotz-play>` is one script tag; a same-origin worker is opt-in. The player's components are plain Vue with their own CSS (no Nuxt UI or Tailwind in the shadow root), with styles applied as constructable stylesheets. The strict-CSP promise covers the player and the export, not the hosted Nuxt page.
- **The accessibility contract.** Announcements go through a dedicated announcer, so verbosity can work; the three verbosity levels are defined. The status sentence is v3 only; v4+ reads the grid row as-is. Corrected WCAG citations (visible focus is 2.4.7). Style markup no longer claims meaning (`<b>`/`<i>`/spans). Timed input can be paused, and timer events are recorded so replays stay deterministic.
- **Seeds.** Every session has one, random by default and shown; `?seed=` fixes it.
- **Smaller fixes.** "Open in Parchment" hidden for dropped files; no CORS proxy, with a worded error for non-CORS URLs; Parchment URL forms to be checked against its source; the Phase 0 shell move includes `AboutDialogs`, its utils and `site.config` (and leaves `AppNav`, which is Frotzlens's views); high-contrast tokens go in `nuxt-base`; the docs no longer depend on frotztrace, which hasn't started.
