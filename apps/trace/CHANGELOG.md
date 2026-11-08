# Changelog

All notable changes to frotztrace, the site at [frotztrace.frotzinc.com](https://frotztrace.frotzinc.com). Versions follow [Semantic Versioning](https://semver.org/). Part of [frotz, Inc.](https://frotzinc.com).

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
