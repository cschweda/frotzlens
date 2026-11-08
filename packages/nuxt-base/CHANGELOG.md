# Changelog

All notable changes to `@frotzinc/nuxt-base`. Versions follow [Semantic Versioning](https://semver.org/). Part of [frotz, Inc.](https://frotzinc.com).

## [0.3.3] - 2026-11-08

### Changed
- The report dialog's **Send** is now **Send email**, and **Send another** is **Send another email**, so it's clear the report goes by email (and **Open on GitHub** is the other way).

## [0.3.2] - 2026-11-08

### Fixed
- The About dialog opened with frotzlens's own sentence ("…: disassemble it, explore it and play it…") in every app. It now says `product.summary`, each app's own, or the tagline when there's none.

## [0.3.1] - 2026-11-08

### Changed
- **A sent report says it went.** After **Send**, the report dialog replaces the form with a confirmation: a check mark, **Sent**, where it went, and whether a reply will come. It takes the focus (and is a status region), so a screen reader announces it. A "Report sent" (or "Idea sent") toast stays after the dialog closes. **Send another** brings back an empty form; **Close** closes it.
- A send that fails shows an alert, apart from the copy notices, saying nothing was sent and that GitHub is the way.

## [0.3.0] - 2026-11-08

So frotzsmith can wear the family header and About menu too.

### Added
- **`useAbout().setUpdateCheck(fn)`.** An app with its own update check (frotzsmith's goes through its service worker, and its desktop build has no web manifest to ask) hands it to the About menu, whose "Check for updates" then calls it. Unset, the menu asks the site's Nuxt build manifest, as before.
- **Reports by email, through Resend.** With `reportEndpoint` in `product`, Report a problem and Suggest a feature can **Send** what the person wrote, with an optional reply address, as well as open it on GitHub. The sending is a Netlify Function, `netlify/report.mjs` (`createReportHandler({ app })`), configured by the site's `RESEND_API_KEY`, `REPORT_TO` and `REPORT_FROM`; the key never reaches the browser. It always sends to `REPORT_TO`, never to an address from the form, and refuses a filled honeypot, a form filled in under three seconds, oversized fields and more than five reports a minute from one address. Unconfigured, it answers 503 and the dialog points to GitHub.
- **`<AppHeader wide>`.** Full width, wrapping onto a second row when the actions don't fit, for a header that is a toolbar (frotzsmith's IDE). Without it, nothing changes.

## [0.2.1] - 2026-11-07

### Changed
- The family's names are lower case everywhere: frotzlens, frotzsmith, frotzplay, and frotz, Inc. (the README, comments and any text shown).
- The footer and About dialog say frotz, Inc.

## [0.2.0] - 2026-11-07

The family shell, shared by frotzlens and frotzplay.

### Added
- **The family shell**, moved from frotzlens (and relicensed MIT by its author) so every frotz, Inc. app shares one header, footer and About menu:
  - Components: `AppHeader` (with `#context` and `#actions` slots for the app's own parts), `AppFooter`, `AboutMenu`, `AboutDialogs` (takes the app's `changelog` as a prop).
  - Composables: `useAbout` (`technicalDetails()`), `useProduct`.
  - Utils: `report` (the GitHub issue-form links, now taking the repository URL), `markdown` (`markdownToHtml`, for the changelog), `product` (the `Product` type, `securityUrl`).
- **Palette:** `--frotz-ink-muted`, quieter text that still meets 7:1 in dark (8.32:1) and light (8.41:1), and a `.high-contrast` theme (white on black, every text token at 7:1 or better).
- **`product` in app config.** Each app says who it is (name, tagline, home link, repository, npm and family links, licences) in its own `app.config.ts`, typed by this layer; the shell reads it with `useProduct()`. The layer still imports nothing from an app.

## [0.1.0] - 2026-11-06

First release, extracted from [frotzsmith](https://frotzsmith.com).

- The Nuxt layer: `ssr: false`, dark-default color mode, Nuxt UI color roles, and the `build:manifest` hook.
- Auto-imported utils: `safe-storage`, `slug`, `shortcut` (`isApplePlatform`, `modShortcutLabel`, `isModShortcut`).
- `css/base.css` and the opt-in `css/palette.css`.
- Netlify tools: `inject-preloads`, `check-sw`, `version`, `redirects`.
