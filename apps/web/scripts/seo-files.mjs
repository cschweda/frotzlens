// Writes public/robots.txt and public/sitemap.xml from site.config.ts's siteUrl, so the one canonical
// URL stays in one place. Without them, Netlify's single-page fallback would answer /robots.txt with
// the app's HTML. The app's views are hash routes (#routine/27f8), which crawlers don't fetch as
// pages, so the sitemap is the one URL.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const config = readFileSync(new URL('../site.config.ts', import.meta.url), 'utf8')
const siteUrl = config.match(/siteUrl:\s*'(https:\/\/[^']+)'/)?.[1]
if (!siteUrl) throw new Error('seo-files: no siteUrl in site.config.ts')
const pub = new URL('../public/', import.meta.url)
mkdirSync(pub, { recursive: true })
writeFileSync(new URL('robots.txt', pub), `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`)
writeFileSync(
  new URL('sitemap.xml', pub),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${siteUrl}/</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod></url>
</urlset>
`,
)
