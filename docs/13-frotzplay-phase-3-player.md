# frotzplay — Phase 3: The Player (`@frotzinc/player`)

**Document 13 · frotzplay Phase 3** (design: [`frotzplay-design.md`](frotzplay-design.md) §6, §8; Phases [1](11-frotzplay-phase-1-interpreter.md), [2](12-frotzplay-phase-2-state.md))
**Status:** proposal, for approval before any code (kickoff: "At the start of Phase 3: propose the `player` component tree and the `docs/accessibility.md` outline, statement by statement, with each statement's test").
**Deliverable:** `@frotzinc/player`, plain-Vue components that play a story with `@frotzinc/zmachine` and meet the accessibility contract; `docs/accessibility.md` written; its Playwright + axe suite green on a dev page playing the sample; Chris runs the NVDA checklist.

> **Exit criteria:** every browser-checkable statement in §3 has a passing Playwright test (named after the statement) on the dev page, in Chromium, Firefox and WebKit; axe finds nothing (WCAG 2.2 A and AA rules, plus AAA contrast in the dark theme) in any state listed in §4; the dev page plays The Dark Cellar's walkthrough to the end by keyboard alone; `docs/accessibility.md` has every statement and its test; the NVDA checklist is ready for Chris.

---

## 1. The package

`packages/player` → `@frotzinc/player` (MIT). Vue single-file components, built with **Vite in library mode** (the other packages are plain `tsc`; SFCs need a compiler). Vue is a peer dependency. No Nuxt, no Nuxt UI, no Tailwind inside (design §8: they break in a shadow root under a strict CSP). Its CSS uses the family tokens from `nuxt-base/css/palette.css` as custom properties, plus the player's own, and no inline `style` attributes.

A **dev page** (`packages/player/dev/`, Vite) hosts `ZPlayer` on its own with the samples, for the Playwright suite and for Chris's NVDA run. `apps/play` (Phase 4) wraps the same component in the family shell.

**Main thread only in this phase**: the machine runs in `run(budget)` slices with a yield between them (design §8). The worker is opt-in and comes with `apps/play` in Phase 4; nothing in the components depends on which.

## 2. The component tree

```
ZPlayer                       the whole player; props: story (bytes), title?, seed?, options; emits turn, input-wanted, quit, save, error
├─ ZStatusBar                 v3: the status line drawn (room left, score/moves or time right); v4+: the upper window's first row
├─ ZUpperWindow               v4+ when the game uses more than one row: the grid, as lines of text (a <pre>), labelled "Upper window"
├─ ZTranscript                <section aria-label="Story">: one block per turn (the command, then the output, as styled runs); browsable, not live
│   └─ ZRuns                  styled runs: <b>, <i>, reverse and fixed-pitch as classed <span>s; fixed-pitch layouts as a scrolling block
├─ ZCommandLine               the labelled <input>: line input, history (↑/↓), key input for @read_char, the timed-input notice
├─ ZToolbar                   Undo, Save, Restore, Transcript, Settings, Shortcuts, Read upper window (buttons, each with a visible label)
├─ ZAnnouncer                 visually hidden role="log" polite: one block per turn, shaped by verbosity
├─ ZStatusAnnouncer           visually hidden polite region: the status line, only when it changes
├─ ZMessages                  role="status": saved, restored, autosaved, exported, and errors in words with what to do
├─ ZSettings                  <dialog>: theme, font, size, line length, line and letter spacing, verbosity, motion, timed input (pause / off)
├─ ZShortcuts                 <dialog>: every binding, each changeable or off (2.1.4)
└─ ZRestoreDialog             <dialog>: restore from a file (an <input type="file">), or "Continue where you left off" (autosave)
```

