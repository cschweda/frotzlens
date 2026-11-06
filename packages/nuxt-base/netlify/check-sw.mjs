// Post-build check of a service worker that @vite-pwa/nuxt generated (sw.js).
//
// The worker decides what works offline and what a visitor downloads, and a
// config slip there fails silently: a huge runtime precached for every
// visitor, per-load query params missing the cache, a 404 cached forever.
// This reads the built sw.js as text (no Workbox import) and reports any of
// it. Each app passes its own expectations (CheckSwConfig) from a small
// script and runs it after `nuxt generate`.
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { resolveOutDir } from './inject-preloads.mjs'

/**
 * @typedef {object} RuntimeCache  A runtime-cached route the worker must have.
 * @property {string} cacheName       its Workbox cacheName
 * @property {string} [label]         how messages name it (default: the cacheName)
 * @property {string} [handler]       Workbox strategy it must use, e.g. 'CacheFirst'
 * @property {boolean} [only200]      it must cache status 200 only
 * @property {boolean} [pathname]     it must match on the URL's pathname (a RegExp matches the full URL)
 *
 * @typedef {object} CheckSwConfig
 * @property {string[]} [required]          precache URLs that must be present
 * @property {string[]} [forbidden]         URL prefixes that must never be precached
 * @property {{ pattern: RegExp, what: string }[]} [requiredMatches]
 *                                          at least one precache URL must match each
 * @property {string[]} [ignoredParams]     query params ignoreURLParametersMatching must list
 * @property {string} [ignoredParamsWhy]    why, for the message
 * @property {RuntimeCache[]} [runtimeCaches]
 */

/** A precache URL without a leading slash (Workbox emits them relative). */
const bare = (url) => url.replace(/^\/+/, '')

/** The precache manifest's URLs: the `url:"…"` pairs Workbox emits. */
export function precachedUrls(sw) {
  return [...sw.matchAll(/\burl:"([^"]*)"/g)].map((m) => m[1])
}

/**
 * Problems with the build's sw.js in `publicDir`; empty means OK.
 * @param {string} publicDir
 * @param {CheckSwConfig} [config]
 */
export function checkServiceWorker(publicDir, config = {}) {
  const { required = [], forbidden = [], requiredMatches = [], ignoredParams = [], runtimeCaches = [] } = config
  const file = join(publicDir, 'sw.js')
  if (!existsSync(file)) return [`sw.js is missing from ${publicDir}`]
  const sw = readFileSync(file, 'utf8')
  const problems = []

  const urls = precachedUrls(sw)
  for (const url of urls) {
    const bad = forbidden.find((prefix) => bare(url).startsWith(prefix))
    if (bad) problems.push(`sw.js precaches ${url} (nothing under "${bad}" may be precached)`)
  }
  // The app shell: the navigation fallback is bound to it (createHandlerBoundToURL('/') throws
  // when '/' is not precached, and the worker fails to install).
  if (!urls.includes('/')) problems.push('sw.js does not precache / (the navigation fallback needs it)')
  for (const url of required) {
    if (!urls.includes(url)) problems.push(`sw.js does not precache ${url}`)
  }
  for (const { pattern, what } of requiredMatches) {
    if (!urls.some((url) => pattern.test(url))) problems.push(`sw.js does not precache ${what}`)
  }

  if (ignoredParams.length) {
    const why = config.ignoredParamsWhy ?? 'pages loaded with it would miss the precache'
    const ignored = sw.match(/ignoreURLParametersMatching:\[([^\]]*)\]/)
    if (!ignored) {
      problems.push(`sw.js has no ignoreURLParametersMatching (${why})`)
    } else {
      for (const param of ignoredParams) {
        if (!ignored[1].includes(`/^${param}$/`)) {
          problems.push(`sw.js does not ignore the URL parameter "${param}" (${why})`)
        }
      }
    }
  }

  for (const rc of runtimeCaches) problems.push(...checkRuntimeCache(sw, rc))
  return problems
}

