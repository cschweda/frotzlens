/**
 * The MIT/GPL line: no file in this package may import from an app.
 * Nuxt app aliases (`~/`, `~~/`) are allowed only in the sense that a layer's
 * own files may never use them to reach the consuming app; this package uses
 * none at all.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = new URL('.', import.meta.url).pathname
const FORBIDDEN = /from\s+['"](~~?\/|#imports|#app|[./]*frotzsmith)/

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (f === 'node_modules' || f === '.nuxt') return []
    return statSync(p).isDirectory() ? files(p) : /\.(ts|mjs|js|vue)$/.test(f) ? [p] : []
  })
}

describe('package boundary', () => {
  it('imports nothing from an app', () => {
    for (const f of files(ROOT)) expect(readFileSync(f, 'utf8'), f).not.toMatch(FORBIDDEN)
  })
})
