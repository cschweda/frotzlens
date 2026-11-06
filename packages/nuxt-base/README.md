# @frotzinc/nuxt-base

The shared Nuxt layer for Frotz, Inc. apps ([Frotzsmith](https://frotzsmith.com), [Frotzlens](https://frotzlens.com)).

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  extends: ['@frotzinc/nuxt-base'],
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
})
```

```css
/* app/assets/css/main.css — one Tailwind entry, the house CSS after it */
@import "tailwindcss";
@import "@nuxt/ui";
@import "@frotzinc/nuxt-base/css/base.css";
@import "@frotzinc/nuxt-base/css/palette.css"; /* optional */
```

## What the layer gives you

- **Config:** `ssr: false` (pure client-side, static), color mode defaulting to dark, and a `build:manifest` hook. The hook stops Web Worker chunks being modulepreloaded and writes `.nuxt/client-manifest.json` for `inject-preloads`.
- **Nuxt UI color roles** (`app.config.ts`): primary amber, secondary orange, success green, info sky, warning yellow, error red, neutral slate.
- **Auto-imported utils** (also importable as `@frotzinc/nuxt-base/utils/<name>`):
  - `safe-storage`: `safeGetItem`, `safeSetItem` and `safeRemoveItem`, which never throw when storage is denied or full.
  - `slug`: `slugify` and `storyBaseName`.
  - `shortcut`: `isApplePlatform`, `modShortcutLabel(key)` (`⌘K` or `Ctrl+K`) and `isModShortcut(event, key)`.
- **CSS:**
  - `css/base.css` has `--frotz-amber`, `.frotz-glow`, `.frotz-grid` and the `prefers-reduced-motion` block.
  - `css/palette.css` is opt-in. It holds the `--frotz-ground`, `ink`, `ink-2`, `panel`, `rule`, `lamp` and `lamp-text` tokens for dark and light, and maps them onto Nuxt UI's surface and text variables.

The layer does **not** add `@nuxt/ui` (list it in your own `modules`), any CSS (import it yourself, as shown above, so Tailwind has one entry), or a PWA.

## Netlify / post-build tools

Plain Node ES modules, run from your own `postgenerate` scripts:

| Module | Gives |
|---|---|
| `netlify/inject-preloads` | `runInjectPreloads({ routes })` adds `<link rel="modulepreload">` hints for each route's chunk chain. It also exports `collectChunks`, `injectPreloads`, `resolveOutDir` and `workerPreloads`. |
| `netlify/check-sw` | `runCheckSw(config, mode)` checks a generated `sw.js` against your required and forbidden precache entries, ignored query params and runtime-cache routes. It also checks a no-worker build and a self-destroying kill-switch worker. |
| `netlify/version` | `packageVersion(pkgJson)` and `buildCommit(cwd)` give the version and the commit's short hash and date, for an About panel. |
| `netlify/redirects` | `parseRedirects`, `readRedirects`, `scriptProxies` and `externalRules`, for writing tests against a `_redirects` file. |

`nuxt`, `@nuxt/ui` and `vue` are peer dependencies. MIT. From Frotz, Inc.
