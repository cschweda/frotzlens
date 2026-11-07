# Changelog

All notable changes to `@frotzinc/player`. Versions follow [Semantic Versioning](https://semver.org/). Part of [Frotz, Inc.](https://frotzinc.com).

## [Unreleased]

### Added
- **`<frotz-play>`**, the player as one self-contained script (`dist/frotz-play.js`) that embeds under `script-src 'self'; style-src 'self'`: CSS adopted into the shadow root, no `<style>` tags, no inline styles. Tested in three browsers with no CSP violation.
- **Export:** `bundle()` (one HTML file that plays from `file://`, under a hash-based CSP), `bundleFolder()` and `zip()` (a folder for any static host, which also plays from `file://`).
- `v-model:theme` on `ZPlayer`, so a host page and the player share one theme.
- The player (frotzplay Phase 3, [docs/13](../../docs/13-frotzplay-phase-3-player.md)): `ZPlayer` and its parts (status bar, upper window, story, command line, toolbar, announcers, messages, the Settings, Keyboard shortcuts and Restore dialogs), `useMachine`, autosave in IndexedDB, settings and shortcuts in localStorage, transcript and command-script export, save and restore as Quetzal files.
- The accessibility contract ([docs/accessibility.md](../../docs/accessibility.md)), all 25 statements: a Playwright suite in Chromium, Firefox and WebKit (axe in every state, AAA contrast in dark) and unit tests.
- The text settings are radio groups and data attributes (no `<select>`, no inline styles), so a strict CSP holds in Safari too.
- Themes: dark (default), light, high contrast; OpenDyslexic and monospace fonts; size, line length and spacing.
