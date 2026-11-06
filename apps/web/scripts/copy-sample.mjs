// Copies the "Try a sample" story from the repository's samples/ into public/samples/, so it's
// served with the site without being committed twice.
// The file is named once, in site.config.ts (`sample.file`), and read from there.
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'

const config = readFileSync(new URL('../site.config.ts', import.meta.url), 'utf8')
const file = config.match(/sample:\s*\{\s*file:\s*'([^']+)'/)?.[1]
if (!file || !/^[\w.-]+$/.test(file)) throw new Error('copy-sample: no sample.file in site.config.ts')
const to = new URL('../public/samples/', import.meta.url)
mkdirSync(to, { recursive: true })
copyFileSync(new URL(`../../../samples/${file}`, import.meta.url), new URL(file, to))
