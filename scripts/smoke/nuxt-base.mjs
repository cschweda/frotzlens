// Smoke test for a packed @frotzinc/nuxt-base, run by publish.sh in a scratch
// project where the tarball is installed (peers not installed). Exits non-zero
// on any problem.
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const root = dirname(createRequire(import.meta.url).resolve('@frotzinc/nuxt-base/package.json'))

// The layer's files are where Nuxt (and the exports map) expect them.
for (const f of ['nuxt.config.ts', 'app/app.config.ts', 'app/utils/safe-storage.ts', 'app/utils/slug.ts', 'app/utils/shortcut.ts', 'css/base.css', 'css/palette.css']) {
  if (!existsSync(join(root, f))) throw new Error(`missing ${f}`)
}
if (!readFileSync(join(root, 'css/base.css'), 'utf8').includes('--frotz-amber')) throw new Error('base.css has no --frotz-amber')

// The Netlify tools load and do their job.
const { parseRedirects } = await import('@frotzinc/nuxt-base/netlify/redirects')
if (parseRedirects('/a /b 301\n').length !== 1) throw new Error('parseRedirects')
const { collectChunks } = await import('@frotzinc/nuxt-base/netlify/inject-preloads')
const chunks = collectChunks({ 'pages/index.vue': { file: 'i.js', imports: [] } }, 'pages/index.vue')
if (chunks.js[0] !== 'i.js') throw new Error('collectChunks')
const { precachedUrls } = await import('@frotzinc/nuxt-base/netlify/check-sw')
if (precachedUrls('{url:"/"}')[0] !== '/') throw new Error('precachedUrls')
const { buildCommit } = await import('@frotzinc/nuxt-base/netlify/version')
if (typeof buildCommit !== 'function') throw new Error('buildCommit')
const { createReportHandler } = await import('@frotzinc/nuxt-base/netlify/report')
const unconfigured = createReportHandler({ app: 'smoke', env: () => undefined })
if ((await unconfigured(new Request('https://x/', { method: 'POST', body: '{}' }), {})).status !== 503) throw new Error('createReportHandler')
console.log('nuxt-base: layer files present; netlify tools load and work; the report function answers')
