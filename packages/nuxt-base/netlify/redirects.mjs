// Helpers for testing a Netlify `_redirects` file. Each app writes its own
// assertions (which paths it proxies, and to where) on top of these.
import { readFileSync } from 'node:fs'

/**
 * The rules of a `_redirects` file: one array of whitespace-separated fields
 * per rule ([from, to, status?, …]); blank lines and `#` comments dropped.
 * @param {string} text
 * @returns {string[][]}
 */
export function parseRedirects(text) {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/))
}

/** parseRedirects of a file on disk. @param {string | URL} file */
export function readRedirects(file) {
  return parseRedirects(readFileSync(file, 'utf8'))
}

/**
 * Rules that proxy (and so would run) a script: a `.js`/`.mjs` source or
 * target. A vendored script must be served from the origin, not proxied.
 * @param {string[][]} rules
 */
export function scriptProxies(rules) {
  return rules.filter(([from = '', to = '']) => /\.m?js$/.test(from) || /\.m?js(\?|$)/.test(to))
}

/** Rules whose target is another origin (http/https). @param {string[][]} rules */
export function externalRules(rules) {
  return rules.filter(([, to]) => /^https?:/.test(to ?? ''))
}
