# frotzlens

**Inspect Z-machine story files from the terminal.**

```sh
frotzlens game.z5                     # the whole disassembly, as Ztools' txd prints it
frotzlens --routine 4f4 game.z5       # one routine
frotzlens -f game.z5                  # everything infodump prints: header, map, abbreviations, objects, tree, grammar, dictionary
frotzlens --info game.z5              # what made it: compiler, library, Inform's veneer
frotzlens --symbols gameinfo.dbg game.z5          # the disassembly with the source's names
frotzlens --rooms --symbols gameinfo.dbg game.z5  # the map: rooms and exits
frotzlens --inform game.z5 > game.inf            # the story as Inform 6 source, checked
```

Install it with `npm install -g frotzlens`, or run it once with `npx frotzlens game.z5`. It needs Node 22.12 or later. From this repository: `pnpm install && pnpm build`, then `node packages/cli/dist/bin.js`.

`frotzlens` reads a `.z3`, `.z4`, `.z5` or `.z8` story file. With no options it prints the disassembly the way Ztools' `txd` does: every routine, with labels, Inform's grammar notes on action and parsing routines, and every string. With `infodump`'s options it prints those sections the way `infodump` does. On every Standard Library and library-free test story the output is byte for byte the same as the original tools', so scripts written for either keep working. With `--json` it prints the parsed model instead.

```
Usage: frotzlens [options] story-file [story-file...]

Disassembly (txd):
      --txd             the disassembly (the default when no section is asked for)
  -n, --addresses       addresses instead of labels (txd -n)
      --routine <addr>  just the routine at this address (hex, e.g. 4f4 or 0x4f4)
      --no-grammar      leave out the grammar notes on routines (txd -g)
      --symbols <file>  names from Inform's debug file (gameinfo.dbg, written
                        with -k): routines, globals, locals, attributes and
                        properties by name. No longer txd's text.

Inform 6 source:
      --inform          the story decompiled to Inform 6 (an Inform story): one
                        .inf, the library as Includes, each routine checked by
                        compiling it again (with Inform 6.44, built in). Names
                        from --symbols if given, else made up from the story.

About the file:
      --info            what made it (compiler, library, Inform's veneer)
                        and, for a Blorb, what else is in it
      --rooms           the map: rooms and exits (needs --symbols)

Sections (infodump):
  -i, --header          the story file header
  -m, --map             the story file map
  -a, --abbreviations   the abbreviations
  -o, --objects         the objects
  -t, --tree            the object tree
  -g, --grammar         Inform's verb grammar
  -d, --dict            the dictionary
  -f, --all             all of the above

  -w, --width <n>       wrap lines at n columns (default 79; 0 = never)
      --json            the parsed model as JSON instead (an array, with
                        each one's "file", for several files)
  -h, --help            print this
  -v, --version         print the version
```

Short options bundle as `infodump`'s do (`-oti`). The exit status is 0 on success, 1 if a file couldn't be read or had errors (reported on stderr; whatever could be read is still printed), and 2 for a usage error.

**Where it differs from Ztools:** PunyInform stories use Inform's version 3 grammar, which `txd` and `infodump` misread (as version 1; `infodump` stops partway). `frotzlens` reads it correctly, so for those stories its grammar sections and notes are right where the originals are garbage. A Blorb (`.zblorb`, `.zlb`) is unwrapped and its story read; one with no Z-machine story in it (a Glulx game's) is reported, with exit status 1. For versions 1, 2, 6 and 7 it shows the header and nothing else.

Everything runs locally. Nothing is uploaded. `frotzlens` is the command-line side of [frotzlens](https://frotzlens.frotzinc.com), the browser-based story file inspector, and is built on [`@frotzinc/zcode`](https://www.npmjs.com/package/@frotzinc/zcode) (MIT).

## License

GPL-3.0-or-later. The parser library, `@frotzinc/zcode`, is MIT.
