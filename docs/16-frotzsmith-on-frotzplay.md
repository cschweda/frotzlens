# Frotzsmith on frotzplay

**Document 16 · a plan** (frotzplay: [design](frotzplay-design.md), [Phase 5](15-frotzplay-phase-5-embed-export.md); Frotzsmith: its `docs/03-phase-3-play-parchment.md`, `docs/05-phase-5-export-bundles.md`, `docs/06-security.md`)
**Status:** started 2026-11-07. §3 is done (`@frotzinc/player` 0.2.0); Frotzsmith's part follows, on a branch.
**Deliverable:** Frotzsmith plays, exports and replays with frotzplay. For a release or two, a setting can switch Play back to Parchment, and then Parchment is retired.

> **Exit criteria:** with frotzplay as the player, Frotzsmith's transcript, auto-map, Skein, solution recorder and Send-to-Play work as they do on Parchment, and its tests pass; *Export → HTML* makes a frotzplay single file; switching the setting to Parchment brings the old player back unchanged. At retirement: no `public/play/`, and the CSP without `'unsafe-eval'` or `connect-src blob:`.

---

## 1. Why

- **frotzplay plays everything Frotzsmith makes.** Frotzsmith compiles Inform 6 and ZIL to Z-machine versions 3, 4, 5 and 8; Glulx is a stub that refuses to run (`GlulxEngine.ts`). frotzplay plays exactly those.
- **The Play panel stops reaching into another program's page.** Today it scrapes Parchment's DOM:
  - commands, from a capture-phase `keydown` on GlkOte's `input.LineInput`;
  - the room, from the first `.GridLine` split on two spaces;
  - Send-to-Play, by typing into that input and firing synthetic keydown, keypress and keyup events in the iframe's realm, and pressing Space at `[MORE]`.

  `ZPlayer` gives each of these as a typed value or event: the `turn` event (with the command and the turn's text), the status line in its state, and an input call (§3).
- **One engine.** Frotzsmith's test scripts, Skein and solutions replay on ZVM. `@frotzinc/zmachine` matches ZVM turn for turn on every sample, so Play and replay agree, and replay can move to it too (§6).
- **Accessibility and a tighter CSP.** Frotzsmith gains the [accessibility contract](accessibility.md): announcements, shortcuts, high contrast and OpenDyslexic. Once Parchment is gone, so are `'unsafe-eval'` (ZVM's JIT, and the replay worker's `glkapi.js`), `connect-src blob:` and the same-origin iframe.

## 2. How it embeds: the Vue component, not the element

Frotzsmith is Vue 3.5 and Nuxt 4, so it uses `ZPlayer` from `@frotzinc/player` directly, not `<frotz-play>` in an iframe:
- events and the exposed state are typed;
- there's no `postMessage` boundary to guard (`play-message.ts` goes);
- fullscreen keeps working on the panel's container.

The player's CSS is its own (`.zp` classes, no Tailwind), but Tailwind's preflight still applies to it in a Nuxt UI page. The first task checks that the player looks the same inside Frotzsmith as on frotzplay, in both themes. If it doesn't, Frotzsmith uses the `<frotz-play>` element instead, which keeps the player in a shadow root, and §3's additions go on the element too.

## 3. What frotzplay adds first (`@frotzinc/player` 0.2.0)

Small, and useful to any host:
1. **`send(line)` and `press(key)`** on `ZPlayer`'s exposed API (and as methods on `<frotz-play>`): type a command, or press a key, as if the player had. They resolve when the turn is done. Send-to-Play's whole pacing engine (`play-feed.ts`: MutationObserver, the pager, the watchdog, the realm tricks) becomes a loop over `await send(cmd)`. frotzplay has no `[MORE]` pager to dismiss.
2. **A `status` event** when the status line changes (`{ left, right, sentence }`), so the auto-map gets the room as the game shows it without parsing the screen. It's also in the exposed state.
3. **`started`**, when a story boots (what Parchment's `session-start` message does).
4. **The `theme` attribute** on `<frotz-play>` (`ZPlayer` already has `v-model:theme`), so Frotzsmith's light and dark carry over.
5. **A `fed` flag** on commands that came through `send()`. Today Frotzsmith leaves fed commands out of the typed transcript (`__frotzScriptRunning`), and keeps doing so.

**Done:** all five, plus `restart()`. Tested in the player's unit tests and in the embed test (the element's methods, events and `theme` under the strict CSP, in Chromium, Firefox and WebKit).

Tests in the player's contract suite. Published like 0.1.0 (`publish.sh`, Chris's 2FA).

