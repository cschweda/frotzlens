import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
// @ts-expect-error — a plain .mjs script, shared with scripts/golden.sh
import { fixtureFiles } from '../scripts/build-fixtures.mjs'

export const FIXTURES_DIR = fileURLToPath(new URL('./.fixtures/', import.meta.url))
export const GOLDEN_DIR = fileURLToPath(new URL('./golden/', import.meta.url))

/** Every fixture story, by file name (e.g. `dark-cellar.z5`), from the build recipe, not the folder. */
export const storyFiles = (): string[] => (fixtureFiles() as string[]).slice().sort()

export const readStory = (file: string): Uint8Array => new Uint8Array(readFileSync(FIXTURES_DIR + file))
