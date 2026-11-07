# Bundled interpreter (Parchment)

These files are the **Parchment** web interpreter, which plays a story in the Play view. They are
vendored, not written for Frotzlens: copied byte for byte from [Frotzsmith](https://frotzsmith.com)
(`public/play/web/`), which vendored them on 2026-06-28 and patched `zvm.js`.

| Component | Source | License |
| --- | --- | --- |
| Parchment | https://github.com/curiousdannii/parchment | MIT |
| ifvms / ZVM (pure-JS Z-machine) | https://github.com/curiousdannii/ifvms.js | MIT |
| jQuery | https://jquery.com | MIT |

See each upstream project for the full license text.

## How Frotzlens runs it

`../index.html` and `../play.js` run in a **sandboxed iframe with no `allow-same-origin`**: an opaque
origin, cut off from the app, its storage and the rest of the site, because a story is anyone's
file and ZVM compiles it to JavaScript as it runs. The app posts the story's bytes to the frame;
`play.js` turns them into a blob URL in the frame's own origin and starts Parchment. `/play/*` has
its own Content-Security-Policy (`netlify.toml`): `'unsafe-eval'` for ZVM there and nowhere else.

## Provenance and checksums

Each file's source and the sha256 of the committed bytes are in `apps/web/vendored-files.json`;
`apps/web/scripts/check-vendored.mjs` (run in CI) fails if any byte changes without the manifest
being updated on purpose. `jquery.min.js` is the official jQuery 3.5.1 minified file, less its
trailing newline.

## Local patch: `zvm.js` (Frotzsmith's audit 2026-11-04, F2)

`zvm.js` carries two small in-place edits, described in its header comment: a story's
Unicode-table entry of U+E000 (ZVM's abbreviation placeholder) or a C0 control other than 13
becomes U+FFFD, and the abbreviation JIT also escapes `\n`, U+2028 and U+2029. Without them a story
could break out of ZVM's generated `Function('return"…"')` source and run JavaScript.
`check-vendored.mjs` undoes the two edits and checks the result is the original download, so the
patch is exactly what changed. When updating Parchment, re-apply the patch and update the manifest.
