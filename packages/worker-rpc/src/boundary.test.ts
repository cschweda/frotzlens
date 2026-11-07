/**
 * The MIT/GPL line: no file in this package may import from a frotzsmith
 * (GPL app) path. Nuxt aliases (`~/`, `~~/`, `#imports`) mean app code.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = new URL('.', import.meta.url).pathname
const FORBIDDEN = /from\s+['"](~~?\/|#imports|#app|[./]*frotzsmith)/

describe('package boundary', () => {
  it('imports nothing from an app', () => {
    for (const f of readdirSync(SRC).filter(f => /\.(ts|mjs|js)$/.test(f))) {
      expect(readFileSync(join(SRC, f), 'utf8'), f).not.toMatch(FORBIDDEN)
    }
  })
})
