# frotzplay — Phase 2: State (Quetzal, undo, snapshots, conformance)

**Document 12 · frotzplay Phase 2** (design: [`frotzplay-design.md`](frotzplay-design.md) §8.1, §9; Phase 1: [docs/11](11-frotzplay-phase-1-interpreter.md))
**Status:** done 2026-11-07 (§6).
**Deliverable:** saves as Quetzal 1.4 files that restore in ZVM and the other way round; snapshots of the whole machine for autosave; determinism with timer events; the Praxix and Czech conformance suites passing.

> **Exit criteria:** a story saved here restores in ZVM, and one saved in ZVM restores here, with the same transcript afterwards as an uninterrupted run; the two save files decode to the same memory and stack; a snapshot taken mid-game and restored into a fresh machine plays on identically; Praxix "All tests passed", Czech 0 failures in v3/4/5/8, both identical to ZVM's output; `pnpm -r test` green.

---

## 1. Licences (established first, as the kickoff asks)

- **Praxix** (Zarf and Dannii; IF Archive `infocom/interpreters/tools/praxix.zip`, 2019): *"Public domain, but please share your changes so we can improve the tests."* Its indirect-variable test is © 2003 Amir Karger, under Czech's licence.
- **Czech 0.8** (Amir Karger; `czech_0_8.zip`, 2003): *"The copyright holder hereby grants the rights of usage, distribution and modification of this software to everyone and for any purpose, as long as this license and the copyright notice above are preserved and not modified."*

Both are usable. Their sources go into `packages/zmachine/test/conformance/` unchanged, with their notices and a provenance README, and are compiled at test time. Their expected output is ZVM's (the oracle), plus each suite's own pass/fail summary.

**What they found:** `@print_char 0` must print nothing in any stream (§3.8.2.1); it was going into stream 3. Fixed. And the 'zvm' header profile now claims Standard 1.1, not ZVM's 1.2: a story may act on the claim (Praxix calls 1.2's `@gestalt`), and 1.1 is what this implements.

## 2. Saving and restoring

- **`@save` and `@restore` stop the machine** (`{ kind: 'save', data }`, `{ kind: 'restore' }`); the host stores the file or supplies one, and calls `resume({ saved: boolean })` or `resume({ restore: bytes | null })`. A save the host can't keep, a cancelled restore, or a file for another story or a damaged one is a failed save/restore as the story sees it (v3 branch not taken, v4+ 0), and `resume()` returns a `bad-save` notice in words for the UI. The game goes on.
- **The file is Quetzal 1.4**: `IFhd` (release, serial, checksum, the PC of the save instruction's store byte, or branch in v3), `CMem` (XOR with the original dynamic memory, runs of zeros as `0, n−1`), `Stks` (frames: return PC, flags with the local count and the discard bit, result variable, arguments-supplied bits, eval stack count, locals, eval stack). Reading also takes `UMem`, and skips chunks it doesn't know.
- **After a restore** (§8.6.1.3, as ZVM does): Flags 2 kept, the header rewritten, the random stream back to session mode, and in v3 the upper window collapsed.
- **The auxiliary-file forms** (`@save table bytes name`, v5+) fail, as the Standard allows; Inform's libraries don't use them.

## 3. Snapshots

`machine.snapshot()` returns the whole machine as plain data: dynamic memory, frames, PC, random state, screen, streams, any pending input, counters, the undo ring. `Machine.fromSnapshot(story, snapshot, options)` makes a machine in exactly that state. This is what autosave (Phase 3/4) stores and what a worker posts; it isn't Quetzal, because autosave happens while waiting for input, where Quetzal has no PC to name.

## 4. The oracle

`@frotzinc/zmachine-oracle` gains `runReplay(…, { files })`: a `Map` of save files the headless GlkOte answers file prompts from (saves write into it, restores read from it), so ZVM can save and restore in tests.

## 5. Tests

- Round trip here: `save`, play on, `restore`, and the game is back where it was saved.
- Across: frotzplay's save restored in ZVM, ZVM's restored here; every pair (saver × restorer) gives the same transcript after the restore. The two save files decode to the same dynamic memory and frames.
- Snapshots: a snapshot mid-game, restored into a fresh machine, plays the rest of the walkthrough identically.
- Determinism: a script with `[timeout]` events, seeded, twice: the same.
- Conformance: Czech v3/4/5/8 and Praxix, identical to ZVM and passing.

## 6. Done

- **Saves cross over.** For a story of each version (v3, v4, v5, v8), a save made here and one made in ZVM are **the same bytes** (with the same Standard revision claimed), and each restores in both interpreters with the same transcript after. Round trips here undo what happened after the save. A missing, damaged or other story's file fails the restore and says why in words; a save the host can't keep fails as the story sees it.
- **Snapshots** taken mid-game, serialised through JSON, and restored into a fresh machine play on identically; another story's snapshot is refused.
- **Conformance:** Czech 0.8 passes every test in v3, v4, v5 and v8 (349, 367, 406, 406) with output identical to ZVM's; Praxix: "All tests passed." Praxix found one bug (`@print_char 0` reached stream 3), now fixed.
- **Determinism** with timer events was already covered in Phase 1 (`test/timed.test.ts`).
- **Header:** `header.standard` lets a test claim ZVM's 1.2 (for byte-for-byte comparisons); otherwise every profile claims the 1.1 this implements. The Inform library copies the claim into a global (`standard_interpreter`), which is why save files differ in two places unless the claims match.
- zmachine: 226 tests; the monorepo builds and tests green.
