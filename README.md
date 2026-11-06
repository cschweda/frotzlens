# Frotzlens

A browser-based disassembler and inspector for Z-machine story files. Drop a `.z3`, `.z4`, `.z5`, `.z8` or `.zblorb` into a tab and see what's inside: the header, the memory map, the object tree, the dictionary and grammar, every routine as cross-referenced disassembly, and every string. Everything runs in your browser; nothing is uploaded.

It's the browser-native successor to Ztools' `txd` and `infodump`, with an Inform 6 focus, and the companion to [Frotzsmith](https://frotzsmith.com), the browser IDE for Inform 6 and ZIL.

## Status

| Phase | | |
|---|---|---|
| 0 | Shared libraries extracted from Frotzsmith | **Done.** `@frotzinc/worker-rpc`, `nuxt-base` and `inform6-wasm` 0.1.0 on npm; Frotzsmith uses them. |
| 1 | Core parser and CLI | **Done.** Header, memory map, text, dictionary, objects and globals for v3, v4, v5 and v8. The CLI's output matches `infodump` byte for byte on every fixture. |
| 2 | Disassembler: routines, strings, grammar, cross-references | Next |
| 3 | Web app shell and Overview dashboard | |
| 4 | Data views | |
| 5 | Debug symbols, Inform fingerprinting, Blorb, polish; frotzlens.com 0.1.0 | |

The plan and its decisions are in [`docs/`](docs/), starting with [`00-master-design.md`](docs/00-master-design.md).

## Packages

| Package | License | | npm |
|---|---|---|---|
| [`@frotzinc/zcode`](packages/zcode) | MIT | The parser: `Uint8Array` in, typed model out, plus infodump-format text | not yet (Phase 5) |
| [`frotzlens`](packages/cli) | GPL-3.0-or-later | The CLI: `frotzlens --objects game.z5` | 0.0.1 placeholder; the CLI ships in Phase 5 |
| [`@frotzinc/worker-rpc`](packages/worker-rpc) | MIT | Long-lived Web Worker request/response client | 0.1.0 |
| [`@frotzinc/nuxt-base`](packages/nuxt-base) | MIT | Shared Frotz, Inc. Nuxt layer and Netlify tools | 0.1.0 |
| [`@frotzinc/inform6-wasm`](packages/inform6-wasm) | MIT (wrapper) | Inform 6.44 in WebAssembly, with the Standard Library and PunyInform | 0.1.0 |
| `apps/web` | GPL-3.0-or-later | frotzlens.com (Phase 3) | |

Apps are GPL; libraries are MIT. See [`LICENSING.md`](LICENSING.md).

## Try the CLI

```sh
pnpm install && pnpm build
node packages/cli/dist/bin.js --objects samples/dark-cellar.z5
```

[`samples/`](samples/) holds 34 story files to try it on, from a 1.5 KB library-free story to the 135 KB *Mingus I*, as v3, v5 and v8: Frotzsmith's Inform 6 samples, rebuilt with `pnpm samples`.

It takes `infodump`'s options for the sections it prints (`-i -a -o -t -d`, plus `-w`), with the same output, so scripts that use those keep working. `infodump`'s memory map (`-m`) and grammar (`-g`) aren't there yet, and `-f` prints only the five sections. `--json` prints the parsed model instead. See [`packages/cli`](packages/cli).

## Development

Node 22 (`.nvmrc`) and pnpm 10 (via corepack: `corepack enable`).

```sh
pnpm install
pnpm build        # build first: packages test against their dependencies' dist/
pnpm typecheck
pnpm test
```

**Test fixtures** are compiled at test time from Inform 6 sources in [`packages/zcode/test/fixtures/src`](packages/zcode/test/fixtures/src) by `@frotzinc/inform6-wasm`, with a fixed serial number so every build is byte-for-byte the same. No story files are checked in.

**Golden files.** `packages/zcode/test/golden` holds `infodump`'s output for each fixture, and the tests require ours to match it exactly. Ztools has no license, so none of it is in this repository. To regenerate the files, build `infodump` yourself outside the repo and run `packages/zcode/scripts/golden.sh <path-to-infodump>`. [`PROVENANCE.md`](packages/zcode/test/golden/PROVENANCE.md) has the exact build command and the archive's checksum.

With `INFODUMP=/path/to/infodump pnpm test`, the tests also compare every hand-observed header case, and every story in `samples/`, against the real `infodump`.

CI (`.github/workflows/ci.yml`) runs install, build, typecheck and test on every push to `main`, every pull request and every release tag.

## Releasing a library

Each `@frotzinc/*` package is released on its own, from your machine, with [`publish.sh`](publish.sh):

1. Bump `packages/<name>/package.json`'s version and add its `## [x.y.z]` section to `packages/<name>/CHANGELOG.md`.
2. Merge to `main`, then tag and push the tag: `git tag @frotzinc/<name>@x.y.z && git push origin @frotzinc/<name>@x.y.z`. The `ci` workflow runs on it.
3. `./publish.sh <name> --dry-run`, then `./publish.sh <name>` in a terminal. It builds and tests the tag in a temporary worktree, checks the packed files, installs the tarball and runs `scripts/smoke/<name>.mjs` against it, asks you to type the version, and then npm asks for your approval.

The script never commits, tags or pushes.

From Frotz, Inc. — Frotz, Inc. is a fiction. The Frotz interpreter is the work of its own authors and is not affiliated.
