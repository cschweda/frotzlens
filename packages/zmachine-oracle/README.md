# @frotzinc/zmachine-oracle (private, test-only)

The ZVM oracle for [`@frotzinc/zmachine`](../zmachine)'s differential tests: frotzsmith's headless ZVM replay (`runReplay`), vendored. Every sample's walkthrough must give the same normalized transcript here and in `@frotzinc/zmachine`.

**GPL-3.0-or-later, `private`, never published, never bundled.** It is a dev dependency of `@frotzinc/zmachine`'s tests only; nothing it contains reaches an MIT package's `dist`. ZVM (`ifvms`) and GlkOte (`glkote-term`) themselves are MIT.

## Vendored from

[frotzsmith](https://github.com/cschweda/frotzsmith) `app/modules/inform6/engine/` at commit `cf87b65` (2026-11-07). Each file says what changed:

| File | Changed |
|---|---|
| `replayCore.ts` | `options.seed`, `options.files`; returns the header ZVM wrote. |
| `ZmachineEngine.ts` | Keeps the VM so `header()` can read it back; passes `files` to the dialog. |
| `headless-dialog.ts` | Given a `Map`, keeps save files in it. |
| `headless-glkote.ts` | With files, answers save/restore prompts with the file `save`. |
| `StoryEngine.ts` | Z-machine only; `BootOptions`. |
| `glk.ts` | Node only (the browser branch, an indirect `eval`, is gone). |
| `normalizeTurnOutput.ts`, `parseScript.ts` | Unchanged but for `.js` on relative imports (this repo is NodeNext). |
| `random.ts` | New: mulberry32, the same as `@frotzinc/zmachine`'s. |

## What it can't check

- **Save and restore:** only with `{ files }` (an in-memory store); without it, file prompts are cancelled.
- **Timed input:** no timers are run.
- **Character input:** a `@read_char` ends the replay.
- **The status line:** the grid is kept apart from the transcript (`status`), and only changed lines arrive, so it isn't compared.

## Randomness

ZVM draws from `Math.random` whenever its xorshift seed is 0: at start, restart and restore, and after `@random 0`. With `{ seed }`, `runReplay` replaces `Math.random` with the mulberry32 stream from that seed for the run, which is what `@frotzinc/zmachine`'s `session` random mode draws from. A game's `@random -n` then switches both to ZVM's xorshift, seeded alike.
