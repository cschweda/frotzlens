# frotzplay — the accessibility contract

frotzplay is built for people who use screen readers, and for everyone else too. This page is the contract: what the player promises, each promise's WCAG success criteria, and how it's checked. A change that breaks any of these doesn't ship.

**Target:** WCAG 2.2 AA throughout (which also meets 2.1 AA, the ADA Title II standard), and AAA contrast (7:1) for all text in the default dark theme.

**How it's checked:** every statement marked **P** has a Playwright test of the same ID in `packages/player/e2e/`, run in Chromium, Firefox and WebKit on every push; **A** means axe (WCAG 2.0–2.2 A and AA rules, plus AAA contrast where the statement says so) in every state listed below; **U** is a Vitest unit test in `packages/player/test/`; **N** is the NVDA checklist at the end of this page, done by hand before each release.

**Found a problem?** Please [open an issue](https://github.com/cschweda/frotzlens/issues/new?labels=accessibility) (or use *About → Report a problem* on the site). Say what you used (screen reader, browser, system) and what happened. Accessibility problems are treated as bugs, not requests.

---

## Output

| ID | The player promises | WCAG | Checked by |
|---|---|---|---|
| O1 | The story text is a labelled region ("Story") of one block per turn: your command, then the story's reply. You can read it line by line in browse mode. It is not itself a live region. | 1.3.1, 4.1.2 | P, N |
| O2 | Each turn is announced once, as one block, through a polite live log: never word by word. | 4.1.3 | P (one announcement per turn over a whole walkthrough), N |
| O3 | A **verbosity** setting: *the story's reply* (default) announces the reply only; *everything, with your command* adds your command, blank lines and the prompt; *the reply; status only when asked* also stops status-line announcements. The text on screen always shows everything. | 1.3.1 | U, P |
| O4 | The status line is announced only when it changes, in its own polite region, never as a grid. Version 3 games: a sentence ("West of House. Score 0, moves 3."; "Kitchen. 9:30." in timed games). Later versions: the top row's text, with runs of spaces collapsed. | 4.1.3 | U, P (no announcement when unchanged; v3 and v5), N |
| O5 | When a game uses the upper window for more than a status line (menus, maps, quote boxes), it's shown as lines of text, labelled "Upper window", and **Read upper window** (button, and Alt+Shift+U) announces it. | 1.1.1, 1.3.1 | P, N |
| O6 | Text styles carry no meaning the game didn't give: bold is `<b>`, italic `<i>`, reverse video and fixed-pitch are styling only. Game colours are shown as versions that stay readable in the theme; colour is never the only signal. | 1.3.1, 1.4.1, 1.4.3 | U, A |
| O7 | A game's fixed-width layouts (maps, boxes) scroll sideways inside their own block, never the page. | 1.4.10 | U, P |
| O8 | Timed input is announced ("The game will go on in 10 seconds unless you type"), and can be paused (a button beside the command line) or turned off (Settings). Paused or off, the game's timer routine isn't called. | 2.2.1 | U, P, N |

## Input

| ID | The player promises | WCAG | Checked by |
|---|---|---|---|
| I1 | The command line is a labelled text field ("Command"), focused when the story starts and still focused after every turn. The player never moves focus anywhere else on its own. | 2.4.3, 3.2.1, 4.1.2 | P (over a whole walkthrough), N |
| I2 | Up and Down arrows step through your earlier commands. | 2.1.1 | P |
| I3 | When the story wants a single key ("Press any key"), it says so, and the same field takes the key. | 3.3.2, 4.1.3 | U, P, N |
| I4 | Everything works from the keyboard: every control and every dialog. No keyboard trap. A dialog closes with Escape or its Close button, and focus goes back to what opened it. | 2.1.1, 2.1.2, 2.4.3 | P |
| I5 | Every control shows a visible focus outline (3 px, amber), never hidden behind other parts of the page. | 2.4.7, 2.4.11 | P, A |
| I6 | Every keyboard shortcut is listed under **Keyboard shortcuts**, and each can be changed or turned off. None is a single character key. | 2.1.4 | U, P |
| I7 | Every control is at least 24 × 24 CSS pixels (most are 44). Nothing needs a gesture. | 2.5.8, 2.5.1 | P |

**The default shortcuts** (all changeable or off): Alt+Shift+U read the upper window · Alt+Shift+L repeat the status line · Alt+Shift+Z undo · Alt+Shift+S save · Alt+Shift+R restore · Alt+Shift+O settings · Alt+Shift+K the shortcuts list. On a Mac, Alt is Option. They match the physical key, so they work on any keyboard layout.

## Presentation

| ID | The player promises | WCAG | Checked by |
|---|---|---|---|
| R1 | Dark by default, and every piece of text in the dark theme at 7:1 contrast or better (story text 14.25:1, quieter text 8.32:1, the amber 9.32:1). | 1.4.3, 1.4.6 | A (AAA contrast) |
| R2 | A light theme (4.5:1 or better) and a high-contrast theme (white on black, 7:1 or better everywhere). The choice is remembered in this browser. | 1.4.3, 1.4.6 | A, P |
| R3 | Text can be made twice as large with nothing lost, and the page fits a 320-pixel-wide screen without sideways scrolling. | 1.4.4, 1.4.10 | P |
| R4 | Larger line, paragraph, letter and word spacing (WCAG's 1.4.12 values) lose nothing; Settings has its own line-length, line-spacing and letter-spacing controls. | 1.4.12 | P |
| R5 | Reduced motion is honoured (the system setting, or Settings); a system that asks for more contrast starts in the high-contrast theme. Nothing flashes. | 2.3.1, 2.3.3 | P |
| R6 | A dyslexia-friendly font (OpenDyslexic) and a monospace font are settings. | — | P |

## Structure and messages

| ID | The player promises | WCAG | Checked by |
|---|---|---|---|
| S1 | One main landmark, a skip link to the command line, and the story's title as the page title. The command line and the controls are named landmarks or groups. | 1.3.1, 2.4.1, 2.4.2 | P, A |
| S2 | "Saved", "Restored", "Autosaved" and "Transcript saved" are status messages, in words. | 4.1.3 | P |
| S3 | Errors are in words and say what to do: a story that won't load, a save file that won't restore ("That save file is from a different story…"), or a story that stops ("…You can go back one turn, or start again", with buttons for both). | 3.3.1, 3.3.3 | U, P |
| S4 | Every dialog is named by its heading. | 2.4.6, 4.1.2 | P, A |

## The states axe checks

The start of a story; after five turns; a version 3 story with its status line; a story with a split upper window; waiting for a key; a timed read counting down; each dialog open (Settings, Keyboard shortcuts, Restore); a status message; an error; each theme; 320 pixels wide; text at 200%.

---

## The NVDA checklist (by hand, before each release)

Use the player's dev page (`pnpm --filter @frotzinc/player dev`, then http://localhost:4180) or the site, with NVDA on Windows, in Firefox and Chrome. Start each story fresh (`?autosave=off`).

**The Dark Cellar** (`?story=dark-cellar.z5`):

1. On load, NVDA lands in the command field and says "Command, edit". *(I1)*
2. Type `look`, Enter. NVDA reads the room description once, as one passage, without your command. Focus stays in the command field. *(O2, I1)*
3. Type `down`. NVDA reads the reply, then the status line once: "Darkness Score: 0 Moves: 1" (a version 5 story: its top row, as text). *(O4)*
4. Type `look` again. The status line isn't read again (it hasn't changed). *(O4)*
5. Press Alt+Shift+L: the status line is read. *(O4)*
6. Settings (Alt+Shift+O): choose *Everything, with your command*; Escape. Type `inventory`: NVDA now reads "> inventory" before the reply. Focus returned to the command field when the dialog closed. *(O3, I4)*
7. Choose *The reply; status only when asked*. Type `up`: the status line isn't read; Alt+Shift+L reads it. *(O3)*
8. In browse mode (NVDA+Space), arrow up through the Story region: each turn reads as your command, then the reply. The status messages and the upper window are reachable. *(O1)*
9. Save (Alt+Shift+S): NVDA reads "Saved: the-dark-cellar.qzl, in your downloads." *(S2)*
10. Restore (Alt+Shift+R): the dialog is announced by name; choose the file; NVDA reads "Restored from …". Choose a file that isn't a save: NVDA reads the error and what to do. *(S2, S3, S4)*
11. Keyboard shortcuts (Alt+Shift+K): the table reads with its column headers; change one, and NVDA reads "Set to …". *(I6)*

**Upper window (test)** (`?story=upper.z5`):

12. On load, NVDA reads "Upper Room Turns: 0" once. Type `wait`: it reads "Upper Room Turns: 1". *(O4)*
13. Alt+Shift+U reads "Upper window: Upper Room Turns: 1. Map: north to the Hall. south to the Garden." *(O5)*

**Timed (test)** (`?story=timed.z5`):

14. NVDA reads "The game will go on in 1 second unless you type." Press the Pause timer button: "Timer paused."; nothing more happens until you resume. *(O8)*
15. Type `hello`, Enter. NVDA says the story wants a key, and the field is now "Press any key". Press `x`: NVDA reads "Key: 120". *(I3)*

**Version 3** (`?story=puny-dark-cellar.z3`):

16. On load, NVDA reads "Hall. Score 0, moves 0." *(O4)*

Write down anything that reads oddly, twice, or not at all, with the NVDA and browser versions, and open an issue.
