# @frotzinc/player

An accessible Z-machine player as Vue components, on [`@frotzinc/zmachine`](../zmachine). Built for people who use screen readers, and for pages with a strict Content-Security-Policy: plain Vue and its own CSS (no Tailwind, no component library), no inline styles, no `eval`, no WebAssembly. The player behind [frotzplay](../../apps/play).

> **Status: in development** (frotzplay Phase 3). Not yet on npm.

![The player playing The Dark Cellar in the dark theme](../../docs/screenshots/frotzplay/play-dark.png)

```vue
<script setup lang="ts">
import { ZPlayer } from '@frotzinc/player'
import '@frotzinc/player/player.css'
const story: Uint8Array = /* the story file's bytes */
</script>

<template>
  <main class="h-screen">
    <!-- Give the player a definite height: its story scrolls inside it. -->
    <ZPlayer :story="story" title="The Dark Cellar" />
  </main>
</template>
```

**Props:** `story` (bytes), `title`, `seed` (random when not given), `fontBase` (where the `fonts/` folder is served, default `/fonts/`), `autosave` (default on), `storage`; `v-model:theme`. **Events:** `turn`, `input-wanted`, `quit`, `save`, `error`, `started` (the story booted, or started again), `status` (`{ left, right, sentence }`, when the status line changes). **Exposed:** `focusCommand()` (for the host's skip link), `state`, `seed`, `restart()`, and `send(line)` and `press(key)`.

**A host that drives the story** (an IDE sending a test script, say) calls `send(line)` or `press(key)` (`'Enter'`, `' '` or one character). Each acts as the player typing and resolves when the turn is done. It resolves `false` when the story isn't waiting for that kind of input, so a script can press through a "press any key" first. Those turns carry `fed: true`, so a host can tell them from the player's own.

**The host's part:** one `<main>` around it, a skip link that calls `focusCommand()`, a definite height, the page title from the story's title, and the `fonts/` folder served at `fontBase`.

## As a web component: `<frotz-play>`

One script, nothing else to host, and it embeds under `script-src 'self'; style-src 'self'` (no `unsafe-inline`, no `unsafe-eval`, no WebAssembly):

```html
<script src="/frotz-play.js"></script>
<frotz-play src="/stories/dark-cellar.z5" title="The Dark Cellar"></frotz-play>
```

`dist/frotz-play.js` (also exported as `@frotzinc/player/frotz-play.js`). Attributes: `src`, `title`, `seed`, `font-base` (empty turns off OpenDyslexic), `autosave` (`off`), `theme` (`dark`, `light`, `high-contrast`). Property: `story` (bytes). Methods: `send(line)`, `press(key)`, `restart()`, `focusCommand()`. Events: `turn`, `input-wanted`, `quit`, `save`, `error`, `started`, `status` (as `CustomEvent`s, the values in `detail`). Give it a height.

## Export

`bundle(story, { title, storyName, elementJs })` makes one HTML file that plays from a double-click (its own hash-based CSP, no fetches); `bundleFolder(...)` the files of a folder for any static host, and `zip(files, name)` a `.zip` of them. `elementJs` is `frotz-play.js`'s text.

## The accessibility contract

Everything in [`docs/accessibility.md`](../../docs/accessibility.md) is built in: one announcement per turn, the status line announced only when it changes, verbosity settings, the upper window as text, pausable timed input, a command line that keeps focus, changeable shortcuts, dark by default with all text at 7:1, light and high-contrast themes, 200% text, 320-pixel reflow, reduced motion, OpenDyslexic. Each statement has a Playwright test (`e2e/`, in Chromium, Firefox and WebKit) or a unit test (`test/`), and axe runs in every state.

## Development

`pnpm dev` serves the dev page (http://localhost:4180) with the samples and the test stories; `pnpm test` runs the unit tests; `pnpm test:e2e` (after `pnpm build`) the contract suite, the strict-CSP embed test and the export tests.

## Fonts

`fonts/` holds OpenDyslexic (© Abbie Gonzalez, SIL Open Font License 1.1, unmodified; see `fonts/README.md`). It loads only when chosen.

MIT. From [frotz, Inc.](https://frotzinc.com).
