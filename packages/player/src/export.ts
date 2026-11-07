/**
 * Export (docs/15 §2): a story and the <frotz-play> element as one HTML file that plays from a
 * double-click, or as a folder (a .zip) for any static host. Pure functions: the site calls them,
 * and so can a CLI. `elementJs` is dist/frotz-play.js's text.
 */

export interface BundleOptions {
  /** The story's title: the page's title and the file names. */
  title: string
  /** The story's file name, for its extension (dark-cellar.z5 → story.z5 in a folder). */
  storyName: string
  /** The built <frotz-play> script (dist/frotz-play.js). */
  elementJs: string
  /** A fixed seed, or none for a random one each play. */
  seed?: number
}

export interface ExportedFile {
  name: string
  data: Uint8Array
}

const enc = new TextEncoder()

/** A file name from a title: "The Dark Cellar" → "the-dark-cellar". */
export const slugOf = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'story'

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** A script's text can't contain "</script" (it would end the element early). */
const scriptSafe = (js: string) => js.replace(/<\/script/gi, '<\\/script')

function base64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(text))
  return `'sha256-${base64(new Uint8Array(digest))}'`
}

const PAGE_CSS = 'html,body{margin:0;height:100%;background:#0e1116;color:#e6dfcf;font-family:system-ui,sans-serif}main{height:100%;max-width:64rem;margin:0 auto;padding:1rem;box-sizing:border-box}frotz-play{height:100%}'

/** Reads the story from the page (the folder's story.js, or the single file's data block) and hands it to the element. */
const BOOT = `(function(){var d=document.getElementById('frotzplay-story');var t=(window.FROTZPLAY_STORY||(d&&d.textContent)||'').trim();var b=atob(t);var u=new Uint8Array(b.length);for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);document.querySelector('frotz-play').story=u})();`

function element(o: BundleOptions): string {
  const seed = o.seed !== undefined ? ` seed="${o.seed}"` : ''
  // font-base="": exports don't carry OpenDyslexic (four fonts would need font-src data:).
  return `<frotz-play title="${escapeHtml(o.title)}"${seed} font-base=""></frotz-play>`
}

/**
 * One HTML file: the element's script inline, the story as base64 in a data block (never run), and
 * a Content-Security-Policy that allows exactly those inline scripts and the page's style, by hash.
 * No fetches, no workers: it plays from file://.
 */
export async function bundle(story: Uint8Array, o: BundleOptions): Promise<{ filename: string; html: string }> {
  const js = scriptSafe(o.elementJs)
  const csp = `default-src 'none'; script-src ${await sha256(js)} ${await sha256(BOOT)}; style-src ${await sha256(PAGE_CSS)}; img-src blob:; base-uri 'none'; form-action 'none'`
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="generator" content="frotzplay">
<title>${escapeHtml(o.title)}</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<main>
${element(o)}
</main>
<script type="application/octet-stream" id="frotzplay-story">${base64(story)}</script>
<script>${js}</script>
<script>${BOOT}</script>
</body>
</html>
`
  return { filename: `${slugOf(o.title)}.html`, html }
}

/**
 * A folder: index.html, frotzplay.js, story.js (the story, so index.html plays from file:// too),
 * story.<ext> (the story file itself), frotzplay.css and README.txt.
 */
export function bundleFolder(story: Uint8Array, o: BundleOptions): ExportedFile[] {
  const ext = /\.(z[3458]|zblorb|zlb)$/i.exec(o.storyName)?.[1]?.toLowerCase() ?? 'z5'
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="frotzplay">
<title>${escapeHtml(o.title)}</title>
<link rel="stylesheet" href="frotzplay.css">
</head>
<body>
<main>
${element(o)}
</main>
<script src="frotzplay.js"></script>
<script src="story.js"></script>
<script src="boot.js"></script>
</body>
</html>
`
  const readme = `${o.title}
${'='.repeat(o.title.length)}

To play: open index.html in a web browser.

To put it online: upload this whole folder to any static web host (Netlify, itch.io as an HTML game, GitHub Pages, your own site). Nothing needs installing or building.

The story file itself is story.${ext}; any Z-machine interpreter plays it.

Made with frotzplay (https://frotzplay.frotzinc.com), an accessible Z-machine player. The player is MIT-licensed: https://github.com/cschweda/frotzlens
`
  return [
    { name: 'index.html', data: enc.encode(html) },
    { name: 'frotzplay.js', data: enc.encode(o.elementJs) },
    { name: 'frotzplay.css', data: enc.encode(PAGE_CSS + '\n') },
    { name: 'story.js', data: enc.encode(`window.FROTZPLAY_STORY='${base64(story)}';\n`) },
    { name: 'boot.js', data: enc.encode(BOOT + '\n') },
    { name: `story.${ext}`, data: story },
    { name: 'README.txt', data: enc.encode(readme) },
  ]
}

// ── a .zip (stored, no compression): enough for a folder of text and a story ──

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (const b of data) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Files into a .zip, inside a folder named `folder`. */
export function zip(files: ExportedFile[], folder: string): Uint8Array {
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const f of files) {
    const name = enc.encode(`${folder}/${f.name}`)
    const crc = crc32(f.data)
    const local = new Uint8Array(30 + name.length)
    const v = new DataView(local.buffer)
    v.setUint32(0, 0x04034b50, true)
    v.setUint16(4, 20, true)
    v.setUint16(6, 0x0800, true) // UTF-8 names
    v.setUint16(8, 0, true) // stored
    v.setUint32(14, crc, true)
    v.setUint32(18, f.data.length, true)
    v.setUint32(22, f.data.length, true)
    v.setUint16(26, name.length, true)
    local.set(name, 30)
    const cen = new Uint8Array(46 + name.length)
    const w = new DataView(cen.buffer)
    w.setUint32(0, 0x02014b50, true)
    w.setUint16(4, 20, true)
    w.setUint16(6, 20, true)
    w.setUint16(8, 0x0800, true)
    w.setUint32(16, crc, true)
    w.setUint32(20, f.data.length, true)
    w.setUint32(24, f.data.length, true)
    w.setUint16(28, name.length, true)
    w.setUint32(42, offset, true)
    cen.set(name, 46)
    parts.push(local, f.data)
    central.push(cen)
    offset += local.length + f.data.length
  }
  const cenSize = central.reduce((n, c) => n + c.length, 0)
  const end = new Uint8Array(22)
  const e = new DataView(end.buffer)
  e.setUint32(0, 0x06054b50, true)
  e.setUint16(8, files.length, true)
  e.setUint16(10, files.length, true)
  e.setUint32(12, cenSize, true)
  e.setUint32(16, offset, true)
  const out = new Uint8Array(offset + cenSize + 22)
  let at = 0
  for (const p of [...parts, ...central, end]) {
    out.set(p, at)
    at += p.length
  }
  return out
}
