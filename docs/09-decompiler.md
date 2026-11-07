# Phase 6 (proposed): decompiling to Inform 6

A design for review before any code. It turns an Inform-compiled story file back into Inform 6 source that reads like Inform and compiles. The master design called this "the prize" (§3, out of scope for v1).

## 1. Goal, and what "done" means

**Goal.** From a story file made by Inform 6 (with the Standard Library or PunyInform; versions 3, 4, 5 and 8, every version Frotzlens reads), produce one `.inf` file. It should read like something a person wrote, and recompile, with the same Inform and the same library, to an *equivalent* story.

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
| 6e | In the app: a **Source** view beside the disassembly, per routine and for the whole game, with Download `.inf`. In the CLI: `frotzlens --inform`. | Playwright and axe. A user who recompiles the download gets the same game. |

## 6. Risks

- **Library versions we haven't compiled.** The matches cover the versions `inform6-wasm` has (6.12.x, PunyInform). A story built with a different version decompiles with its whole library emitted as game code and no `Include` (§3a), so nothing is declared twice: correct, just longer.
- **Compiler versions.** Code generation changed across Inform 6 releases, so the round trip uses the fingerprinted version. Where we don't have that version, the check is "equivalent", not "identical".
- **Hand-written assembly and odd code.** The `@`-assembly fallback means the output still compiles.
- **Whose work it is.** A decompiled game is still its author's. The app should say so in the Source view, and the docs should too.

## 7. Questions for Chris

1. **Scope:** Inform 6 first, with ZIL (to ZIL source) later?
2. **Output style:** do you have a house style for Inform 6 (indentation, brace placement, `!` comments)?
3. **Order:** start with 6a, which gives a compilable file for every Inform story, and show it in the app early? Or hold the UI until 6c, when the routines read well?
