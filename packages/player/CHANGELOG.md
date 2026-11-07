# Changelog

All notable changes to `@frotzinc/player`. Versions follow [Semantic Versioning](https://semver.org/). Part of [Frotz, Inc.](https://frotzinc.com).

## [0.1.0] - 2026-11-07

The first release: the accessible player, the `<frotz-play>` element and Export. (On npm once published.)

### Changed
- **Exports carry frotzplay's branding:** a header with frotzplay's mark and name and the story's title, and a footer with links to frotzplay (the site that made the export), the source on GitHub and Frotz, Inc. The mark is inline SVG, so the single file's strict CSP still allows nothing external. `bundle()` and `bundleFolder()` take `siteUrl`.
- **The player is its own page**, as Parchment's story column is, but dark by default: warm paper (`#211d16`) with a deeper inset for the status line and command field, a soft edge, a shadow and a faint lamplight glow; light is parchment (`#f4ecd8`); high contrast stays plain black. Every text colour stays at 7:1 or better in dark (the lowest, 7.38:1), 4.9:1 or better in light.

### Added
- **`<frotz-play>`**, the player as one self-contained script (`dist/frotz-play.js`) that embeds under `script-src 'self'; style-src 'self'`: CSS adopted into the shadow root, no `<style>` tags, no inline styles. Tested in three browsers with no CSP violation.
- **Export:** `bundle()` (one HTML file that plays from `file://`, under a hash-based CSP), `bundleFolder()` and `zip()` (a folder for any static host, which also plays from `file://`).
- `v-model:theme` on `ZPlayer`, so a host page and the player share one theme.
- The player (frotzplay Phase 3, [docs/13](../../docs/13-frotzplay-phase-3-player.md)): `ZPlayer` and its parts (status bar, upper window, story, command line, toolbar, announcers, messages, the Settings, Keyboard shortcuts and Restore dialogs), `useMachine`, autosave in IndexedDB, settings and shortcuts in localStorage, transcript and command-script export, save and restore as Quetzal files.
- The accessibility contract ([docs/accessibility.md](../../docs/accessibility.md)), all 25 statements: a Playwright suite in Chromium, Firefox and WebKit (axe in every state, AAA contrast in dark) and unit tests.
- The OpenDyslexic fonts and their licence (`fonts/`) ship in the package, for `<frotz-play font-base>`.
- The text settings are radio groups and data attributes (no `<select>`, no inline styles), so a strict CSP holds in Safari too.
- Themes: dark (default), light, high contrast; OpenDyslexic and monospace fonts; size, line length and spacing.
