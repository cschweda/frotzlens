# frotzlens — Phase 4: Data Views

**Document 05 · Phase 4**
**Deliverable:** every part of a story file has a view, every address and name in one links to the view of what it names, and every view copies as Ztools-format text.

> **Exit criterion:** full navigation of `architect-legacy.z5`. Pinned as a test: `apps/web/e2e/smoke.spec.ts` opens it through the file picker, visits every view and follows links between them, runs axe (WCAG 2.2 AA) on each, in dark and light mode and at 400px, with no console errors — against the built site, served with the production CSP.

---

## 1. The views

| Route | View | Copy as text |
|---|---|---|
| `#overview` | Tiles, memory map, story facts (Phase 3) | `infodump -i` (the header) |
| `#memory`, `#memory/<part>` | The map; a hex pane (a page of 32 rows; go to any address), each row noting the parts that start in it, the selected part's bytes bright | `infodump -m` |
| `#objects`, `#object/<n>` | The tree (rooms at the top), and an object's links, attributes (listed, and drawn as a flag row), properties (bytes, and the routines, strings and words they point to) and referrers | `infodump -o` and `-t` |
| `#dictionary`, `#dict/<addr>` | Every word, searchable, with Inform's flags; a word's bytes, its verbs' grammar and referrers | `infodump -d` |
| `#grammar`, `#grammar/<i>` | Each verb's words, its lines in the order they're tried, each line's action routine | `infodump -g` |
| `#routines`, `#routine/<addr>` | Every routine with its calls and callers; a routine's disassembly, with every routine, string, object and dictionary word linked, and labels that jump to their line; "called from" and "calls and uses" | `txd` (all), one routine's block |
| `#strings`, `#string/<addr>` | Every string, searchable; a string's text and referrers | txd's string list |

A left nav (a scrolling row on narrow screens) reaches every view; ⌘K still jumps to anything.

## 2. Decisions

- **The disassembly is txd's text, linked.** `@frotzinc/zcode/format` gains `routineView(story, address)`: the routine as lines of pieces, each piece's text exactly txd's, with the Id it names (`routine:…`, `string:…`, `object:…`, `dict:…`) or the label it targets. Joined, the pieces are `formatRoutine`'s text — pinned for every routine of all 34 samples, both modes (`packages/zcode/test/view.test.ts`), with every Id resolving. txd's own output is unchanged (the golden tests).
- **Labels are text, not arrows.** The design's "branch targets as gutter arrows" became txd's labels (`L0003`) as links that scroll to and focus their line: the same information, readable by a screen reader, and no drawing to keep in sync. Arrows can come later as decoration over the labels.
- **Long lists show a page at a time** (200 rows, then more on request), so a story with thousands of strings stays quick without a virtual list.
- **The object tree is the WAI-ARIA tree pattern**: one tab stop; arrows, Home/End, Enter, type-ahead; rendered flat with `aria-level`, so only open branches exist in the DOM. Rooms start open; so does the path to the selected object.
- **Property values are linked only when they resolve**: a word that is exactly a routine's or string's packed address, or a dictionary entry's address. Nothing is guessed.
- **Focus follows navigation.** A new view scrolls to the top and focuses `<main>`, so a screen reader announces it; the app's own focus targets (`tabindex="-1"`) show a quieter state than the keyboard ring.

## 3. How it's checked

- **zcode:** `routineView` and `formatStrings` (37 tests) beside the existing golden tests (399 in zcode).
- **The app:** Playwright (Chromium) against the generated site, served by `apps/web/scripts/serve.mjs` with `netlify.toml`'s CSP: the sample opens; every view of `architect-legacy.z5`; the tree from the keyboard; following a call in a disassembly; light mode; 400px with no sideways scroll. axe (WCAG 2.2 AA) on every page visited. In CI after `nuxt generate`.
- What axe found while building, fixed: links in the disassembly told apart only by colour (now dotted underlines); the header's search button unnamed at 400px, then named in a way that didn't match its visible text (WCAG 2.5.3); a set attribute's chip under AA in light mode; small property links (2.5.8); scrollable regions not focusable.

## 4. Left for Phase 5

Symbols (`gameinfo.dbg`) and the symbolic/raw toggle; Inform fingerprinting; Blorb; globals and abbreviations as views; the `RoomGraph`.
