# Frotzlens

A browser-based disassembler and inspector for Z-machine story files. Drop a `.z3`, `.z4`, `.z5`, `.z8`, or `.zblorb` into a tab and see what's inside: header, memory map, object tree, dictionary and grammar, every routine as cross-referenced disassembly, and every string. Everything runs client-side; nothing is uploaded.

**Status:** Phase 0 — extracting the shared Frotz, Inc. libraries. See [`docs/`](docs/).

| Package | License | |
|---|---|---|
| `@frotzinc/zcode` | MIT | Parser, disassembler, symbol loader |
| `@frotzinc/worker-rpc` | MIT | Long-lived Web Worker request/response client |
| `@frotzinc/nuxt-base` | MIT | Shared Frotz, Inc. Nuxt layer and Netlify tools |
| `@frotzinc/inform6-wasm` | MIT (wrapper) | Inform 6.44 in WebAssembly, with the Standard Library and PunyInform |
| `frotzlens` | GPL-3.0-or-later | CLI: `npx frotzlens game.z5` |
| `apps/web` | GPL-3.0-or-later | frotzlens.com |

See [`LICENSING.md`](LICENSING.md).

## Releasing a library

Each `@frotzinc/*` package is released on its own, from your machine, with [`publish.sh`](publish.sh):

1. Bump `packages/<name>/package.json`'s version and add its `## [x.y.z]` section to `packages/<name>/CHANGELOG.md`.
2. Merge to `main`, then tag and push the tag: `git tag @frotzinc/<name>@x.y.z && git push origin @frotzinc/<name>@x.y.z`. The `ci` workflow runs on it.
3. `./publish.sh <name> --dry-run`, then `./publish.sh <name>` in a terminal. It builds and tests the tag in a temporary worktree, checks the packed files, installs the tarball and runs `scripts/smoke/<name>.mjs` against it, asks you to type the version, and then npm asks for your approval.

The script never commits, tags or pushes.

From Frotz, Inc. — Frotz, Inc. is a fiction. The Frotz interpreter is the work of its own authors and is not affiliated.
