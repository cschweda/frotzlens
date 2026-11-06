# Phase 5: symbols, fingerprinting, Blorb, the room graph, and 0.1.0

Phase 5 finishes v1 (see the master design, §10). It lands in three pull requests:

1. **The core** (this document's first part): Blorb unwrap, symbols from `gameinfo.dbg`, fingerprinting without them, and the room graph, all in `@frotzinc/zcode`.
2. **The web app:** the Symbols view (drop a `.dbg`), a names/numbers toggle, the fingerprint on the Overview, Blorb details, a Globals and an Abbreviations view, and the map.
3. **The release:** the CLI's new options, docs, and `@frotzinc/zcode` and `frotzlens` 0.1.0 on npm (Chris runs `./publish.sh`).

## 1. Blorb

`parseStory` unwraps a Blorb (Blorb spec 2.0): it walks the IFF `FORM`'s chunks (each padded to an even length), reads the resource index (`RIdx`), and parses the story inside as if it had been dropped on its own. The story is the index's `Exec 0` when that names a `ZCOD` chunk, else the first `ZCOD` chunk. `story.blorb` lists the chunks and resources, the cover picture's number (`Fspc`) and the iFiction metadata (`IFmd`), with its title and author.

Each structural problem it can see gives a `bad-blorb` warning: a FORM length that disagrees with the file's size (or is too short to hold its type), a chunk running past the end, an odd last chunk with no pad byte, bytes left over, or an index entry pointing at no chunk or claiming more entries than it has room for. The story is still read when its `ZCOD` chunk can be found. A problem that hides that chunk, such as a corrupt length before it, leaves `blorb-unsupported`. A Blorb with no Z-machine story, such as a Glulx game's, is `blorb-unsupported` and says which it is. A Blorb inside a Blorb is unwrapped too; each level is strictly smaller, so this ends.

## 2. Symbols from gameinfo.dbg

`readSymbols(xml)` reads Inform's XML debug file (6.33+, written with `-k`) into tables keyed the way the model is:

| Table | Keyed by |
|---|---|
| Routines | byte address, with local names and source location |
| Globals | global number (from the byte address, using the header in the file's story prefix) |
| Objects, properties, attributes, actions, classes | number |
| Arrays | listed, with address, size and element width |

It never throws: a malformed file comes back with as much as could be read, and `problems` says what went wrong. The XML reader is the package's own (`src/xml.ts`), because a Web Worker has no `DOMParser`.

Two details:
- **Address 0:** a routine the compiler left out because nothing used it (PunyInform's `SetTime`) is listed at address 0, and is skipped.
- **`LIBRARY_STAGE`:** a constant the libraries redefine without a value. It's no loss, so it isn't reported.

`symbolsMatch(story, symbols)` checks the debug file belongs to the story. It compares the story's first 64 bytes with the file's prefix, but only the bytes the compiler sets and no interpreter changes: version, release, table addresses, serial, length and checksum.

**Checked:** on all 12 debug fixtures, the sweep finds exactly the routines the `.dbg` names, no more and no fewer.

## 3. Fingerprinting

`story.fingerprint` says what made the story, without a debug file:

- **The compiler.** ZILF writes `ZILF` and its version at 0x38 (`ZILF190~` is ZILF 1.9.0). Inform 6 writes its version at 0x3C (`6.44`). Anything else is `unknown`.
- **The library, from its banner.** The Standard Library prints " Library v" and then its `LibRelease` string (`6.12.8`). PunyInform prints " PunyInform v", then the major number, a `.`, and the minor.
- **Inform's veneer.** These are the routines the compiler adds itself (`RT__Err`, `CA__Pr`, `Cl__Ms`…). Each is recognised by its shape: its locals count and its sequence of opcodes, with operands ignored. One compiler with the same options writes each veneer routine the same way in every game. `Main__` is the routine at the initial PC.

The shapes are in `src/veneer-signatures.generated.ts`, built from the debug fixtures by `scripts/build-signatures.mjs`, and a test checks the table is current. A shape is left out if two veneer names share it, or if any game or library routine has it, so a veneer name is never put on game code. This leaves out `Unsigned__Compare` and `Symb__Tab`, which share their shapes with ordinary routines. The table has shapes for 29 veneer routines in all; a story includes only the ones its code needs. On the debug fixtures, every veneer routine a story has is found (except those two), and every name given matches the `.dbg`. The shapes come from Inform 6.44, so a story from another version gets fewer names. Matching by shape is a fixture-tested heuristic, not a proof. A game routine whose opcodes happen to match a veneer routine's exactly could be misnamed, although no routine in the fixtures and samples does.

## 4. The room graph

`roomGraph(story, symbols)` builds an Inform game's map from its objects' direction properties (`n_to` … `out_to`, named by the debug file, as the master design said: symbolic only). Each exit holds one of four things:

| Exit holds | What `roomGraph` does |
|---|---|
| A room | links the two rooms |
| A door | follows its `door_to` when that's a room |
| A routine | records the rooms it can return (`return Pavilion;`) as candidates |
| A string | records a message: a refusal such as "You can't go that way" |

The start is found when it is a constant: the Standard Library's `location = Room;` in `Initialise`, PunyInform's `Constant INITIAL_LOCATION_VALUE`, or the `location` global's starting value. A start the game works out as it runs isn't found.

`toMapGraph` gives the shape Frotzsmith's map draws: rooms by name, an edge for every exit that reaches a room (candidates included), and the start first. Rooms that share a name get their object number. On Mingus I, 19 rooms come out, all connected from the start. Every routine exit resolves to at least one room. One of them, the ending's room (The River's Edge), is reached only by a routine exit.

## 5. ZIL

ZILF-compiled stories were checked against Ztools before this phase (PR #8): everything Ztools can read in them matches. Decoding ZIL's own syntax tables, its grammar, is the remaining ZIL work. Ztools can't read them either: it reads them as Inform grammar and runs off the end of the file.

## 6. The web app (the second PR)

- **Symbols.** A `.dbg` dropped anywhere, or chosen on the Symbols view, is read on the main thread (about 20 ms for a 1.8 MB file) and checked against the story. One written for another story is refused with a message, and its names are never applied. A **Names** toggle in the header (a pressed/unpressed button) switches between source names and txd's numbers. The story is never re-parsed.
- **Names everywhere.**
  - The routines list, disassembly and copy-as-text show routines, globals, locals, attributes and properties by name (zcode's `symbols` option).
  - Links, search and the object view show names too: attributes as `light (12)`, properties by name, grammar actions as `##Take (12)`.
- **Overview.** "What is this file" adds the library, how many veneer routines were recognised, a Blorb's contents (pictures, sounds, cover, title, author), and whether symbols are loaded.
- **Globals** (`#globals`, `#global/12`): each global's starting value and the routines that use it. Globals are now links everywhere.
- **Abbreviations** (`#abbreviations`): the table, copied in infodump's format.
- **Map** (`#map`, with symbols): the room graph laid out on a grid by Trizbort's rule, ported from Frotzsmith's map. Exits a routine decides are dashed.
  - Each room links to its object. The SVG is a labelled group, because a `role="img"` can't contain links.
  - Below the picture, the same map as a list: each room and its exits. That list is the map for anyone who can't see the picture.
  - "Copy the map" gives Frotzsmith's shape.
- **Smoke test.** A new Playwright test opens the `mingus-1` fixture, refuses `demo.dbg`, loads `mingus-1.dbg`, finds `Initialise` and `location`, checks the map (19 rooms, starting in Wind-Scoured Mesa), and runs axe on each view. Then it switches names off.
  - axe caught two problems along the way, both fixed: links in the exit sentences needed underlines (link-in-text-block), and the map's SVG had `role="img"` around links (nested-interactive).
