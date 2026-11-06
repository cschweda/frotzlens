// A build's version and commit, read at build time (an app's nuxt.config
// defines them as constants for its About panel).
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * The `version` field of a package.json.
 * @param {string | URL} pkgJson path or file URL of the package.json
 * @returns {string} such as `0.1.0`
 */
export function packageVersion(pkgJson) {
  return String(JSON.parse(readFileSync(pkgJson, 'utf8')).version)
}

/**
 * The commit being built, as its short hash and its date (`2026-11-04`), or
 * null when git isn't there to ask (a build from a source archive). The
 * commit's date, not the build's, so building the same commit twice gives the
 * same files.
 * @param {string | URL} cwd the repository (or any folder inside it)
 * @returns {{ commit: string, date: string } | null}
 */
export function buildCommit(cwd = process.cwd()) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%h %cs'], {
      cwd: cwd instanceof URL ? fileURLToPath(cwd) : cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    }).trim()
    const [commit = '', date = ''] = out.split(' ')
    if (/^[0-9a-f]{7,12}$/.test(commit) && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { commit, date }
    }
  } catch {
    // No git, or not a repository.
  }
  return null
}
