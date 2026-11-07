# @frotzinc/inform6-wasm

The [Inform 6](https://github.com/DavidKinder/Inform6) compiler (v6.44) built to WebAssembly, bundled with the libraries it needs: the Inform Standard Library 6.12.8 and PunyInform. Compile Inform 6 source to a Z-machine or Glulx story file in a browser, a Web Worker, or Node, with no server.

```ts
import { compile } from '@frotzinc/inform6-wasm'

const r = await compile(source, { version: 'z5', library: 'std', debug: true })
if (r.ok) {
  r.story // Uint8Array — the .z5
  r.dbg   // gameinfo.dbg XML (because debug: true)
} else {
  r.diagnostics // [{ severity: 'error', line: 12, message: '…' }]
}
```

## Options

| Option | Default | |
|---|---|---|
| `version` | `'z5'` | `'z3' \| 'z4' \| 'z5' \| 'z8' \| 'ulx'` (`ulx` is Glulx, `-G`) |
| `library` | `'std'` | `'std'` (Standard Library) or `'puny'` (PunyInform) |
| `debug` | `false` | Pass `-k` and return `gameinfo.dbg` as `dbg` |
| `extensions` | `[]` | Extra `{ name, content }` files, mounted so `Include "name";` resolves. One named like a library file replaces it only with `overridesLibrary: true`. |
| `locateFile` | — | Where to fetch `inform6.wasm`. Bundlers emit it under a hashed name; pass that URL. Node needs nothing. |
| `instantiate` | — | Supply the compiler instance yourself: a bundler seam, or a test double. Must return a fresh instance per call. `@frotzinc/inform6-wasm/inform6.mjs` is the Emscripten factory. |

The result is `{ ok, story?, dbg?, version, diagnostics, rawOutput, stats, ms }`. `compile` never rejects for an ordinary compile error; those come back as `ok: false`. Each call gets a fresh compiler instance, because the compiler holds global state.

## In a bundler (Vite / Nuxt)

```ts
import wasmUrl from '@frotzinc/inform6-wasm/inform6.wasm?url'

await compile(source, { locateFile: p => (p.endsWith('.wasm') ? wasmUrl : p) })
```

`compile` statically carries ~900 KB of library text. Load it in a Web Worker, or with a dynamic `import()`, so it stays off your page's critical path. `@frotzinc/inform6-wasm/library` exports the library files themselves (`LIBRARY_FILES`), for showing them to authors.

## Licenses

- This wrapper: **MIT**.
- The Inform 6 compiler (`wasm/`): **Artistic License 2.0**, © Graham Nelson and contributors. See `wasm/LICENSE-inform6` and `wasm/README.md` for the exact build.
- The Inform Standard Library (`lib/std/`): **Artistic License 2.0**. See `lib/std/LICENSE-inform6lib`.
- PunyInform (`lib/puny/`): **MIT**, © Fredrik Ramsberg and Johan Berntsson. See `lib/puny/LICENSE-punyinform`.
- `lib/std/exits.h`, a helper that lists a room's exits after its description: **MIT**, part of this wrapper.

Extracted from [frotzsmith](https://frotzsmith.com). From [frotz, inc.](https://frotzinc.com).
