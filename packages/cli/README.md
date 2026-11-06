# Frotzlens

**A browser-based disassembler and inspector for Z-code story files.**

> This is a placeholder release to reserve the package name. There is no code here yet. Development is underway at [github.com/cschweda/frotzlens](https://github.com/cschweda/frotzlens).

## What it will be

Drop a `.z3`, `.z4`, `.z5`, `.z8`, or `.zblorb` file into a browser tab and get a navigable model of what's inside:

- Header, memory map, and abbreviation table
- Dictionary, with word separators and entry data decoded
- Object tree with attributes and properties
- Global variables
- Routines as disassembly, with cross-references in both directions
- String table, including strings reachable only by scanning
- Inform 6 awareness: compiler fingerprinting, veneer and library routine labeling, grammar table decoding, and full symbolic labeling when a `gameinfo.dbg` debug file is supplied

Everything runs client-side. No upload, no server.

Frotzlens is the companion to [Frotzsmith](https://frotzsmith.com), a browser-based Inform 6 IDE, and will be available both as a standalone app at [frotzlens.com](https://frotzlens.com) and as an inspector panel inside Frotzsmith. The parser will be published separately as `@frotzinc/zcode` (MIT) so other tools can use it.

## Why

The existing Z-code tooling — `txd`, `infodump`, Reform, UnZ — is decades-old desktop software, some of it no longer buildable. Nothing runs in a browser. Frotzlens is a clean-room reimplementation of that feature set as a web tool, with a decompile-to-Inform-6 target as the longer-term goal.

## Status

Reserved. Follow the repository for progress.

## License

GPL-3.0-or-later. The parser library, `@frotzinc/zcode`, is MIT.
