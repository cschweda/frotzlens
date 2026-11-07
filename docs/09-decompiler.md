# Phase 6 (proposed): decompiling to Inform 6

A design for review before any code. It turns an Inform-compiled story file back into Inform 6 source that reads like Inform and compiles. The master design called this "the prize" (§3, out of scope for v1).

## 1. Goal, and what "done" means

**Goal.** From a story file made by Inform 6 (versions 5 and 8 with the Standard Library, which can't target 3 or 4; versions 3, 4, 5 and 8 with PunyInform or no library: every version frotzlens reads), produce one `.inf` file. It should read like something a person wrote, and recompile, with the same Inform and the same library, to an *equivalent* story.

**Equivalent** is defined in §4, and it's what makes this checkable rather than a matter of taste:
- the same object tree, properties, attributes, dictionary, grammar and strings;
- every routine doing the same thing.

Byte-identical output isn't the bar. Addresses and the order of routines can move, and that's fine.

**Not goals (for this phase):**
- Recovering comments, layout, macros or the original file split. They aren't in the story.
- ZIL output, and Infocom's own games. Both are possible later; the model already reads their grammar.
- Glulx.

## 2. What exists already

**Reform** (Ben Rudiak-Gould, 2004, Haskell; [IF Archive](https://ifarchive.org/indexes/if-archive/infocom/tools/reform)) decompiles Z-code to Inform 6. It comes with symbol files for Infocom's games, made by Allen Garvin, Ben Rudiak-Gould and Ethan Dicks. People who've used it describe the output as low-level Inform, impractical to keep working on ([intfiction.org](https://intfiction.org/t/inform-6-to-inform-7/13363)). The [IFWiki list of decompilers](https://ifwiki.org/Decompiler) has Reform's siblings for other systems: Mrifk (Glulx), Scads (TADS) and Victor (Hugo).

**What frotzlens would add:**
- structured control flow instead of jumps;
- library code recognised and left out, as an `Include`;
- the game's real names from `gameinfo.dbg` when there is one;
- **proof by recompiling**, which Reform has no way to do;
- all of it in the browser, beside the disassembly.

The proof is possible because frotzlens already has Inform 6.44 in WebAssembly (`@frotzinc/inform6-wasm`) and a parser to compare stories with.

## 3. The pipeline

Everything starts from the model `@frotzinc/zcode` already builds: routines and typed instructions, objects, the dictionary, grammar, strings, globals, cross-references, the fingerprint and, when present, symbols.

**a. Separate the library from the game.** The fingerprint already names the library and its version.
- Library routines are recognised by comparing them with the library compiled by `inform6-wasm` (an empty game, for each library version we have the source for).
  - The opcode-and-locals shape the veneer check uses today isn't enough here, since a game routine could share it, and a false match would drop game code. A routine counts as library only when its **whole instruction stream matches**, operands included (addresses compared by what they point to), **and** it sits where the library's routines sit, among the other matches.
  - A recognised routine is left out; the output says `Include "Parser"; …` instead.
  - A library routine the game replaced keeps its name but not its shape, so it becomes a `Replace` and is emitted.
  - **When in doubt, nothing is left out.** If the library can't be matched with confidence (an unknown version, a modified copy), the whole library is emitted as game code with no `Include`, so nothing clashes with a second copy. The output is longer but still compiles.
- Library objects (compass directions, `thedark`, the player), library grammar and library globals are left out the same way.

**b. Declarations.** Each comes from the model, with names from symbols or made up (§3f):
- `Attribute`, `Property`, `Global` and `Array`, for the game's own.
  - Arrays are found from symbols. Without them, every block of static or dynamic memory that isn't an object, a property, a table or a string is kept, byte for byte, as an `Array` (a `->` byte array unless only word access is seen). Accesses with `loadw`, `storew`, `loadb` and `storeb`, and constants that point into the block, decide only where one array ends and the next begins and whether it's words or bytes. So memory nothing is known to read is never dropped, and the layout survives.
- **Classes** are declared with `Class`, not `Object`: the class objects are the children of the metaclass object `Class` (object 1), and each object's classes are in common property 2, so `ofclass` and `C.create()` keep working.
- **Objects:** `Object` (or `C name` for an object of class `C`), with the tree as `->` nesting, attributes as `has`, and properties written as what they hold:
  - a routine becomes an embedded routine, or a named one if it's shared;
  - a string becomes `"…"`, a dictionary word `'…'`, an object its name;
  - anything else is a number.
- **Grammar:** `Verb 'take' 'get' * multi -> Take;` and its tokens. The model already decodes this, and txd already prints it.

**c. Routines.** This is the hard part, done in stages:

| Stage | What it does |
|---|---|
| Control flow | The branches and jumps (all decoded already) give a graph per routine. Dominators and post-dominators let it be rebuilt as `if`/`else`, `while`, `do … until`, `for`, and `switch` (from chains of `je` on the same value). The method is *pattern-independent structuring*: what no pattern explains stays a `jump` to a `.label`, which Inform allows. So the output always compiles, and gets nicer as the patterns improve. |
| Expressions | The Z-machine is a stack machine. Following the stack through each block turns pushes and pulls into nested expressions, and `-> var` into assignments. A table maps opcodes to Inform: `add` is `+`, `je` is `==` (and `or`), `test_attr` is `has`, `jin` is `in`, `get_prop` is `.`, `print_ret "…"` is `"…";` and so on. |
| Veneer idioms | Inform compiles `obj.prop()`, `obj.prop`, `x ofclass C` and strict-mode checks into veneer calls (`CA__Pr`, `RV__Pr`, `OC__Cl`, `RT__Ch…`). The fingerprint knows those routines, so the calls turn back into the source's syntax. Here the veneer recognition built in Phase 5 pays off. |
| The rest | Anything not understood stays as Inform's own assembly, `@opcode operands;`, which compiles exactly. |

**d. Names.**
- **With a debug file:** the source's names everywhere: routines, locals, globals, objects, properties, attributes, actions and arrays.
- **Without one, made up from what the story says:**
  - objects from their short names (`brass_lantern`);
  - routines from their role: an object's `before` routine, an action routine `TakeSub`, the library's entry points (`Initialise`);
  - the library's property and attribute names, which are fixed;
  - otherwise `r_4f4` or `g12`.

**e. Emit.** One `.inf`, laid out the way Inform games usually are:
- a header comment saying what made the story and what was left out;
- constants;
- `Include "Parser"`, then the game's objects, routines and grammar, then `Include "VerbLib"` and `"Grammar"`.

## 4. Proof: compile it again

This is the part that makes the output trustworthy, and the main test:

1. Decompile a story, then compile the result with `inform6-wasm`, using the same compiler version and library the fingerprint names.
2. Parse both stories with `@frotzinc/zcode` and compare them, part by part:
   - the object tree, attributes and properties (with addresses replaced by what they point to);
   - the globals' starting values and the arrays' contents and sizes, in the same way;
   - the dictionary, the grammar, and the strings as a set;
   - each routine's instructions, normalised (addresses and the order of routines don't count; locals and the stack do).
3. Report each part as **identical**, **equivalent** or **different**.

**The corpus is the fixtures and samples.** We have their real source, so the comparison runs against the original's story as well. That gives a hard check, not an opinion. The phase is done when every fixture and sample round-trips to *equivalent*, in CI.

## 5. Phasing

| Step | What | Proof |
|---|---|---|
| 6a | Library separation and declarations: objects, classes, attributes, properties, globals, arrays, grammar. Routines as `@`-assembly bodies. | Recompiles. Tables identical. Routines equivalent by definition. |
| 6b | Expressions: the stack, operators, calls, prints. | Routines equivalent. |
| 6c | Control flow: `if`, `while`, `for`, `switch`. `jump` where no pattern fits. | Routines equivalent. Count the jumps left, and push them down. |
| 6d | Veneer idioms and names, with and without a debug file. | Routines equivalent. Read the output against the original source. |
| 6e | In the app: Download `.inf`, and the Source view polished, per routine and for the whole game (the view itself shows source from 6c, §7). In the CLI: `frotzlens --inform`. | Playwright and axe. A user who recompiles the download gets the same game. |

## 5a. Progress: 6a, with and without a debug file (2026-11-07)

`decompileInform(story, { symbols })` in `@frotzinc/zcode` writes the `.inf`, from the story's `gameinfo.dbg` or, without one, from `inferSymbols`.

**What it writes**
- `!%` switches when the story shows them (strict mode off; PunyInform's `$OMIT_UNUSED_ROUTINES`; economy mode, with an `Abbreviate` for each abbreviation in the order their text is stored), `Release`, `Serial`, and a `Replace` for each library routine the game wrote its own of.
- The game's constants, globals, arrays, attributes, properties, classes and objects, in the source's order, with each library `Include` placed as late as the numbering allows.
- **Classes from the story itself.** Inform keeps each class's prototype (its attributes and the common properties its instances inherit) right after the class object's property table, so a class is written exactly, and an instance only with what it adds.
- **Properties in the order the compiler met them,** found from the strings and embedded routines they hold (Inform lays both out in that order), and the game's individual properties declared in number order before the first object that has one.
- **Grammar:** only what the game added to the library's, as `Verb`, `Extend` (`first`, `last` or `replace`) and `Verb 'new' = 'old'`, by comparing with the library's own grammar (`src/inform/library.generated.ts`, from an empty game compiled with each library).
- **Routines as Inform assembly,** with routines, strings, dictionary words, arrays, forward-declared objects and actions (`##Take`, where an action is compared or passed to `R_Process`) by name. A number can be the address of more than one of those (a word's address can also be a routine's packed address), so where it is decides which is tried first:
  - in code: a dictionary word, then a string, a routine, an array;
  - in a property: a routine, then a string, a word, an array;
  - in an array or a global's starting value: a string, then a routine, a word, an array;
  - in the veneer: only the strings it passes to `RT__Err` (its messages); its other numbers are masks and table addresses, which in a version-8 story often equal a string's packed address.
- The veneer, as assembly, at the end: the routines above call it by name, which Inform only allows when the source defines it.

**Proof** (`test/decompile.test.ts`): each of the 16 debug fixtures (Standard Library, PunyInform and library-free; versions 3, 4, 5 and 8; one in economy mode, with abbreviations) is decompiled, compiled again with `inform6-wasm`, and compared part by part. All 16 are equivalent; 15 are the same bytes after the header (the first 64 bytes, which interpreters change, aren't compared). mingus-1 lists one property name in a different place in Inform's identifier table, which nothing reads.

**Without a debug file** (`inferSymbols`, `src/inform/infer.ts`): the symbols the debug file would have given are worked out by comparing the story with its library compiled alone.
1. **The reference.** `findReference` compiles an empty game with the story's library and switches (`referenceSource`), and tries each extension `inform6-wasm` has (frotzsmith's `Exits`, PunyInform's `ext_*.h`) and each library switch a game can set (`TASKS_PROVIDED`, `NO_SCORE`, …), keeping what makes more routines line up. Numbers a game can set (`MAX_SCORE`, `NUMBER_TASKS`, …) are found by compiling with two unusual values, seeing which operands change, and reading the story's there. The caller passes the compiler in, so `@frotzinc/zcode` doesn't depend on it.
2. **Lining up.** The story's routines are aligned with the reference's by shape (locals and opcodes); the library's come in the same order in both.
3. **Votes.** Each aligned pair is walked operand by operand: what the reference's operand names (a routine it calls, a global, an array, a string), the story's is. This names the library's routines (entry points and stubs too: the library's call to `NewRoom` is to the game's), globals, arrays, and constants the library prints (`Story`, `Headline`) or starts a global with (PunyInform's `INITIAL_LOCATION_VALUE`). A routine named by the votes but shaped differently is the game's own version.
4. **The rest is the game's,** named from what the story says: a class or a nameless object by its short name (Inform gives `"(lamp)"` to an object with none), an object by its short name, an embedded routine `obj.prop` or `Class::prop`, an action by its first verb, the rest by address or number. The game's arrays are the gaps in the array space, split where code points into them. Routines and objects are put in the order the compiler met them, from the strings and code each holds.

**Proof without a debug file** (`test/decompile.test.ts`, second half): every fixture is decompiled as if it had none, compiled again, and compared by position (the names can't match). All 16 are equivalent; 9 are the same bytes. The rest differ only in names Inform keeps as text (a property's, an action's), since the made-up names aren't the source's.

**Known limits, for the next steps**
- The veneer's own numbers are addresses of the story's tables (where the strings start, the class table), which Inform names only inside the veneer. They're right when the rebuilt story keeps the original layout. With 6d the veneer is only written out when some routine is still assembly that calls it; on every fixture it isn't.
- PunyInform's compact grammar (GV3) keeps routine tokens in a way not yet read; a game line with one is left out and reported.
- Without a debug file, only the extensions and library settings listed in `infer.ts` are tried; a story built with others decompiles with their code as the game's (correct, longer), or, for a setting that changes the library's code, a library routine that doesn't line up.
- A file the story included that isn't one of the library's (the game's own, or an extension `inform6-wasm` doesn't have) is written out as the game's, and reported.

## 5b. Progress: 6b, statements (2026-11-07)

`decompileInform(story, { symbols, statements: true })` writes the game's routines as statements where they can be: the stack is followed through each routine, so what one instruction pushes and the next pulls becomes a nested expression (`y = x*2 - g;`), a store an assignment, and prints, calls, `give`, `move`, `remove`, `++`, `style` and `return` their statements. Branches and jumps stay assembly (`if (a == b) jump L;` compiles to a branch around a jump, not one branch); 6c writes them as `if`, `while`, `for` and `switch`. A plain `push` stays assembly too: Inform only pushes a value only to pass it on in its own strict-mode scaffolding.

**Checked, in the product as in the tests:** `decompileChecked(story, symbols, compile)` compiles the source again (`src/inform/verify.ts`) and compares each routine with the original's, instruction by instruction, addresses by what they point to; a routine that differs, or whose statements don't compile (by the error's line), goes back to assembly, and it compiles again, for up to six rounds by default. What it returns says which routines are statements and lists any that still differed in the last compile (none, on every fixture), so a statement that didn't check out is never passed off as one.

**Proof** (`test/decompile.test.ts`): with and without debug files, every game routine of every fixture comes back as statements on the first try, and the stories are what they were: all 16 equivalent, the same bytes where they were before.

## 5c. Progress: 6c, control flow (2026-11-07)

With `structure: true` the routines' branches and jumps are written as Inform's control flow, wherever they're in the shapes Inform compiles it to (calibrated by compiling each form):

| Source | Compiles to |
|---|---|
| `if (C) body` | a branch (when not C) past the body |
| `if (C) A else B` | the same, A ending in a jump past B; an `else if` chain jumps straight to the end |
| `if (C1 && C2)` / `if (C1 \|\| C2)` | branches to the same place past the body / the first into the body |
| `while (C) body` | `.top`; branch out when not C; body; jump top |
| `do body until (C)` | `.top`; body; branch back when not C |
| `if (C) rtrue;` | one branch that returns (a branch past an `rtrue` is `if (C) return true;`) |
| `switch (X) { a, b: …; default: … }` | X pulled into `temp_global`, then a `je` per case, each case jumping to the end unless it returns |
| `Take, Drop: …` (an embedded routine's action cases) | a `je sw__var` per case, each ending in a return (Inform's own `rfalse` left out) |

What's in none of those shapes stays a `jump L;` (one jump) or a branch in assembly. `decompileChecked` tries each routine structured first; one that doesn't come back the same drops to flat statements (6b), then to assembly; a routine whose instructions differ is dropped before one that only moved (when one routine changes size, others' unnamed numbers move with it).

**Proof:** every game routine of every fixture is statements; in the 14 smaller fixtures every one is structured, in mingus-1 120 of 130 and architect-legacy 86 of 91. The rest are mostly where strict mode inlines its checks (`x in y` checks x is an object first), which 6d turns back into the syntax that made them. The stories are what they were.

## 5d. Progress: 6d, idioms (2026-11-07)

With `idioms: true` (on in `decompileChecked`), what Inform compiles to its veneer or to strict mode's checks is written as the syntax that makes it (calibrated by compiling each, with strict mode and without):

| Syntax | Compiles to |
|---|---|
| `o.p`, `o.p = v`, `o.p(args)`, `o.p++` | `RV__Pr`, `WV__Pr`, `CA__Pr`, `IA__Pr`; strict mode's `RT__ChPR`, `RT__ChPS` for a common property |
| `o.(expr)`, `o provides p`, `o ofclass C`, `metaclass(x)` | the same with the property computed, `OP__Pr`, `OC__Cl`, `Meta__class` |
| `move`, `remove`, `give o a` / `~a` | strict mode's `RT__ChT`, `RT__ChR`, `RT__ChG`, `RT__ChGt` |
| `print (char)`, `(string)`, `(address)`, `(object)`, `(name)`, `(property)` | strict mode's `RT__ChPrint…`, `PrintShortName`, `Print__PName` |
| `a-->i`, `a->i`, `= v` | the access with strict mode's bounds check inlined around it (`jl i 0`, `jl i N`, `RT__Err`) |
| `x in y`, `x has a` | the test with strict mode's object check inlined before it |
| `objectloop (x in p)` | `get_child`, then `get_sibling` round to the top, with strict mode's checks of p and x |
| `return (C)`, `x = (C)` | a condition as a value: branches that push 1 or 0 |

The inlined checks are taken out before the statements are written (`desugar`), and come back when the source is compiled in strict mode. **When no line is left calling the veneer by name, it isn't written out**, and the compiler writes its own: so the veneer's table addresses (6a's limit) are its own again.

**Proof:** with and without debug files, every game routine of every fixture is statements, structured and idiomatic; no fixture's game code has any assembly left, and none needs the veneer written out. The stories are what they were (with debug files, all 16 the same bytes).

## 5e. Progress: 6e, in the app and the CLI (2026-11-07)

- **The app's Source view** shows the open story's source. A worker (`decompile.worker.ts`), fetched with the compiler's WebAssembly and library texts only when the view is opened, runs `decompileChecked` with `@frotzinc/inform6-wasm`, so the check is the tests' check, in the browser. Without a loaded debug file it first finds the library (`findReference`) and makes up names. The view says how many routines came back the same, offers **Download `.inf`** and Copy, and highlights a routine linked from the Routines view (`#source/4f4`); a library routine is said to be `Include`d. The site's Content-Security-Policy allows `wasm-unsafe-eval` for this.
- **The CLI:** `frotzlens --inform game.z5 [--symbols gameinfo.dbg]` prints the checked source, says on stderr how it came out, and exits 1 if a routine still differed.

**Phase 6 is done.** What's left is in §6 (risks) and §7's later item, ZIL source.

## 6. Risks

- **Library versions we haven't compiled.** The matches cover the versions `inform6-wasm` has (6.12.x, PunyInform). A story built with a different version decompiles with its whole library emitted as game code and no `Include` (§3a), so nothing is declared twice: correct, just longer.
- **Compiler versions.** Code generation changed across Inform 6 releases, so the round trip uses the fingerprinted version. Where we don't have that version, the check is "equivalent", not "identical".
- **Hand-written assembly and odd code.** The `@`-assembly fallback means the output still compiles.
- **Whose work it is.** A decompiled game is still its author's. The app should say so in the Source view, and the docs should too.

## 7. Decisions (2026-11-07)

1. **Scope:** Inform 6 first. ZIL output (to ZIL source) comes later, as its own phase.
2. **Output style:** the Inform 6 style of frotzsmith's samples:
   - spaces, never tabs: four to indent a routine's body, two before `with` and `has`;
   - `Object -> name "short name"`, then `  with ` and the properties one to a line, lined up under the first, ending `,`; then `  has  ` and the attributes, ending `;`;
   - routines as `[ Name local1 local2;`, the body indented four spaces, closed by `];`;
   - `! ---` banner comments over each section (the header, the includes, the objects, the routines, the grammar).
3. **Order:** the Source view stays hidden until 6c, when the routines read well. Until then the app has a **Source** entry, tagged *in progress*, that says how far each step has got (`apps/web/app/utils/decompiler.ts` holds the steps and their state).