## 4. Frotzsmith: frotzplay by default, Parchment behind a setting

1. **One place for what Play reports.** Today `PlayPanel.vue` routes the iframe's messages to `usePlayTranscript().record`, `useMap().recordCommand`/`recordRoom`/`markNoRoom`, `useSkein().recordPlayCommand`/`resetPlayCursor`, and starts a pending script on `session-start`. Move that into a `usePlaySink()` with `command(text)`, `room(name, text)`, `noRoom()` and `started()`, called the same way by both players.
2. **`FrotzplayPanel`:** `ZPlayer` with the compiled bytes (no blob URL, no `#game.z5` trick), `autosave` off (Frotzsmith clears Parchment's `autosave:<hash>` entries today for the same reason), the theme from `useColorMode`, and a seed from the test settings. Wiring:
   - `turn` → `command` (and the turn's text for the map);
   - `status` → `room`, or `noRoom()` after a few turns with no status line, as now;
   - `started` → `started()`;
   - Send-to-Play → `send()`, with the same toast when a feed stops part-way.
3. **`ParchmentPanel`:** today's iframe, unchanged, behind the same sink.
4. **The setting:** *Play in: frotzplay | Parchment*, frotzplay by default, remembered in localStorage (via `safe-storage`). The Play tab's empty state names the player in use.
5. Fullscreen, the solution recorder bar, and the "a new build tears the game down" rule stay as they are.

**Tests:**
- Frotzsmith's `nuxt` tests for the sink and both panels (the feed tests move to `send()`);
- a check that a scripted session gives the same transcript, map and Skein on both players;
- axe on the Play tab.

## 5. Export

`useHtmlExport` today inlines jQuery, Parchment's `main.js`, `zvm.js` (through an import map of `data:` URIs) and `web.css`. That's about 290 KB of scripts and CSS before the story, and the page needs a loose CSP. With frotzplay it calls `bundle()` from `@frotzinc/player`: one HTML file of about 150 KB plus the story, which plays from a double-click under its own hash-based CSP (`default-src 'none'`). Frotzsmith also gets *Export → folder (.zip)* for itch.io. While the setting exists, the Parchment export stays beside it.

## 6. Replay on `@frotzinc/zmachine` (optional)

Frotzsmith's `StoryEngine` seam (ADR-002) already separates the engine from replay. A `FrotzplayEngine` built on `Machine` (`boot` runs to the first input, and `send` takes one line) replaces `ZmachineEngine` and its headless GlkOte. Its turns go through Frotzsmith's `normalizeTurnOutput`, as now, and the golden replay tests must pass unchanged. That's the evidence. This drops `glkapi.js` and the replay worker's need for `'unsafe-eval'`.

## 7. Retiring Parchment

After a release or two with no reason to switch back:
- remove the setting and `ParchmentPanel`;
- remove `public/play/` (Parchment, jQuery, `zvm.js`) and the Parchment export;
- remove its cache rule;
- in the CSP, drop `'unsafe-eval'` (once §6 is done as well), `connect-src blob:` and the iframe allowances (`X-Frame-Options` can go back to `DENY`);
- update `docs/06-security.md`, the technical page and the README, and keep crediting Parchment and ZVM for the oracle.

## 8. Order, and sizes

| Step | Where | Size |
|---|---|---|
| §3 player additions, `@frotzinc/player` 0.2.0 | frotzlens | small |
| §2 the style check in Frotzsmith | Frotzsmith | small |
| §4 sink, frotzplay panel, setting | Frotzsmith | medium |
| §5 export | Frotzsmith | small |
| §6 replay engine | Frotzsmith | medium, optional |
| §7 retirement | Frotzsmith | small, later |

Every step bumps Frotzsmith's version with a changelog section and its README.

## 9. Risks

- **Hidden tabs.** The player yields between instruction slices with `setTimeout(0)`, which a hidden tab throttles. A normal turn finishes in one slice, so Send-to-Play in a background tab is unaffected; a turn that runs millions of instructions would be slow there. It's the same trade Parchment's timers have; note it, test a long script with the tab hidden.
- **Room names.** frotzplay's v4+ status line is the upper window's first line, split as Frotzsmith splits it today. Games that draw something else there map as they do now, which is not at all.
- **Two players for a while** means two integrations to keep working. That's why the setting has an end date (§7).
