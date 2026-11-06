import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const FIXTURES_DIR = fileURLToPath(new URL('./.fixtures/', import.meta.url))
export const GOLDEN_DIR = fileURLToPath(new URL('./golden/', import.meta.url))

/** Every compiled fixture story, by file name (e.g. `dark-cellar.z5`). */
export const storyFiles = (): string[] => readdirSync(FIXTURES_DIR).filter(f => /\.z\d$/.test(f)).sort()

export const readStory = (file: string): Uint8Array => new Uint8Array(readFileSync(FIXTURES_DIR + file))
