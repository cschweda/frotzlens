// Writes public/robots.txt and public/sitemap.xml from site.config.ts's siteUrl, so the one canonical
// URL stays in one place (as frotzlens's). Without them, Netlify's single-page fallback would answer
// /robots.txt with the app's HTML. The sitemap is the one URL: every page's canonical link is the
// start page.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const config = readFileSync(new URL('../site.config.ts', import.meta.url), 'utf8')
const siteUrl = config.match(/siteUrl:\s*'(https:\/\/[^']+)'/)?.[1]
if (!siteUrl) throw new Error('seo-files: no siteUrl in site.config.ts')
const pub = new URL('../public/', import.meta.url)
mkdirSync(pub, { recursive: true })
const xml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
writeFileSync(new URL('robots.txt', pub), `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`)
const urls = [`${siteUrl}/`]
writeFileSync(
  new URL('sitemap.xml', pub),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${xml(u)}</loc></url>`).join('\n')}
</urlset>
`,
)
console.log(`seo-files: robots.txt and sitemap.xml (${urls.length} URLs)`)
