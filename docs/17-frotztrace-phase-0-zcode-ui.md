# frotztrace — Phase 0: The Story Views into `@frotzinc/zcode-ui`

**Document 17 · frotztrace Phase 0** (frotztrace's design: [`frotztrace-design.md`](frotztrace-design.md))
**Deliverable:** frotzlens's story views move into a new Nuxt layer, `@frotzinc/zcode-ui`, so frotztrace can show a running story with the same components; frotzlens is unchanged. `zcode-ui` 0.1.0 and the `frotztrace` npm placeholder are published.

> **Exit criteria:** frotzlens's Playwright + axe suite passes unchanged; `zcode-ui`'s boundary test and every typecheck pass (frotzlens's `nuxt typecheck` covers the layer's files); `nuxt generate` builds; the packed tarball passes `scripts/smoke/zcode-ui.mjs`. Checked on the pull request's Deploy Preview, merged only when Chris says so.

---

## 1. Rules for this phase

- **Behavior-preserving.** frotzlens looks and works exactly as before: the same markup, ids and classes, so its e2e tests are untouched.
- **One look for the family.** The layer adds no colors, fonts or CSS. Those, and the shell (header, footer, About menu), are `@frotzinc/nuxt-base`'s, which frotzsmith, frotzlens, frotzplay and frotztrace all extend. frotztrace is to look exactly like frotzsmith and frotzlens, dark by default (Chris, 2026-11-08); anything visual it needs that isn't in `nuxt-base` or `zcode-ui` goes into one of them, never into `apps/trace` alone. The smoke test fails if the package ever ships CSS.
- **The layer never imports from an app** (`boundary.test.ts`, as in `nuxt-base`, plus `apps/`).
- **Relicensed to MIT** (Chris's own code): every file below. Noted in `LICENSING.md`.

## 2. How it's packaged (decided)

A **Nuxt layer**, like `nuxt-base`, shipping source: `extends: ['@frotzinc/nuxt-base', '@frotzinc/zcode-ui']`. The components use Nuxt's auto-imports and Nuxt UI (`UModal`, `UCommandPalette`, `UInput`, `UButton`), so as a layer they move unchanged. A built Vue library (like `@frotzinc/player`) would need every auto-import made explicit and would only matter for a non-Nuxt app; every frotz, Inc. app is Nuxt. Runtime dependency: `@frotzinc/zcode` (exact version on publish, as `zmachine` has it). Peers: `nuxt`, `@nuxt/ui`, `vue`.

## 3. What moves

| From `apps/web/app` | To `packages/zcode-ui/app` | Change |
|---|---|---|
| `components/ObjectTree.vue`, `GlobalsView.vue`, `MapView.vue` | `components/` | Gain the optional `live` prop (§4). |
| `components/SearchPalette.vue`, `RefLink.vue`, `Referrers.vue`, `ViewHeader.vue`, `CopyText.vue`, `StatTile.vue`, `NotFound.vue` | `components/` | None. |
| `components/AppNav.vue` | `components/` | Takes `views: NavView[]` and `active` instead of building frotzlens's list. frotzlens's list is now `LensNav.vue`. |
| the hex pane in `components/MemoryView.vue` | `components/HexPane.vue` (new) | `v-model:top`, `notes(from, to)`, `inRange(address)`, `live`. `MemoryView` keeps the memory map and the parts, and uses it. |
| the disassembly in `components/RoutinesView.vue` | `components/Disassembly.vue` (new) | `view` (zcode's `RoutineView`), `address`, `live`. `RoutinesView` keeps the list and the routine page, and uses it. |
| `composables/useHashRoute.ts`, `useSymbols.ts` | `composables/` | None. |
| `utils/story.ts`, `utils/map-layout.ts` | `utils/` | None. |
| — | `utils/live.ts`, `utils/nav.ts` (new) | The `MachineView` and `NavView` types. |

**Stays in frotzlens:** `useStory` and the parse and decompile workers, `useSource`, `decompiler.ts`; the views no other app shows (Overview, Objects, Dictionary, Grammar, Strings, Abbreviations, Symbols, Source, Play) and frotzlens's own `MemoryView` (with `MemoryMap`) and `RoutinesView`; `DropZone`, `StoryFacts`, `HeaderActions`; and `LensNav.vue`, frotzlens's list of views.

## 4. The `live` prop

`ObjectTree`, `GlobalsView`, `MapView`, `Disassembly` and `HexPane` take `live?: MachineView`:

```ts
interface MachineView {
  pc?: number                 // the next instruction
  frame?: number              // the frame being looked at
  changed?: { addresses: ReadonlySet<number>; objects: ReadonlySet<number>; globals: ReadonlySet<number> }
}
```

In Phase 0 it is a placeholder in `zcode-ui` and is accepted and ignored: a view renders the same with or without it. In Phase 3, `@frotzinc/zmachine` exports the real `MachineView` and `utils/live.ts` re-exports it; in Phase 4 the views light what changed, with a machine behind them to test against.

## 5. A trap found on the way

Nuxt Icon bundles only the icons it finds in `**/*.{vue,jsx,tsx,md,mdc,mdx,yml,yaml}`, so an icon name written in a `.ts` file isn't bundled and is fetched from api.iconify.design at run time, which frotzlens's CSP (rightly) blocks. Moving the nav's list into a composable did exactly that, and the e2e suite caught it. So the app's list of views is a `.vue` file (`LensNav.vue`), and frotztrace's will be too. Icons named in the layer's own `.vue` files are found (checked: `HexPane`'s `chevrons-up` is in the bundle).

## 6. Publishing

`publish.sh` knows `zcode-ui`: its required files, its one dependency (`@frotzinc/zcode`), and `scripts/smoke/zcode-ui.mjs`, which installs the packed tarball, checks the layer's files, checks it ships no CSS and no import from an app, and loads `@frotzinc/zcode`. After the merge: tag `@frotzinc/zcode-ui@0.1.0`, `./publish.sh zcode-ui --dry-run`, then `./publish.sh zcode-ui`.

The `frotztrace` placeholder (GPL-3.0-or-later, unscoped, no `infocom` keyword) is published from a scratch directory, not the repo, as `frotzlens`'s and `frotzplay`'s were.
