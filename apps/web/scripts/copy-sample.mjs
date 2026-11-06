// Copies the "Try a sample" story from the repository's samples/ into public/samples/, so it's
// served with the site without being committed twice.
import { copyFileSync, mkdirSync } from 'node:fs'

const from = new URL('../../../samples/dark-cellar.z5', import.meta.url)
const to = new URL('../public/samples/', import.meta.url)
mkdirSync(to, { recursive: true })
copyFileSync(from, new URL('dark-cellar.z5', to))
