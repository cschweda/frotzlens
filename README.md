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

From Frotz, Inc. — Frotz, Inc. is a fiction. The Frotz interpreter is the work of its own authors and is not affiliated.
