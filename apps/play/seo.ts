/**
 * frotzplay's <head>: title, description, Open Graph and Twitter cards, canonical URL, icons, theme
 * colours, and schema.org JSON-LD, as Frotzlens's nuxt.config.ts has them. apps/play's
 * nuxt.config.ts (Phase 4) uses it: `app: { head: seoHead }`.
 */
import { buildCommit } from '@frotzinc/nuxt-base/netlify/version'
import type { AppHeadMetaObject } from 'nuxt/schema'
import { site } from './site.config'

/** The build's commit date (YYYY-MM-DD): the structured data's dateModified, so it moves with every deploy. */
const modified = buildCommit(new URL('../../', import.meta.url))?.date ?? new Date().toISOString().slice(0, 10)

export const title = `${site.name} — ${site.tagline}`
const image = `${site.siteUrl}/og-image.png`

/**
 * Structured data (schema.org): a free web application, who makes it, and, since it's the point of
 * the thing, what it does for accessibility (schema.org's accessibility properties). A JSON data
 * block, not a script that runs, so the CSP's script-src doesn't apply to it.
 */
export const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: site.name,
  url: `${site.siteUrl}/`,
  description: site.description,
  image,
  applicationCategory: 'GameApplication',
  applicationSubCategory: 'Interactive fiction player',
  operatingSystem: 'Any (runs in a web browser)',
  browserRequirements: 'Requires JavaScript.',
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  license: 'https://spdx.org/licenses/GPL-3.0-or-later.html',
  codeRepository: site.repoUrl,
  datePublished: site.published,
  dateModified: modified,
  inLanguage: 'en',
  accessMode: ['textual'],
  accessModeSufficient: [['textual']],
  accessibilityFeature: ['structuralNavigation', 'readingOrder', 'highContrastDisplay', 'displayTransformability', 'timingControl', 'ttsMarkup'],
  accessibilityHazard: ['noFlashingHazard', 'noMotionSimulationHazard', 'noSoundHazard'],
  accessibilityControl: ['fullKeyboardControl'],
  accessibilitySummary:
    'Built for screen readers: one announcement per turn, the status line announced only when it changes, verbosity settings, timed input that can be paused, everything operable from the keyboard. Designed to meet WCAG 2.2 AA, with a published, tested accessibility contract.',
  author: { '@type': 'Person', name: 'Christopher Schweda' },
  publisher: { '@type': 'Organization', name: 'Frotz, Inc.', url: site.familyUrl },
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

/**
 * A story's own title, for the page (§6: "a page title that is the story's title") and for its
 * share card: "The Dark Cellar — frotzplay". The social image stays frotzplay's.
 */
export const storyTitle = (story: string) => `${story} — ${site.name}`
