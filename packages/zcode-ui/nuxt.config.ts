/**
 * @frotzinc/zcode-ui — the Z-machine story views shared by frotzlens and frotztrace, as a Nuxt layer.
 *
 *   export default defineNuxtConfig({ extends: ['@frotzinc/nuxt-base', '@frotzinc/zcode-ui'] })
 *
 * Gives, auto-imported: the views (ObjectTree, GlobalsView, MapView, Disassembly, HexPane,
 * SearchPalette, AppNav) and their parts (RefLink, Referrers, ViewHeader, CopyText, StatTile,
 * NotFound); the composables useHashRoute and useSymbols; and the utils in app/utils (hex,
 * routineName, idLabel, layoutMap, …). It adds no colors, fonts or CSS: the look is
 * @frotzinc/nuxt-base's, so every frotz, Inc. app looks the same. The app lists @nuxt/ui in `modules`.
 */
export default defineNuxtConfig({})
