# Changelog

All notable changes to `@frotzinc/player`. Versions follow [Semantic Versioning](https://semver.org/). Part of [Frotz, Inc.](https://frotzinc.com).

## [Unreleased]

### Added
- `v-model:theme` on `ZPlayer`, so a host page and the player share one theme.
- The player (frotzplay Phase 3, [docs/13](../../docs/13-frotzplay-phase-3-player.md)): `ZPlayer` and its parts (status bar, upper window, story, command line, toolbar, announcers, messages, the Settings, Keyboard shortcuts and Restore dialogs), `useMachine`, autosave in IndexedDB, settings and shortcuts in localStorage, transcript and command-script export, save and restore as Quetzal files.
- The accessibility contract ([docs/accessibility.md](../../docs/accessibility.md)), all 25 statements: a Playwright suite in Chromium, Firefox and WebKit (axe in every state, AAA contrast in dark) and unit tests.
- Themes: dark (default), light, high contrast; OpenDyslexic and monospace fonts; size, line length and spacing.
