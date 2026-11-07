# Changelog

All notable changes to `@frotzinc/nuxt-base`. Versions follow [Semantic Versioning](https://semver.org/). Part of [Frotz, Inc.](https://frotzinc.com).

## [0.2.0] - 2026-11-07

The family shell, shared by Frotzlens and frotzplay.

### Added
- **The family shell**, moved from Frotzlens (and relicensed MIT by its author) so every Frotz, Inc. app shares one header, footer and About menu:
  - Components: `AppHeader` (with `#context` and `#actions` slots for the app's own parts), `AppFooter`, `AboutMenu`, `AboutDialogs` (takes the app's `changelog` as a prop).
  - Composables: `useAbout` (`technicalDetails()`), `useProduct`.
  - Utils: `report` (the GitHub issue-form links, now taking the repository URL), `markdown` (`markdownToHtml`, for the changelog), `product` (the `Product` type, `securityUrl`).
- **Palette:** `--frotz-ink-muted`, quieter text that still meets 7:1 in dark (8.32:1) and light (8.41:1), and a `.high-contrast` theme (white on black, every text token at 7:1 or better).
- **`product` in app config.** Each app says who it is (name, tagline, home link, repository, npm and family links, licences) in its own `app.config.ts`, typed by this layer; the shell reads it with `useProduct()`. The layer still imports nothing from an app.

## [0.1.0] - 2026-11-06

First release, extracted from [Frotzsmith](https://frotzsmith.com).

- The Nuxt layer: `ssr: false`, dark-default color mode, Nuxt UI color roles, and the `build:manifest` hook.
- Auto-imported utils: `safe-storage`, `slug`, `shortcut` (`isApplePlatform`, `modShortcutLabel`, `isModShortcut`).
- `css/base.css` and the opt-in `css/palette.css`.
- Netlify tools: `inject-preloads`, `check-sw`, `version`, `redirects`.
