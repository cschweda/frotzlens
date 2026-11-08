// Smoke test for a packed @frotzinc/zcode-ui, run by publish.sh in a scratch project where the
// tarball is installed (peers not installed). A Nuxt layer ships source, so this checks the files
// are where Nuxt and the exports map expect them, that it pulled in @frotzinc/zcode, and that it
// adds no look of its own (that is @frotzinc/nuxt-base's). Exits non-zero on any problem.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const root = dirname(require.resolve('@frotzinc/zcode-ui/package.json'))

for (const f of ['nuxt.config.ts', 'app/utils/story.ts', 'app/utils/live.ts', 'app/composables/useSymbols.ts', 'app/components/ObjectTree.vue', 'app/components/Disassembly.vue', 'app/components/HexPane.vue']) {
  if (!existsSync(join(root, f))) throw new Error(`missing ${f}`)
}
if (existsSync(join(root, 'css')) || existsSync(join(root, 'app/assets'))) throw new Error('ships CSS: the look belongs in @frotzinc/nuxt-base')
for (const f of readdirSync(join(root, 'app/components'))) {
  if (/from\s+['"](~~?\/|[./]*apps\/)/.test(readFileSync(join(root, 'app/components', f), 'utf8'))) throw new Error(`${f} imports from an app`)
}

// Its one dependency installed with it, and works.
const zcode = await import('@frotzinc/zcode')
if (typeof zcode.parseStory !== 'function') throw new Error('@frotzinc/zcode did not load')
console.log('zcode-ui: layer files present, no CSS of its own, @frotzinc/zcode installed')
