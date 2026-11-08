/**
 * frotztrace's <head>: title, description, Open Graph and Twitter cards, canonical URL, icons,
 * theme colours and schema.org JSON-LD, as frotzplay's seo.ts has them. No analytics yet.
 */
import type { AppHeadMetaObject } from 'nuxt/schema'
import { site } from './site.config'

export const title = `${site.name} — ${site.tagline}`
const image = `${site.siteUrl}/og-image.png`

/** Structured data (schema.org). A JSON data block, not a script that runs, so the CSP's script-src doesn't apply. */
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: site.name,
  url: `${site.siteUrl}/`,
  description: site.description,
  image,
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Any (runs in a web browser)',
  isAccessibleForFree: true,
  license: 'https://spdx.org/licenses/GPL-3.0-or-later.html',
  codeRepository: site.repoUrl,
  inLanguage: 'en',
  author: { '@type': 'Person', name: 'Christopher Schweda' },
  publisher: { '@type': 'Organization', name: 'frotz, Inc.', url: site.familyUrl },
}

export const seoHead: AppHeadMetaObject = {
  title,
  htmlAttrs: { lang: 'en' },
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { name: 'description', content: site.description },
    // The browser chrome follows the palette's --frotz-ground (nuxt-base/css/palette.css). Dark first.
    { name: 'theme-color', content: '#0e1116', media: '(prefers-color-scheme: dark)' },
    { name: 'theme-color', content: '#f3f1ea', media: '(prefers-color-scheme: light)' },
    { name: 'color-scheme', content: 'dark light' },
    { property: 'og:type', content: 'website' },
    { property: 'og:locale', content: 'en_US' },
    { property: 'og:site_name', content: site.name },
    { property: 'og:title', content: title },
    { property: 'og:description', content: site.description },
    { property: 'og:url', content: `${site.siteUrl}/` },
    { property: 'og:image', content: image },
    { property: 'og:image:width', content: '1200' },
    { property: 'og:image:height', content: '630' },
    { property: 'og:image:type', content: 'image/png' },
    { property: 'og:image:alt', content: site.imageAlt },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: site.description },
    { name: 'twitter:image', content: image },
    { name: 'twitter:image:alt', content: site.imageAlt },
  ],
  script: [{ type: 'application/ld+json', innerHTML: JSON.stringify(jsonLd) }],
  link: [
    { rel: 'canonical', href: `${site.siteUrl}/` },
    { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
    { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
    { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
  ],
}
