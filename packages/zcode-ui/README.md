# @frotzinc/zcode-ui

The Z-machine story views of [frotzlens](https://frotzlens.frotzinc.com), as a Nuxt layer, so that frotzlens (a story file at rest) and frotztrace (a story running under a debugger) show a story with the same components, the same links and the same look. Part of [frotz, Inc.](https://frotzinc.com)

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  extends: ['@frotzinc/nuxt-base', '@frotzinc/zcode-ui'],
  modules: ['@nuxt/ui'],
})
```

Everything below is auto-imported. The story is a `StoryFile` from [`@frotzinc/zcode`](https://www.npmjs.com/package/@frotzinc/zcode).

| | |
|---|---|
| **Views** | `ObjectTree` (an ARIA tree), `GlobalsView`, `MapView`, `Disassembly` (one routine, txd's layout, every operand a link), `HexPane` (paged hex with "Go to address"), `SearchPalette` (⌘K / Ctrl+K), `AppNav` (takes the app's own list of views) |
| **Parts** | `RefLink`, `Referrers`, `ViewHeader`, `CopyText`, `StatTile`, `NotFound` |
| **Composables** | `useHashRoute` (the view is the URL hash: `#routine/27f8`), `useSymbols` (names from Inform's `gameinfo.dbg`; `activeSymbols`) |
| **Utils** | `hex`, `idRoute`, `idLabel`, `routineName`, `objectName`, `globalName`, `attributeName`, `propertyName`, `actionName`, `useLimit`, `storyIndex`, `layoutMap`; the types `MachineView` and `NavView` (also importable as `@frotzinc/zcode-ui/utils/live` and `/utils/nav`) |

**The look is not here.** Colors, fonts and the family shell (header, footer, About menu) are [`@frotzinc/nuxt-base`](https://www.npmjs.com/package/@frotzinc/nuxt-base)'s, and this layer adds none, so frotzsmith, frotzlens, frotzplay and frotztrace look like one product, dark by default.

**`live`.** `ObjectTree`, `GlobalsView`, `MapView`, `Disassembly` and `HexPane` take an optional `live` prop, a `MachineView` (the program counter, the frame, what changed since the last stop). In 0.1 it is accepted and ignored: without it, and with it, a view renders exactly as frotzlens has always shown it. frotztrace's later releases light what changed.

Peer dependencies: `nuxt` ^4.6, `@nuxt/ui` ^4.12, `vue` ^3.5.

MIT © Christopher Schweda. Extracted from frotzlens (GPL-3.0-or-later), whose author relicensed these files MIT for the move.
