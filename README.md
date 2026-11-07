# Frotzlens

![Frotzlens — see inside a Z-machine story file](./apps/web/public/og-image.png)

[![License: GPLv3 (apps), MIT (libraries)](https://img.shields.io/badge/License-GPLv3%20%2B%20MIT-blue.svg)](./LICENSING.md)
[![CI](https://github.com/cschweda/frotzlens/actions/workflows/ci.yml/badge.svg)](https://github.com/cschweda/frotzlens/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6.svg)](https://www.typescriptlang.org)
[![Z-machine](https://img.shields.io/badge/Z--machine-v3%20%C2%B7%20v4%20%C2%B7%20v5%20%C2%B7%20v8-f59e0b.svg)](https://inform-fiction.org/zmachine/standards/)
[![Status](https://img.shields.io/badge/status-phase%205-orange.svg)](./docs/00-master-design.md)

A browser-based disassembler and inspector for Z-machine story files. Drop a `.z3`, `.z4`, `.z5`, `.z8` or `.zblorb` into a tab and see what's inside: the header, the memory map, the object tree, the dictionary and grammar, every routine as cross-referenced disassembly, and every string. Everything runs in your browser; nothing is uploaded.

It's the browser-native successor to Ztools' `txd` and `infodump`, with an Inform 6 focus, and the companion to [Frotzsmith](https://frotzsmith.com), the browser IDE for Inform 6 and ZIL. Both are part of [Frotz, Inc.](https://frotzinc.com), home of the Frotz family of interactive-fiction tools.

## Status

| Phase | | |
|---|---|---|
| 0 | Shared libraries extracted from Frotzsmith | **Done.** `@frotzinc/worker-rpc`, `nuxt-base` and `inform6-wasm` 0.1.0 on npm; Frotzsmith uses them. |
| 1 | Core parser and CLI | **Done.** Header, memory map, text, dictionary, objects and globals for v3, v4, v5 and v8, matching `infodump` byte for byte. |
| 2 | Disassembler: routines, strings, grammar, cross-references | **Done.** Every routine and string, Inform grammar (versions 1, 2 and 3), and cross-references. The disassembly matches `txd`, and `-f` matches `infodump -f`, byte for byte on every Standard Library and library-free story. The exceptions are PunyInform's grammar, which Ztools misreads, and `minimal`'s map ([details](docs/03-phase-2-disassembler.md#5-deliberate-differences-from-ztools)). |
| 3 | Web app shell and Overview dashboard | **Done.** Drop a story file (or try the sample) and see the Overview: stats, a to-scale memory map, the story facts. Parsing runs in a Web Worker; every view is a hash route; ⌘K jumps to any routine, object, string or dictionary word. Live at [frotzlens.frotzinc.com](https://frotzlens.frotzinc.com) ([details](docs/04-phase-3-web-shell.md)). |
| 4 | Data views | **Done.** Memory (map and hex), Objects (a keyboard-operable tree), Dictionary, Grammar, Routines (linked disassembly) and Strings, each linked to the rest and each with "Copy as text" in Ztools' format. A Playwright smoke test opens a real story, visits every view and runs axe on each; it runs in CI. Live at [frotzlens.frotzinc.com](https://frotzlens.frotzinc.com) ([details](docs/05-phase-4-data-views.md)). |
| 5 | Debug symbols, Inform fingerprinting, Blorb, polish; Frotzlens 0.1.0 | **Built; ready to release.** Blorb files open, and a `gameinfo.dbg` names routines, globals, locals, properties, attributes and actions everywhere (with a Names switch). The Overview says what made the story. New views: Globals, Abbreviations, Symbols and Map. `@frotzinc/zcode` and `frotzlens` 0.1.0 are ready for `publish.sh` ([details](docs/06-phase-5-symbols.md)). |

The plan and its decisions are in [`docs/`](docs/), starting with [`00-master-design.md`](docs/00-master-design.md).

## Packages

| Package | License | | npm |
|---|---|---|---|
| [`@frotzinc/zcode`](packages/zcode) | MIT | The parser and disassembler: `Uint8Array` in, typed model out, plus `txd`- and `infodump`-format text, Blorb, debug symbols, fingerprinting and the room graph | not yet (0.1.0 ready) |
| [`frotzlens`](packages/cli) | GPL-3.0-or-later | The CLI: `frotzlens game.z5`; also `--symbols`, `--info`, `--rooms`, `--json` | 0.0.1 placeholder (0.1.0 ready) |
| [`@frotzinc/worker-rpc`](packages/worker-rpc) | MIT | Long-lived Web Worker request/response client | 0.1.0 |
| [`@frotzinc/nuxt-base`](packages/nuxt-base) | MIT | Shared Frotz, Inc. Nuxt layer and Netlify tools | 0.1.0 |
| [`@frotzinc/inform6-wasm`](packages/inform6-wasm) | MIT (wrapper) | Inform 6.44 in WebAssembly, with the Standard Library and PunyInform | 0.1.0 |
| `apps/web` | GPL-3.0-or-later | [frotzlens.frotzinc.com](https://frotzlens.frotzinc.com) | |

Apps are GPL; libraries are MIT. See [`LICENSING.md`](LICENSING.md).

## Try the CLI

```sh
pnpm install && pnpm build
node packages/cli/dist/bin.js samples/dark-cellar.z5                  # the disassembly, as txd prints it
node packages/cli/dist/bin.js --routine 27f8 samples/dark-cellar.z5   # one routine
node packages/cli/dist/bin.js -f samples/dark-cellar.z5               # everything infodump prints
```

[`samples/`](samples/) holds 34 story files to try it on, from a 1.5 KB library-free story to the 135 KB *Mingus I*, as v3, v5 and v8: Frotzsmith's Inform 6 samples plus a minimal Frotzlens fixture, rebuilt with `pnpm samples`.

With no options it prints the disassembly the way `txd` does (`-n` for `txd -n`); with `infodump`'s options (`-i -m -a -o -t -g -d -f -w`) those sections the way `infodump` does, so scripts written for either keep working. `--json` prints the parsed model instead. See [`packages/cli`](packages/cli).

## Development

Node 22 (`.nvmrc`) and pnpm 10 (via corepack: `corepack enable`).

```sh
pnpm install
pnpm build        # build first: packages test against their dependencies' dist/
pnpm typecheck
pnpm test
```

**Test fixtures** are compiled at test time from Inform 6 sources in [`packages/zcode/test/fixtures/src`](packages/zcode/test/fixtures/src) by `@frotzinc/inform6-wasm`, with a fixed serial number so every build is byte-for-byte the same. No story files are checked in.

**Golden files.** `packages/zcode/test/golden` holds `infodump`'s and `txd`'s output for each fixture, and the tests require ours to match it exactly. Ztools has no license, so none of it is in this repository. To regenerate the files, build `infodump` and `txd` yourself outside the repo, then run `cd packages/zcode && scripts/golden.sh /abs/path/to/infodump /abs/path/to/txd` (absolute paths, or paths relative to `packages/zcode`). [`PROVENANCE.md`](packages/zcode/test/golden/PROVENANCE.md) has the exact build command and the archive's checksum.

With `INFODUMP=/path/to/infodump TXD=/path/to/txd pnpm test`, the tests also compare every hand-observed header case, and every story in `samples/`, against the real tools.

CI (`.github/workflows/ci.yml`) runs install, build, typecheck and test on every push to `main`, every pull request and every release tag.

## Releasing a package

Each `@frotzinc/*` package, and the `frotzlens` CLI, is released on its own, from your machine, with [`publish.sh`](publish.sh):

1. Bump `packages/<name>/package.json`'s version and add its `## [x.y.z]` section to `packages/<name>/CHANGELOG.md`.
2. Merge to `main`, then tag and push the tag: `git tag @frotzinc/<name>@x.y.z && git push origin @frotzinc/<name>@x.y.z` (the CLI's tag is `frotzlens@x.y.z`). The `ci` workflow runs on it.
3. `./publish.sh <name> --dry-run`, then `./publish.sh <name>` in a terminal. `<name>` is `zcode`, `cli`, and so on. Publish `zcode` before the `cli` that depends on it. It builds and tests the tag in a temporary worktree, checks the packed files, installs the tarball and runs `scripts/smoke/<name>.mjs` against it, asks you to type the version, and then npm asks for your approval.

The script never commits, tags or pushes.

From [Frotz, Inc.](https://frotzinc.com) — Frotz, Inc. is a fiction. The Frotz interpreter is the work of its own authors and is not affiliated.
