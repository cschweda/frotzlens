# Licensing

**Apps are GPL-3.0-or-later. Libraries are MIT.** The web app (`apps/web`) and the CLI (`packages/cli`, the `frotzlens` npm package) are covered by the GPL in [`LICENSE`](LICENSE); every `@frotzinc/*` package is MIT and carries its own `LICENSE`.

Dependencies point one way, apps → libraries, and no library bundles GPL code. Third-party texts keep their own licenses: the Inform 6 compiler and Standard Library (Artistic 2.0) and PunyInform (MIT), each with its license file in `packages/inform6-wasm`.

The family shell (the header, footer, About menu and its dialogs, and the report and changelog helpers they use) was written for Frotzlens by its author and moved into `@frotzinc/nuxt-base` in 2026-11, so every Frotz, Inc. app can share it. Its author relicensed it MIT for that move; it carries `nuxt-base`'s `LICENSE`.

`packages/zmachine-oracle` is the exception that proves the rule: a **private, GPL-3.0-or-later, test-only** package, never published or bundled, that vendors Frotzsmith's headless ZVM replay as the oracle for `@frotzinc/zmachine`'s differential tests. `@frotzinc/zmachine` (MIT) uses it only as a dev dependency of its tests; nothing from it reaches an MIT package's `dist`. ZVM (`ifvms`) and GlkOte (`glkote-term`) themselves are MIT.