**Composables:**
- `useMachine(story, options)`: creates the `Machine`, runs it in slices, turns stops into state (waiting for a line, a key, a save, a restore; quit; fault), and keeps the transcript of turns.
- `useAnnouncer(verbosity)`: builds each turn's announcement from the turn's output.
- `useAutosave(story)`: the snapshot after every turn into IndexedDB, keyed by release/serial/checksum; "Continue" on the next visit. Falls back to memory with a "Download save" message when IndexedDB is unavailable (design: the `file://` case).
- `useSettings()`: the settings, kept per viewer in `localStorage` (through `nuxt-base`'s `safe-storage`, which never throws), applied as custom properties on the player's root.
- `useShortcuts(bindings)`: the bindings, changeable and switchable off, kept with the settings.
- `useTimedInput()`: the host side of timed reads: the timer, pause and off, the countdown announcement, and recording `[timeout]` events.
- `useTranscriptExport()`: the session as text, and as a command script (`[timeout]`/`[key]` included) that `zmachine-run` replays.

**Themes:** dark (default), light, high-contrast (dark ground, ≥ 7:1 everywhere). The high-contrast tokens go into `nuxt-base/css/palette.css` with their measured ratios. In dark, nothing in the player uses `ink-2` for text: a new `--frotz-ink-muted` at ≥ 7:1 on ground and panel instead.

## 3. `docs/accessibility.md`: the contract, statement by statement

Each statement gets an ID, the WCAG criteria it serves, and its test: **P** = a Playwright test in `packages/player/e2e/` named after the ID; **A** = covered by axe in the states of §4; **N** = the NVDA checklist (by hand, before each release); **U** = a Vitest unit test.

### Output

| ID | Statement | WCAG | Test |
|---|---|---|---|
| O1 | The story text is a labelled region ("Story") of one block per turn: the command, then its output; browsable in a screen reader's browse mode; not itself a live region. | 1.3.1, 4.1.2 | P: the region and its name; a turn is one block; no `aria-live` on it. N: browse by line. |
| O2 | Each turn is announced once, as one block, through the announcer (polite log): never word by word. | 4.1.3 | P: exactly one addition to the announcer per turn, over the whole walkthrough. N. |
| O3 | Verbosity: *standard* (default) announces the output only; *full* adds the command echo, blank lines and the prompt; *terse* is standard without status-line and upper-window announcements. The transcript always shows everything. | 1.3.1 | U: the announcement for one turn in each mode. P: switching modes changes the next announcement. |
| O4 | The status line is announced only when its text changes, through its own polite region, never as a grid. v3: a sentence ("West of House. Score 0, moves 3."); v4+: the first row's text, trimmed, spaces collapsed. | 4.1.3 | P: no announcement after a turn that leaves it unchanged; v3 sentence; v5 row text. N. |
| O5 | The upper window, beyond a status line, is a text alternative (its rows as lines), and "Read upper window" (button and shortcut) announces it on demand. | 1.1.1, 1.3.1 | P: the button announces the rows. N. |
| O6 | Styles carry no meaning the game didn't give: bold `<b>`, italic `<i>`, reverse and fixed-pitch as classed spans; colour never the only signal. | 1.3.1, 1.4.1 | U: runs to markup. A. |
| O7 | Fixed-pitch layouts (maps, boxes) scroll inside their own block, never the page. | 1.4.10 | P: at 320 px, the page doesn't scroll sideways; the block does. |
| O8 | Timed input is announced ("The game will go on in 10 seconds unless you type"), and can be paused or turned off in Settings; paused, the timer routine isn't called, and the announcement says so. | 2.2.1 | P (timed fixture): the announcement; pause stops the interrupt; off never fires it. N. |

### Input

| ID | Statement | WCAG | Test |
|---|---|---|---|
| I1 | The command line is a labelled `<input>` ("Command"), focused at start and after every turn; the page never moves focus anywhere else on its own. | 2.4.3, 3.2.1, 4.1.2 | P: focus after every turn of the walkthrough; nothing else ever takes it unprompted. |
| I2 | Command history: ↑ and ↓ step through earlier commands. | 2.1.1 | P. |
| I3 | A key press wanted (`@read_char`) is announced ("Press any key") and taken from the same control. | 3.3.2, 4.1.3 | P (timed fixture, `[key]`). N. |
| I4 | Everything works from the keyboard: every control, every dialog; no keyboard trap; dialogs return focus to where it was. | 2.1.1, 2.1.2, 2.4.3 | P: the walkthrough, Save, Restore, Undo, Settings and Shortcuts by keyboard alone; Tab cycles out of every dialog's trap only by its close. |
| I5 | Every control shows a visible focus indicator, never hidden behind sticky parts of the page. | 2.4.7, 2.4.11 (2.4.13 stretch) | P: focus outline measured on each control. A. |
| I6 | Every shortcut is listed in the Shortcuts dialog and can be changed or turned off; none is a single character key. | 2.1.4 | P: change one, use it; turn one off, it no longer fires. |
| I7 | Targets are at least 24 × 24 CSS px; nothing needs a gesture. | 2.5.8, 2.5.1 | P: every button's box measured. |

### Presentation

| ID | Statement | WCAG | Test |
|---|---|---|---|
| R1 | Dark by default; every piece of text in the player at 7:1 or better in dark. | 1.4.3 (1.4.6) | A with the AAA contrast rule, dark theme. |
| R2 | Light and high-contrast themes: 4.5:1 in light (AA), 7:1 in high contrast. The theme switch is one control, remembered. | 1.4.3, 1.4.6 | A in each theme. P: the choice survives a reload. |
| R3 | Text resizes to 200% with nothing lost; the page reflows at 320 px with no sideways scrolling (O7 aside). | 1.4.4, 1.4.10 | P: 200% zoom and 320 px, every control reachable and visible. |
| R4 | Text-spacing overrides (line 1.5, paragraph 2, letter 0.12, word 0.16) lose nothing; the Settings' own line length and spacing go at least that far. | 1.4.12 | P: inject the 1.4.12 stylesheet; nothing clipped. |
| R5 | `prefers-reduced-motion` and `prefers-contrast: more` are honoured; nothing flashes. | 2.3.1, 2.3.3 | P: emulated media; no animation; high contrast chosen. |
| R6 | A dyslexia-friendly font is a setting (open question 2), and a monospace one. | — | P: the setting applies. |

### Structure and messages

| ID | Statement | WCAG | Test |
|---|---|---|---|
| S1 | Landmarks: the story, the command line, the toolbar; on a page, one `<main>` and a skip link to the command line. The page title is the story's title. | 1.3.1, 2.4.1, 2.4.2 | P, A. |
| S2 | Saved, restored, autosaved, exported: `role="status"` messages, in words. | 4.1.3 | P: each message appears in the status region. |
| S3 | Errors are in words, saying what to do: a story that won't load, a bad save file ("That save file is from a different story…"), a fault ("The story stopped: …; Restart, or Undo the last turn"). | 3.3.1, 3.3.3 | P: a bad story, a bad save, a forced fault. |
| S4 | Headings and labels describe what they're for; every dialog has a name and its first focus. | 2.4.6, 4.1.2 | A, N. |

## 4. The axe states

Start (a story loaded, waiting for a command); after five turns; a v3 story with its status line; a v5 story with a split upper window; waiting for a key; a timed read counting down; each dialog open (Settings, Shortcuts, Restore); a status message showing; an error showing; each theme; 320 px; 200%.

## 5. To approve

1. **The package and its build:** Vite library mode for SFCs; plain Vue, no Nuxt UI/Tailwind inside; a dev page in `packages/player/dev/`; main thread only this phase (§1).
2. **The component tree and composables** (§2).
3. **The contract as written in §3**, which becomes `docs/accessibility.md`: 25 statements, each with its test.
4. **The v3 status sentence** (design open question 6): *"West of House. Score 0, moves 3."* (room first: it's what changes most), *"Kitchen. 9:30."* for time games. To be confirmed by Chris with NVDA in hand.
5. **Default shortcuts:** Alt+Shift with a letter, since single keys would fire while typing (2.1.4) and NVDA owns Insert/Caps Lock combinations: Alt+Shift+U read the upper window, Alt+Shift+L repeat the status line, Alt+Shift+Z undo, Alt+Shift+S save, Alt+Shift+R restore, Alt+Shift+O settings, Alt+Shift+K the shortcuts list. One catch: on a Mac, Option+Shift+letter types a special character, so while the command line has focus these would eat characters that IF commands never use. All changeable or off (I6).
6. **The dyslexia-friendly font** (design open question 2): OpenDyslexic, under the SIL Open Font License 1.1 (checked against the font files when they're added), self-hosted. Include it, or leave it out (opinions on its benefit differ; the spacing and size controls help everyone)?
7. **Settings and autosave are per viewer, in the browser** (`localStorage` and IndexedDB): nothing is sent anywhere.
