# Phase 6 (proposed): decompiling to Inform 6

A design for review before any code. It turns an Inform-compiled story file back into Inform 6 source that reads like Inform and compiles. The master design called this "the prize" (§3, out of scope for v1).

## 1. Goal, and what "done" means

**Goal.** From a story file made by Inform 6 (versions 5 and 8 with the Standard Library, which can't target 3 or 4; versions 3, 4, 5 and 8 with PunyInform or no library: every version Frotzlens reads), produce one `.inf` file. It should read like something a person wrote, and recompile, with the same Inform and the same library, to an *equivalent* story.

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

**What Frotzlens would add:**
- structured control flow instead of jumps;
- library code recognised and left out, as an `Include`;
- the game's real names from `gameinfo.dbg` when there is one;
- **proof by recompiling**, which Reform has no way to do;
- all of it in the browser, beside the disassembly.

The proof is possible because Frotzlens already has Inform 6.44 in WebAssembly (`@frotzinc/inform6-wasm`) and a parser to compare stories with.

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

## 5a. Progress: 6a with a debug file (2026-11-07)

`decompileInform(story, { symbols })` in `@frotzinc/zcode` writes the `.inf`. This first cut needs the story's `gameinfo.dbg`; working without one (§3a's matching) is the rest of 6a.

**What it writes**
- `!%` switches when the story shows them (strict mode off; PunyInform's `$OMIT_UNUSED_ROUTINES`), `Release`, `Serial`, and a `Replace` for each library routine the game wrote its own of.
- The game's constants, globals, arrays, attributes, properties, classes and objects, in the source's order, with each library `Include` placed as late as the numbering allows.
- **Classes from the story itself.** Inform keeps each class's prototype (its attributes and the common properties its instances inherit) right after the class object's property table, so a class is written exactly, and an instance only with what it adds.
- **Properties in the order the compiler met them,** found from the strings and embedded routines they hold (Inform lays both out in that order), and the game's individual properties declared in number order before the first object that has one.
- **Grammar:** only what the game added to the library's, as `Verb`, `Extend` (`first`, `last` or `replace`) and `Verb 'new' = 'old'`, by comparing with the library's own grammar (`src/inform/library.generated.ts`, from an empty game compiled with each library).
- **Routines as Inform assembly,** with routines, strings, dictionary words, arrays, forward-declared objects and actions (`##Take`, where an action is compared or passed to `R_Process`) by name. A number can be the address of more than one of those (a word's address can also be a routine's packed address), so where it is decides which is tried first:
  - in code: a dictionary word, then a string, a routine, an array;
  - in a property: a routine, then a string, a word, an array;
  - in an array or a global's starting value: a string, then a routine, a word, an array;
  - in the veneer: only its own strings (its other numbers are masks and table addresses).
- The veneer, as assembly, at the end: the routines above call it by name, which Inform only allows when the source defines it.

**Proof** (`test/decompile.test.ts`): each of the 12 debug fixtures (Standard Library, PunyInform and library-free; all version 5, since the v3, v4 and v8 fixtures are built without debug files) is decompiled, compiled again with `inform6-wasm`, and compared part by part. All 12 are equivalent; 11 are the same bytes after the header (the first 64 bytes, which interpreters change, aren't compared). mingus-1 lists one property name in a different place in Inform's identifier table, which nothing reads.

**Known limits, for the next steps**
- The veneer's own numbers are addresses of the story's tables (where the strings start, the class table), which Inform names only inside the veneer. They're right when the rebuilt story keeps the original layout, as every fixture's does. 6d removes the veneer from the output by writing its calls as the syntax that makes them.
- PunyInform's compact grammar (GV3) keeps routine tokens in a way not yet read; a game line with one is left out and reported.
- A file the story included that isn't one of the library's (the game's own, or an extension `inform6-wasm` doesn't have) is written out as the game's, and reported.
- Versions 3, 4 and 8 aren't proved yet: no debug fixture is built for them.

## 6. Risks

- **Library versions we haven't compiled.** The matches cover the versions `inform6-wasm` has (6.12.x, PunyInform). A story built with a different version decompiles with its whole library emitted as game code and no `Include` (§3a), so nothing is declared twice: correct, just longer.
- **Compiler versions.** Code generation changed across Inform 6 releases, so the round trip uses the fingerprinted version. Where we don't have that version, the check is "equivalent", not "identical".
- **Hand-written assembly and odd code.** The `@`-assembly fallback means the output still compiles.
- **Whose work it is.** A decompiled game is still its author's. The app should say so in the Source view, and the docs should too.

## 7. Decisions (2026-11-07)

1. **Scope:** Inform 6 first. ZIL output (to ZIL source) comes later, as its own phase.
2. **Output style:** the Inform 6 style of Frotzsmith's samples:
   - spaces, never tabs: four to indent a routine's body, two before `with` and `has`;
   - `Object -> name "short name"`, then `  with ` and the properties one to a line, lined up under the first, ending `,`; then `  has  ` and the attributes, ending `;`;
   - routines as `[ Name local1 local2;`, the body indented four spaces, closed by `];`;
   - `! ---` banner comments over each section (the header, the includes, the objects, the routines, the grammar).
3. **Order:** the Source view stays hidden until 6c, when the routines read well. Until then the app has a **Source** entry, tagged *in progress*, that says how far each step has got (`apps/web/app/utils/decompiler.ts` holds the steps and their state).