/** @param {string} sw @param {RuntimeCache} rc */
function checkRuntimeCache(sw, { cacheName, label = cacheName, handler, only200, pathname }) {
  const at = sw.indexOf(`cacheName:"${cacheName}"`)
  if (at === -1) return [`sw.js has no ${label} runtime route (cache "${cacheName}")`]
  const problems = []
  const name = `sw.js's ${label} route (cache "${cacheName}")`
  if (only200) {
    // The route's options object: from its cacheName to the end of its plugins list.
    const end = sw.indexOf('"GET"', at)
    const options = sw.slice(at, end === -1 ? at + 400 : end)
    if (!/CacheableResponsePlugin\(\{statuses:\[200\]\}\)/.test(options)) {
      problems.push(`${name} does not cache status 200 only`)
    }
  }
  // The route itself: from the registerRoute( before the cache name to the cache name.
  const start = sw.lastIndexOf('registerRoute(', at)
  const route = start === -1 ? '' : sw.slice(start, at)
  if (pathname && !/\.pathname\)/.test(route)) {
    problems.push(`${name} does not match on the URL's pathname (a RegExp matches the full URL)`)
  }
  if (handler && !new RegExp(`new \\w+\\.${handler}\\(\\{$`).test(route)) {
    problems.push(`${name} is not ${handler}`)
  }
  return problems
}

/**
 * Problems with a build that must ship no worker at all (e.g. a desktop
 * build): no sw.js and no web manifest.
 */
export function checkNoServiceWorker(publicDir, what = 'this build') {
  return ['sw.js', 'manifest.webmanifest']
    .filter((name) => existsSync(join(publicDir, name)))
    .map((name) => `${name} is present in ${what} (${publicDir}); it must have no service worker`)
}

/**
 * Problems with a kill-switch build's sw.js: it must be vite-plugin-pwa's
 * self-destroying worker — takes over at once, unregisters, deletes the
 * caches, reloads its pages — and precache nothing.
 */
export function checkSelfDestroyingWorker(publicDir) {
  const file = join(publicDir, 'sw.js')
  if (!existsSync(file)) return [`sw.js is missing from ${publicDir} (the kill switch needs it to replace installed workers)`]
  const sw = readFileSync(file, 'utf8')
  const problems = []
  const parts = [
    [/addEventListener\(\s*['"]install['"][\s\S]*?skipWaiting\(\)/, 'take over at once (install → skipWaiting)'],
    [/addEventListener\(\s*['"]activate['"]/, 'act on activate'],
    [/registration\.unregister\(\)/, 'unregister itself'],
    [/caches\.delete\(/, 'delete the caches'],
    [/\.navigate\(/, 'reload its pages'],
  ]
  for (const [pattern, what] of parts) {
    if (!pattern.test(sw)) problems.push(`the kill-switch sw.js is not self-destroying: it does not ${what}`)
  }
  if (/precacheAndRoute|registerRoute|workbox/.test(sw) || precachedUrls(sw).length) {
    problems.push('the kill-switch sw.js still precaches or routes (it must only remove itself)')
  }
  return problems
}

/**
 * The check for the build mode: a no-worker build has none, a kill-switch
 * build the self-destroying one, a normal build a correct one. No-worker wins.
 * @param {string} publicDir
 * @param {{ noWorker?: boolean, kill?: boolean, noWorkerWhat?: string }} mode
 * @param {CheckSwConfig} [config]
 */
export function checkBuild(publicDir, { noWorker = false, kill = false, noWorkerWhat } = {}, config = {}) {
  if (noWorker) return checkNoServiceWorker(publicDir, noWorkerWhat)
  return kill ? checkSelfDestroyingWorker(publicDir) : checkServiceWorker(publicDir, config)
}

/**
 * CLI runner: check the generated site, print the result, exit 1 on problems.
 * @param {CheckSwConfig} config
 * @param {{ publicDir?: string, noWorker?: boolean, kill?: boolean, noWorkerWhat?: string, okNote?: string }} [opts]
 */
export function runCheckSw(config, opts = {}) {
  const publicDir = opts.publicDir ? resolve(opts.publicDir) : resolveOutDir(process.cwd())
  const problems = checkBuild(publicDir, opts, config)
  if (problems.length) {
    for (const problem of problems) console.error(`check-sw: ${problem}`)
    process.exit(1)
  }
  if (opts.noWorker) {
    console.log(`check-sw: OK — ${opts.noWorkerWhat ?? 'this build'} has no service worker or web manifest`)
  } else if (opts.kill) {
    console.log('check-sw: OK — kill-switch build: sw.js is the self-destroying worker, nothing precached')
  } else {
    const count = precachedUrls(readFileSync(join(publicDir, 'sw.js'), 'utf8')).length
    console.log(`check-sw: OK — ${count} precached entries${opts.okNote ? `, ${opts.okNote}` : ''}`)
  }
}
