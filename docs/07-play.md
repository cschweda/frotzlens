# Play: the story itself, beside its disassembly

Asked for on 2026-11-06: let people play the game they're inspecting, as Frotzsmith does, so the disassembly and the running story are one click apart.

## What it is

A **Play** view (`#play`, second in the nav, and a "Play the game" button on the Overview). It runs the open story in [Parchment](https://github.com/curiousdannii/parchment), the same interpreter Frotzsmith uses, with Frotzsmith's patched copy of ZVM. It plays Z-machine versions 3, 4, 5 and 8, so Inform stories, ZILF-compiled ones, and a Blorb's story all play. Restart and full screen are on the view. Nothing is saved, and leaving the view ends the game.

This isn't the live debugger the master design deferred (§3, "frotztrace"): no breakpoints, stepping or watches. It's the plain game.

## Walled off: a sandboxed iframe with an opaque origin

Frotzsmith plays stories its author just compiled. Frotzlens opens anyone's file, and ZVM compiles each story's Z-code to JavaScript as it runs. So the player gets less than Frotzsmith's does:

- **Sandboxed.** It runs in an `<iframe sandbox="allow-scripts">` without `allow-same-origin`. Its origin is opaque (`null`), so even a story that broke out of the interpreter couldn't touch the app, its DOM, its storage, or anything else on the site. The Playwright test checks the frame's origin is `null`.
- **Bytes by message, not a shared URL.** The frame says it's ready, and the app posts it a copy of the story's bytes and version. Only that frame's window is answered. The frame turns the bytes into a blob URL in its own origin and starts Parchment. It takes one story per load and checks the version (3, 4, 5, 8) and the size.
- **Its own CSP, only under `/play/`** (`netlify.toml`, after the site's rule, which it overrides):
  - `'unsafe-eval'` for ZVM there and nowhere else. The app's own CSP doesn't change, except that `frame-src` is now `'self'`.
  - No `'unsafe-inline'` for scripts: the page's script is `play.js`.
  - `frame-ancestors 'self'` and `X-Frame-Options: SAMEORIGIN`, so only Frotzlens can embed it.
  - `Access-Control-Allow-Origin: *`, because the opaque origin loads Parchment's ES modules, which need CORS. These are public static files.
- **Patched ZVM.** Frotzsmith's audit fix (F2) closes the known ways a story's text could break out of ZVM's generated code. The vendored files are checked by sha256 in CI (`apps/web/scripts/check-vendored.mjs`), and `zvm.js` with the patch undone must equal the original download. See `apps/web/public/play/web/README.md` and its `THIRD-PARTY-NOTICES.txt`.

## Checked

- The built site, served with these headers: The Dark Cellar boots and answers `look`, Cloak of Darkness (ZILF, z3) plays, and Architect Legacy plays from a `.zblorb`. No console errors or CSP violations, and the frame's origin is `null`.
- A Playwright test plays the sample, sends a command, checks the sandbox and the origin, and runs axe on the view.
- Light mode: solid primary buttons now use the palette's light lamp color, `#8a5208` (about 6.4:1 under white text). axe caught Nuxt UI's amber-500 at about 2.1:1.
