// Smoke test for a packed @frotzinc/player, run by publish.sh in a scratch project where the tarball,
// @frotzinc/zmachine (its one dependency, from npm) and vue (its peer) are installed. It exports a
// story, and checks the web component, the CSS and the fonts ship. Exits non-zero on any problem.
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { DEFAULT_SETTINGS, bundle, bundleFolder, turnAnnouncement, zip } from '@frotzinc/player'

const check = (ok, what) => { if (!ok) throw new Error(what) }
const require = createRequire(import.meta.url)
const root = dirname(require.resolve('@frotzinc/player/package.json'))

// The web component, the CSS, the fonts and their licence.
const elementJs = readFileSync(require.resolve('@frotzinc/player/frotz-play.js'), 'utf8')
check(elementJs.includes('frotz-play') && !/\beval\(|new Function\(/.test(elementJs), 'frotz-play.js')
check(readFileSync(require.resolve('@frotzinc/player/player.css'), 'utf8').includes('.zp'), 'player.css')
for (const f of ['fonts/OFL.txt', 'fonts/OpenDyslexic-Regular.woff2']) check(existsSync(join(root, f)), `missing ${f}`)

// Export a tiny story (prints "hi", quits): one HTML file, and a folder as a .zip.
const story = new Uint8Array(72)
story[0] = 5
story.set([0x00, 0x40, 0x00, 0x40], 0x04)
story.set([0x00, 0x40, 0x00, 0x40], 0x0c)
story.set([0xb2, 0xb5, 0xc5, 0xbb, 0xba], 0x40)
const { filename, html } = await bundle(story, { title: 'Smoke Test', storyName: 'smoke.z5', elementJs })
check(filename === 'smoke-test.html', `filename ${filename}`)
check(html.includes("default-src 'none'") && html.includes('<frotz-play') && html.includes('frotzplay'), 'bundle')
const files = bundleFolder(story, { title: 'Smoke Test', storyName: 'smoke.z5', elementJs })
check(files.some(f => f.name === 'index.html') && files.some(f => f.name === 'story.z5'), 'bundleFolder')
const z = zip(files, 'smoke-test')
check(z[0] === 0x50 && z[1] === 0x4b, 'zip')

check(DEFAULT_SETTINGS.theme === 'dark', 'dark by default')
check(turnAnnouncement('look', 'Hall\n\n>', 'standard') === 'Hall', 'turnAnnouncement')
console.log(`player: exported a story (${html.length} bytes, a ${z.length}-byte .zip); the element, CSS and fonts ship`)
