# frotzlens

**Inspect Z-machine story files from the terminal.**

```sh
npx frotzlens --objects game.z5
```

`frotzlens` reads a `.z3`, `.z4`, `.z5` or `.z8` story file and prints what's inside: the header, the abbreviations, every object with its attributes and properties, the object tree, and the dictionary. The output is in the format of Ztools' `infodump`, byte for byte on every test fixture, and it takes `infodump`'s short options, so scripts written for `infodump` keep working. With `--json` it prints the parsed model instead.

```
Usage: frotzlens [options] story-file [story-file...]

  -i, --header          the story file header (the default)
  -a, --abbreviations   the abbreviations
  -o, --objects         the objects
  -t, --tree            the object tree
  -d, --dict            the dictionary
  -f, --all             all of the above (infodump's -f also prints the memory
                        map and grammar; those arrive in a later release)
  -w, --width <n>       wrap lines at n columns (default 79; 0 = never)
      --json            the parsed model as JSON instead
  -h, --help            print this
  -v, --version         print the version
```

Options combine and bundle as `infodump`'s do (`-oti`). The exit status is 0 on success, 1 if a file couldn't be read or had errors (reported on stderr; whatever could be read is still printed), and 2 for a usage error.

**Not yet:** a disassembly of routines (`txd`), strings, and grammar arrive in the next release, along with `infodump`'s memory map (`-m`) and grammar (`-g`). Until then, `-f` prints the five sections above. Blorb (`.zblorb`) files and versions 1, 2, 6 and 7 aren't read yet beyond their headers.

Everything runs locally. Nothing is uploaded. `frotzlens` is the command-line side of [Frotzlens](https://frotzlens.com), the browser-based story file inspector, and is built on [`@frotzinc/zcode`](https://www.npmjs.com/package/@frotzinc/zcode) (MIT).

## License

GPL-3.0-or-later. The parser library, `@frotzinc/zcode`, is MIT.
