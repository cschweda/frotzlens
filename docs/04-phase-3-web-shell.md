# frotzlens — Phase 3: Web App Shell

**Document 04 · Phase 3**
**Deliverable:** drop a story file into frotzlens.frotzinc.com and see the Overview dashboard — on the Netlify preview once the repo is connected (Chris's personal Netlify account, not ICJIA's).

> **Exit criteria:** `apps/web` builds statically (`nuxt generate`); dropping a file (or "Try a sample") parses it in a Web Worker and shows the Overview; every view is a hash route; the command palette (⌘K / Ctrl+K) jumps to any routine, object, string or dictionary word; the footer is on every page; axe finds nothing at AA; the page works at 400px.

---

## 1. Shape

```
apps/web/                         frotzlens-web (private, GPL-3.0-or-later)
├── nuxt.config.ts                extends @frotzinc/nuxt-base; @nuxt/ui; head/OG from site.config.ts
├── site.config.ts                one place for the canonical URL (https://frotzlens.frotzinc.com/) and identity
├── app/
│   ├── app.vue                   UApp + header + view + footer
│   ├── assets/css/main.css       Tailwind, Nuxt UI, nuxt-base's base.css and palette.css, the type scale
│   ├── workers/parse.worker.ts   parseStory off the main thread
│   ├── composables/useStory.ts   load a file: worker first (worker-rpc), main thread if workers fail
│   ├── composables/useHashRoute.ts  the hash route: #overview, #routine/1b22, #object/47, …
│   └── components/               DropZone, OverviewView, ItemView, MemoryMap, StatTile, StoryFacts, SearchPalette, AppHeader, AppFooter
└── public/                       badge, card, icons, the frotz, Inc. mark; samples/dark-cellar.z5 (copied at build)
```

## 2. Decisions (inside what's settled)

- **One page, hash-routed.** `ssr: false` (from nuxt-base) and every view a hash (`#routine/1b22`), as the design says, so a link to any view is bookmarkable and no server routes exist. Phase 3 has the Overview and the routes; the other views arrive in Phase 4 — until then a route to one shows what it is and a link back.
- **Parsing in a worker** through `@frotzinc/worker-rpc`, with the main-thread fallback (frotzsmith's `useI6Wasm` shape). The model crosses by structured clone (tested in zcode).
- **Nothing leaves the machine.** No analytics, no third-party requests: fonts self-hosted by Nuxt UI's font module at build time (Open Sans, JetBrains Mono), Segoe UI and Cascadia Code used when installed. The CSP in `netlify.toml` allows the site's own origin and nothing else: plus `'unsafe-inline'` for Nuxt's inline bootstrap and color-mode script and Nuxt UI's inline styles, and `data:`/`blob:` images.
- **The palette** (colours) comes from `@frotzinc/nuxt-base`'s `palette.css` (dark default, light available); no colour is hard-coded in a component.
- **The sample** is `samples/dark-cellar.z5`, copied into `public/samples/` before dev and build (not committed twice). Its name is in `site.config.ts` only; the copy script reads it from there.
- **Loading** is last-wins: each load takes a number and only the latest commits, so a slow earlier file never replaces a later one; the buttons are disabled while a file is read. A file dropped anywhere on the page opens it, unless a load is already in progress, when the drop is ignored; either way the browser never navigates away to the raw file.

## 3. Netlify

`netlify.toml` (repo root) already has it: base `apps/web`, frozen pnpm install, build the workspace libraries the app uses, `nuxt generate`, publish `dist`. Chris connects the repo in the Netlify UI (personal account); nothing else to set.

## 4. How it's checked

- **The Netlify build command**, run locally from `apps/web`: frozen install, the workspace libraries, `nuxt generate` — exit 0.
- **In a browser** (headless Chrome, the built site): "Try a sample" parses `dark-cellar.z5` in the worker and shows the Overview; ⌘K finds "cellar" and Enter opens `#object/28`; light mode; 400px with no sideways scroll; no console errors. Again with `netlify.toml`'s Content-Security-Policy sent as a header: no violations.
- **axe (WCAG 2.2 AA)** on the drop zone, the Overview (dark and light), an object and a routine: nothing. The palette has one finding, `scrollable-region-focusable`, inside Nuxt UI's command palette: its results are reached with the arrow keys from the input (the WAI-ARIA combobox pattern), and making the list itself tabbable breaks `aria-required-children` instead. Left as is.
- **The memory map's bar** is a pointer shortcut and hidden from assistive technology (many bands are a few pixels wide, under 2.5.8's 24px); the list under it is the accessible way to each part, and the regions (which overlap: static and high) are written out in text.
