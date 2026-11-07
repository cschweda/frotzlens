# frotzplay — Phase 4: The Site (`apps/play`)

**Document 14 · frotzplay Phase 4** (design: [`frotzplay-design.md`](frotzplay-design.md) §3, §4, §8; Phases [0](10-frotzplay-phase-0-shell.md)–[3](13-frotzplay-phase-3-player.md))
**Status:** built 2026-11-07 (§7); waiting on Chris for the Netlify site and the worker decision (§5).
**Deliverable:** frotzplay.frotzinc.com's page: the family shell, a start page with a drop zone and the sample stories, `?story=` and `?sample=` links, stories handed over by `postMessage`, Blorb covers and titles, autosave, a PWA, the About dialog with Parchment's credits, "Open in Parchment"; built and served with the production CSP; playable on a Netlify preview.

> **Exit criteria:** `nuxt generate` builds; a Playwright suite against the built site, served with `netlify.toml`'s headers, opens a story by drop, by file picker, by each sample, by `?sample=`, by `?story=` (same origin, and another origin with CORS), shows the worded error for a server without CORS and for a file that isn't a story, plays a turn in each, and finds no axe violations and no CSP violations; the frotzlens suite still passes; Chris connects the Netlify site.

---

## 1. The page

- **The family shell** from `nuxt-base`: `AppHeader` (frotzplay's mark and name; the story's title as `#context`; *Open another story* and *Open in Parchment* as `#actions`; the About menu; the light/dark switch), `AppFooter`, `AboutDialogs` with frotzplay's changelog. `product` in `app/app.config.ts`, from `site.config.ts`. SEO from `seo.ts` (Phase 2's work).
- **The start page** (no story open): the drop zone (drop a file anywhere on the page, or *Choose a file*), the **Try a sample** row (The Dark Cellar featured, The Locked Chest, The Hermit, Magic 8-Ball), a line on what frotzplay is for, and *"For Glulx, TADS, Hugo and everything that isn't Z-code, use Parchment"*, linked.
- **Playing:** `ZPlayer` filling the page below the header, the page title the story's (`The Dark Cellar — frotzplay`), the skip link to the command line.
- **The theme** follows the header's light/dark switch (the family's colour mode, dark first); the player's Settings offer high contrast too, and choosing it there sets the page's `.high-contrast` class. `ZPlayer` gains a `theme` model so the page and the player agree.

## 2. Where stories come from

| Source | How | Errors, in words |
|---|---|---|
| A dropped file, or *Choose a file* | read in the browser; nothing uploaded | not a Z-machine story (or a version 6, or a Glulx Blorb): say which, and point Glulx at Parchment |
| `?sample` / `?sample=<id>` | `/samples/<file>`, copied from `samples/` at build time | an unknown id: say so, show the samples |
| `?story=<url>` | `fetch`, from the browser straight to that server (`connect-src https:`) | no CORS: *"That server doesn't allow other sites to read its files, so frotzplay can't open this story. Download it and drop it here instead."*; not found; not a story |
| `postMessage` from an opener | the frotzlens handshake: frotzplay posts `{ source: 'frotzplay', type: 'ready' }` to `window.opener`; it takes one `{ source: 'frotzlens', type: 'story', bytes, name }` from that window only, from an allowed origin (frotzlens.frotzinc.com, and the page's own) | anything else is ignored |

A **Blorb** (`.zblorb`) is unwrapped with `@frotzinc/zcode`; its iFiction title and author name the page, and its cover (the frontispiece picture) shows on the start of play.

**Open in Parchment** appears only when the story came from a URL: `https://iplayif.com/?story=<the same url>`.

## 3. Autosave and the PWA

Autosave is the player's (Phase 3), keyed by story. The site adds the **PWA** (`@vite-pwa/nuxt`, as frotzsmith): the app shell and the samples precached, so frotzplay opens offline, and a story dropped offline plays. The service worker is checked after `generate` with `nuxt-base`'s `check-sw` (what's precached, what isn't).

## 4. Security headers

`netlify.toml` (written in Phase 0) as it is: `script-src 'self' 'unsafe-inline'` (Nuxt's inline payload), `connect-src 'self' https:` (`?story=`), `worker-src 'self'` (the service worker), `frame-ancestors 'none'`. The e2e server (`scripts/serve.mjs`) serves the built site with exactly these headers, and every test fails on a CSP violation.

## 5. The worker: decided, main thread

The design has `apps/play` run the interpreter in a worker. Phase 3's player already runs it in slices that yield to the page, so a story that loops can't freeze the tab, which is what the worker was for. A worker would also need the player to talk to the machine asynchronously (every state read and every save becomes a message), a substantial change for little gain. **Decided (Chris, 2026-11-07): the interpreter stays on the main thread, everywhere; revisit only if a real story ever makes the page stutter.** `apps/play` is built without a worker, and nothing depends on one.

## 6. Tests

`apps/play/e2e/` (Playwright + axe, Chromium, Firefox and WebKit, against the built site with production headers): each source of §2 and its errors; a Blorb with its title and cover; the theme switch; the start page and the playing page with axe; no CSP violations anywhere; the PWA's service worker registers.

## 7. Done

- **`apps/play`** (`frotzplay-web`): the family shell, the start page with the drop zone and the four samples, the player filling the page while a story plays, the story's title in the header and the page title, *Another story*, *Open in Parchment* for `?story=` links, the About dialog crediting Parchment and ZVM. One theme for the page and the player (the header's switch, high contrast from the player's Settings, remembered; `prefers-contrast: more` starts in high contrast). `ZPlayer` gained a `theme` model for it.
- **Every source of §2** works, with its errors in words: a dropped or chosen file, `?sample=`, `?story=` from this site and from another origin with CORS, the worded error without CORS and for non-https links, Glulx and non-story files pointed at Parchment, a story handed over by the opening window. Blorbs give their iFiction title, author and cover.
- **The PWA:** `@vite-pwa/nuxt`, precaching the shell, the samples and the fonts (49 files, 2 MB).
- **Tests:** 38 Playwright tests (13 × Chromium, Firefox, WebKit; the service-worker check is skipped in Firefox, whose Playwright build has service workers off) against the built site served with `netlify.toml`'s headers, failing on any CSP violation or page error; axe on the start page, while playing, and in high contrast. In CI.
- **Found on the way:** port 4190 is on the browsers' blocked-port list (ManageSieve): WebKit refuses it and Firefox redirects away. The test server is on 4210.
- **For Chris:** connect the Netlify site (personal account, base directory `apps/play`, domain frotzplay.frotzinc.com; steps in the README's Hosting section), and decide §5 (the worker).
