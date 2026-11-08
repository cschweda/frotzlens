# frotztrace — Phase 3: The Inform Layer

**Document 20 · frotztrace Phase 3** (frotztrace's design: [`frotztrace-design.md`](frotztrace-design.md) §5.3, §5.6, §10)
> **Status: built** (2026-11-08). Settled while building: an action breakpoint stops when the library *begins* the action (after `InformLibrary.begin_action`, or PunyInform's `PerformAction`, sets `second`), because the parser writes `action` earlier, while `noun` still holds the last turn's; without symbols naming that routine it falls back to the write to `action`. `MachineView` is the Debugger's, re-exported by `zcode-ui` 0.1.1.

**Deliverable:** names, source lines and Inform's `action`/`actor`/`noun`/`second`; line, action, text, write, property and attribute breakpoints, with conditions; the expression language and watches; `MachineView` for the UI. The CLI gains `--break action:Take`, `--if`, `--watch`, `--save-at` and `--quetzal`. Done when `frotztrace dark-cellar.z5 --script walk.txt --break action:Take` stops at the right instruction and prints a named stack — with no debug file.

---

## 1. Where the names come from

- **With the debug file** (`gameinfo.dbg`): `@frotzinc/zcode`'s `readSymbols`, as frotzlens reads it.
- **Without it:** `zcode`'s `findReference` + `inferSymbols` (frotzlens Phase 6): compile the library alone with `@frotzinc/inform6-wasm`, match its routines and globals against the story's by shape, and name them. That finds the library's `action`, `actor`, `noun` and `second` globals and every action's name (`Take`, from `TakeSub` in the grammar), so `--break action:Take` works on a bare story file. The game's own routines and globals get made-up names (`g12`), and source lines need the debug file.
- **Source lines** need something `zcode` doesn't read yet: Inform's per-statement *sequence points*. The debug file has one per statement (6 289 in the magic-8-ball fixture), each an address and a file/line. `readSymbols` gains `Symbols.lines`, every sequence point sorted by address: additive, in `zcode` (one decoder in the family).

The debugger takes `symbols` as an option (or later, with `setSymbols`), so the CLI and the app decide where they come from; `zmachine` never compiles anything.

## 2. Additions to the Debugger (additive to Phases 1–2)

```ts
interface DebuggerOptions { symbols?: Symbols }
class Debugger {
  setSymbols(symbols: Symbols | undefined): void
  /** Inform's action/actor/noun/second, by name, when the symbols name those globals. */
  inform(): InformState | undefined
  /** The source line of `pc` (default: the PC), from the sequence points. */
  sourceLine(pc?: number): SourceLine | undefined
  /** Until the source line changes (or the routine returns): a step by line. */
  stepLine(budget?: number): DebugStop
  // watches: re-evaluated at every stop; `changed` against the previous stop
  addWatch(expression: string): Watch
  removeWatch(id: number): void
  watches(): Watch[]
  /** What the UI lights: the PC, the frame, and what changed since the previous stop. */
  view(): MachineView
  /** Evaluate an expression now (the app's hover, the CLI's --if). */
  evaluate(expression: string): { value: number } | { error: string }
}

type BreakpointSpec = (
  | { kind: 'address'; address: number }
  | { kind: 'routine'; routine: number }
  | { kind: 'line'; file: string; line: number }            // the first sequence point of that line
  | { kind: 'action'; action: number }                      // when `action` is set to it
  | { kind: 'text'; text: string }                          // when printed text contains it (any case)
  | { kind: 'write'; address: number; length?: number }     // when memory there is written
  | { kind: 'property'; object: number; property: number }  // when that property's value is written
  | { kind: 'attribute'; object: number; attribute: number }// when that attribute is set or cleared
) & { condition?: string }

// a hit also says what happened: "action Take (noun: brass lantern)", "lantern.description: 0 → 1"
type DebugStop = … | { kind: 'breakpoint'; breakpoint: Breakpoint; detail?: string }

interface InformState { action?: Named; actor?: Named; noun?: Named; second?: Named }
interface Named { value: number; name?: string }
interface SourceLine { file: string; line: number }
interface Watch { id: number; expression: string; value?: number; error?: string; changed: boolean }
interface MachineView { pc: number; frame: number; changed: { addresses: ReadonlySet<number>; objects: ReadonlySet<number>; globals: ReadonlySet<number> } }
```

**When each kind stops.** Address, routine and line: before the instruction runs. The others are about something an instruction *did*, so they stop after it, with the PC at the next instruction, as a routine breakpoint does. A **condition** is evaluated at the moment a breakpoint would fire; it fires only if the condition is true (non-zero). A condition that doesn't parse is refused when the breakpoint is added; one that can't be evaluated there (a local that doesn't exist in this routine) doesn't fire, and its error is kept on the breakpoint.

**`MachineView`** moves from `zcode-ui`'s placeholder (Phase 0) to `zmachine`, the same shape; `zcode-ui`'s `utils/live.ts` re-exports it. "Changed" is every write since the previous stop: the addresses, the globals among them, and the objects whose entry or property table they fall in.

## 3. The expression language

Small, and with no side effects (open question 3: no routine calls). 16-bit values; arithmetic and comparisons are signed, as Inform's are.

```
expr     := or
or       := and ('||' and)*
and      := not ('&&' not)*
not      := '!' not | compare
compare  := sum (('=='|'~='|'!='|'<'|'>'|'<='|'>=') sum | ('has'|'hasnt') attr | 'in' sum)?
sum      := product (('+'|'-') product)*
product  := unary (('*'|'/'|'%') unary)*
unary    := '-' unary | postfix
postfix  := primary ('.' property)*                 // obj.prop: the property's value (a word, or a byte)
primary  := number | '$'hex | '0x'hex | name | 'parent' '(' expr ')' | 'child' '(' … | 'sibling' '(' … | '(' expr ')'
```

A **name** is, in order: a local of the current routine (by its source name, or `L00`), a global (`score`, or `G05`/`g5`), an object (by its source name, or its short name in quotes: `"brass lantern"`), a constant from the debug file, an action (`##Take`). `true` and `false` are 1 and 0. Errors are words: "no global, local or object called lantren".

## 4. The CLI

```
frotztrace game.z5 --script walk.txt
  --break action:Take               an action (needs names: --symbols, or inferred)
  --break line:dark-cellar.inf:42   a source line (needs --symbols)
  --break text:"You can't"          printed text
  --break Routine | 0x27f8          a routine (as before)
  --if 'noun == lantern'            a condition on the --break before it
  --watch 'score, lantern has on'   print each change, turn by turn
  --save-at 3 out.qzl               after turn 3, type SAVE and write the story's own save file
  --quetzal in.qzl                  read a save: its stack, globals and action/noun/second, by name
```

Without `--symbols`, names are inferred when a feature needs them (an action, a named routine, a watch with a name): it compiles the library with `@frotzinc/inform6-wasm`, which takes a few seconds and is said on stderr. **`--save-at` uses the story's own SAVE**, because a Quetzal file is only valid at a `save` instruction (its PC is the save's store byte): the transcript gains that one SAVE turn, and the file restores in any interpreter. The stack, at a breakpoint, names routines and locals, and shows the source line of each frame when there are sequence points.

## 5. Tests

- **zcode:** `readSymbols` reads sequence points: count, order, a known line's address, in the fixtures' debug files.
- **Expressions:** every operator, signedness, precedence, `has`/`hasnt`/`in`, `parent`/`child`/`sibling`, `obj.prop` (byte and word properties), names in each namespace and their order, errors in words, no side effects (memory unchanged after any evaluation).
- **Breakpoints:** each new kind on the Dark Cellar fixture, with its debug file: `action:Take` stops right after `action` is set, with `noun` the lantern; a property write; an attribute change (`light`); printed text; a source line; a condition that holds and one that doesn't; a condition with an error.
- **Watches:** values and `changed` across stops; **view():** the changed sets after a turn.
- **Inference:** the same `action:Take` stop on `samples/dark-cellar.z5` with names inferred, no debug file.
- **CLI:** the deliverable command (exit 2, the named stack, `action Take` in the detail); `--if`; `--watch` output; `--save-at` writes a file `readQuetzal` accepts and that restores in `play()`; `--quetzal` prints the stack and globals.
