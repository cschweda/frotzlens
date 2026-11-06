import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { buildCommit, packageVersion } from './version.mjs'

describe('version', () => {
  test('packageVersion reads the version field', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ver-'))
    try {
      writeFileSync(join(dir, 'package.json'), '{"version":"1.2.3"}')
      expect(packageVersion(join(dir, 'package.json'))).toBe('1.2.3')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('buildCommit is a short hash and a date, or null outside git', () => {
    const c = buildCommit(new URL('.', import.meta.url))
    if (c) {
      expect(c.commit).toMatch(/^[0-9a-f]{7,12}$/)
      expect(c.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
    expect(buildCommit(tmpdir())).toBeNull()
  })
})
