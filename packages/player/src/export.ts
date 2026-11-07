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
  /** Where "Made with frotzplay" links to (the site that made the export). */
  siteUrl?: string
}

const REPO_URL = 'https://github.com/cschweda/frotzlens/tree/main/apps/play'
const FAMILY_URL = 'https://frotzinc.com'
const DEFAULT_SITE = 'https://frotzplay.frotzinc.com'

/** frotzplay's mark (public/logo.svg), inline: an export's CSP allows no images from anywhere. */
const LOGO = '<svg class="fp-logo" width="32" height="32" viewBox="0 0 512 512" aria-hidden="true" focusable="false"><defs><linearGradient id="fp-a" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#fcd34d"/><stop offset="100%" stop-color="#f59e0b"/></linearGradient></defs><rect width="512" height="512" rx="112" fill="url(#fp-a)"/><g transform="translate(106,106) scale(12.5)" fill="#0b0b0e"><path d="M3.2 4.2 Q3.2 2.6 4.6 3.4 L14.4 10.6 Q15.6 11.5 14.4 12.4 L4.6 19.6 Q3.2 20.4 3.2 18.8 Z"/><rect x="16.8" y="16.6" width="5.2" height="2.6" rx="0.6"/></g></svg>'

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

/**
 * The page around the player: frotzplay's header (mark, name, the story's title) and a footer with
 * links to frotzplay, its source and Frotz, Inc. Contrast in the family's dark palette: text 14.25:1,
 * quieter text 8.32:1, links (amber) 9.32:1.
 */
const PAGE_CSS = [
  '*{box-sizing:border-box}',
  'html,body{margin:0;height:100%;background:#0e1116;color:#e6dfcf;font-family:"Segoe UI",system-ui,sans-serif;line-height:1.5}',
  'body{display:flex;flex-direction:column}',
  '.fp-header,.fp-footer{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem 1rem;max-width:64rem;width:100%;margin:0 auto;padding:.75rem 1rem}',
  '.fp-header{border-bottom:1px solid #2a2f38}',
  '.fp-brand{display:inline-flex;align-items:center;gap:.6rem;color:#e6dfcf;text-decoration:none;font-weight:700;font-size:1.15rem}',
  '.fp-title{color:#b0ac9e}',
  'main{flex:1 1 auto;min-height:24rem;max-width:64rem;width:100%;margin:0 auto;padding:1rem}',
  'frotz-play{height:100%}',
  '.fp-footer{border-top:1px solid #2a2f38;font-size:.9rem;color:#b0ac9e;justify-content:space-between}',
  '.fp-footer ul{display:flex;flex-wrap:wrap;gap:.5rem 1.25rem;margin:0;padding:0;list-style:none}',
  '.fp-footer a,.fp-made a{color:#f0a830;text-decoration:underline;text-decoration-style:dotted;text-underline-offset:4px}',
  'a:focus-visible{outline:3px solid #f0a830;outline-offset:2px;border-radius:4px}',
].join('')

/** Reads the story from the page (the folder's story.js, or the single file's data block) and hands it to the element. */
const BOOT = `(function(){var d=document.getElementById('frotzplay-story');var t=(window.FROTZPLAY_STORY||(d&&d.textContent)||'').trim();var b=atob(t);var u=new Uint8Array(b.length);for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);document.querySelector('frotz-play').story=u})();`

/** The page: the header, the player in <main>, and the footer's links. */
function page(o: BundleOptions): string {
  const site = o.siteUrl ?? DEFAULT_SITE
  return `<header class="fp-header">
<a class="fp-brand" href="${escapeHtml(site)}">${LOGO}<span>frotzplay</span></a>
<span class="fp-title">${escapeHtml(o.title)}</span>
</header>
<main>
${element(o)}
</main>
<footer class="fp-footer">
<p class="fp-made">Played with <a href="${escapeHtml(site)}">frotzplay</a>, an accessible Z-machine player.</p>
<nav aria-label="frotzplay">
<ul>
<li><a href="${escapeHtml(site)}">frotzplay</a></li>
<li><a href="${REPO_URL}">Source on GitHub</a></li>
<li><a href="${FAMILY_URL}">From Frotz, Inc.</a></li>
</ul>
</nav>
</footer>`
}

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
<title>${escapeHtml(o.title)} — frotzplay</title>
<style>${PAGE_CSS}</style>
</head>
<body>
${page(o)}
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
<title>${escapeHtml(o.title)} — frotzplay</title>
<link rel="stylesheet" href="frotzplay.css">
</head>
<body>
${page(o)}
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
