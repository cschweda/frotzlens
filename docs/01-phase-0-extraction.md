# frotzlens — Phase 0: Extract the Shared Libraries

**Document 01 · Phase 0**
**Deliverable:** `@frotzinc/worker-rpc`, `@frotzinc/nuxt-base`, and `@frotzinc/inform6-wasm` published at `0.1.0`; frotzsmith imports them on its `frotzinc-packages` branch and builds and tests green.

> **Exit criteria:** each package's tests pass under `pnpm -r test`; frotzsmith, pointed at `npm pack` tarballs through `file:` paths, passes `yarn test` (baseline 2026-11-06: 1641 passed, 99 skipped), `yarn typecheck` and `yarn generate` with no visual change; then the same against the published `0.1.0`, as one commit, diff reviewed before push.

---

## 1. Rules for this phase

- **Behavior-preserving.** frotzsmith looks and works exactly as before. The new palette tokens ship as an opt-in stylesheet that frotzsmith does not load in this phase.
- **MIT side never imports GPL side.** No package file may import from `~/`, `~~/`, or any frotzsmith path. Checked by a test in each package that greps its `src/` for those specifiers.
- **frotzsmith stays on Yarn 1.** Its `main` is never touched.
- **Relicensed to MIT** (Chris's own code, approved 2026-11-06): `parse-diagnostics.ts`, `Exits.h`, and every file moved below.

## 2. `@frotzinc/worker-rpc`

| From frotzsmith | To | Change |
|---|---|---|
| `app/composables/worker-rpc.ts` | `src/index.ts` | `createWorkerRpc` + `WorkerOutcome`, `ParsedReply`, `WorkerRpcOptions`, `CallOptions`. `timedOutResult` **stays in frotzsmith** (it builds a frotzsmith `CompileResult`). |
| `app/composables/worker-rpc.test.ts` | `src/index.test.ts` | Import paths only. |
| `test/mock-worker.ts` | `src/testing.ts`, exported as `@frotzinc/worker-rpc/testing` | frotzsmith's `useZilfWasm`/`useI6Wasm` tests import it from there. `vitest` is an optional peer. |

## 3. `@frotzinc/nuxt-base` — a Nuxt layer

Consumed with `extends: ['@frotzinc/nuxt-base']`. Shipped as source (Nuxt transpiles layers). `nuxt`, `@nuxt/ui`, `vue` are peerDependencies.

| From frotzsmith | To | Change |
|---|---|---|
| `app/assets/css/main.css` | `app/assets/css/base.css` (layer `css`) | Tailwind + Nuxt UI imports, `--frotz-amber`, `.frotz-glow`, `.frotz-grid`, reduced-motion block. `.cm-editor` stays in frotzsmith's own `main.css`. |
| — | `app/assets/css/palette.css` (opt-in) | The `ground`/`ink`/`ink-2`/`panel`/`rule`/`lamp`/`lamp-text` tokens for dark and light, with `--frotz-amber` an alias of `lamp`. frotzlens loads it; frotzsmith may adopt it later. |
| `app/app.config.ts` | `app/app.config.ts` | Nuxt UI color roles (primary amber, …). |
| `nuxt.config.ts` (parts) | `nuxt.config.ts` | `ssr: false`, `colorMode.preference: 'dark'`, the `build:manifest` hook (worker chunks never preloaded; manifest dumped for `inject-preloads`). PWA is **not** in the layer (opt-in stays in the app). |
| `app/utils/safe-storage.ts`, `slug.ts` (+tests) | `app/utils/` | Unchanged. Auto-imported through the layer, exactly as before. |
| `app/utils/shortcut.ts` (+test) | `app/utils/shortcut.ts` | Generalized: `isApplePlatform()`, `modShortcutLabel(key)`, `isModShortcut(e, key)`. frotzsmith keeps `compileShortcutLabel` / `isCompileShortcut` as one-line wrappers. |
| `tools/inject-preloads.mjs` (+test) | `netlify/inject-preloads.mjs` | `runInjectPreloads({ routes })`; the route table becomes a parameter. |
| `tools/check-sw.mjs` (+test) | `netlify/check-sw.mjs` | `runCheckSw(config)`; REQUIRED, FORBIDDEN, ignored params, and the "no worker" / "kill switch" modes become config. |
| `tools/version.mjs` (+test) | `netlify/version.mjs` | `packageVersion(pkgJsonUrl)`, `buildCommit(cwd)`. |
| `tools/redirects.test.ts` | `netlify/redirects.mjs` | Only helpers: `parseRedirects(text)`, `scriptProxies(rules)`, `externalRules(rules)`. Every assertion in the original is about Plausible, so frotzsmith keeps its test, rewritten on the helpers. |

frotzsmith's `tools/*.mjs` become small runners that pass frotzsmith's config, so `package.json` scripts, `tools/output-dir.test.ts`, and `smoke-replay-worker.mjs` are unchanged.

**Left behind:** `vendored-files.json` + test, `supply-chain.test.ts`, `netlify-headers.test.ts`, `nuxt-config.test.ts`, `play-page.test.ts`, the ifvms fixes, `smoke-replay-worker.mjs`, PWA config, Plausible.

## 4. `@frotzinc/inform6-wasm`

| From frotzsmith | To | Change |
|---|---|---|
| `app/modules/inform6/wasm/{inform6.mjs,inform6.wasm,README.md}` | `wasm/` | Unchanged. `inform6.wasm` exported as `@frotzinc/inform6-wasm/inform6.wasm` for bundlers (`?url`). |
| `app/modules/inform6/lib/std/*`, `lib/puny/*` | `lib/std`, `lib/puny` | Std Lib 6.12.8 (Artistic 2.0) and PunyInform (MIT) with their license files; `exits.h` (frotzsmith helper, now MIT). |
| `profile-files.ts` | `src/library.ts` → `@frotzinc/inform6-wasm/library` | `LIBRARY_FILES: Record<'std' \| 'puny', VirtualFile[]>`, same case aliases. `import.meta.glob` (Vite-only) replaced by `src/lib-texts.generated.ts`, written by `scripts/gen-lib-texts.mjs` before build and test (not committed). |
| `compile-main.ts` + `useCompilerWasm.ts` | `src/compile.ts` | `compile(source, opts)` below. Lazy factory, fresh instance per compile, same mount order (extensions, library, overrides), same `-s -Cu` switches. |
| `app/utils/parse-diagnostics.ts` (+test) | `src/diagnostics.ts` | Unchanged logic; now MIT. |
| `compile-main.test.ts` | `src/compile.test.ts` | Mount-order tests, against a mocked module factory. |

```ts
compile(source: string, opts?: {
  version?: 'z3' | 'z4' | 'z5' | 'z8' | 'ulx'   // default 'z5'; ulx → -G
  library?: 'std' | 'puny'                       // default 'std'
  debug?: boolean                                // -k, returns gameinfo.dbg
  extensions?: { name: string; content: string; overridesLibrary?: true }[]
  locateFile?: (path: string) => string          // bundlers: point at the emitted .wasm
}): Promise<{
  ok: boolean; story?: Uint8Array; dbg?: string; version: …;
  diagnostics: Diagnostic[]; rawOutput: string; stats: CompileStats; ms: number
}>
```

In frotzsmith, `compile-main.ts` becomes a ~15-line adapter from `CompileOpts` to `compile()` and back to its `CompileResult`; `profile-files.ts` re-exports `LIBRARY_FILES`; `useCompilerWasm.ts` is deleted. Its golden tests (`compiler`, `architect-legacy`, `mingus-*`, `sample-walkthroughs`) are the regression net: they must pass unchanged.

## 5. Order of work

1. Scaffold the pnpm workspace; create the three packages with tests green.
2. `npm pack` each; point frotzsmith at the tarballs with `file:`; get `yarn test`, `yarn typecheck`, `yarn generate` green and compare the generated site for visual changes. Nothing committed in frotzsmith.
3. `npm publish --access public` × 3 (Chris enters 2FA).
4. Pin frotzsmith to `0.1.0`; one commit on `frotzinc-packages`; show the full diff; push and open the PR only after approval.
