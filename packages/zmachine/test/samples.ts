import { readdirSync, readFileSync } from 'node:fs'

const DIR = new URL('../../../samples/', import.meta.url)

/** Every built sample story (v3, v5, v8; v4 once built), by file name. */
export const sampleFiles = (): string[] => readdirSync(DIR).filter(f => /\.z[3458]$/.test(f)).sort()

export const readSample = (name: string) => new Uint8Array(readFileSync(new URL(name, DIR)))

/** A command script: one command per line or several split by '.', '!' lines are comments. */
export function readScript(path: URL): string[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('!'))
    .flatMap(l => l.split('.'))
    .map(c => c.trim().replace(/^>\s*/, ''))
    .filter(Boolean)
}
