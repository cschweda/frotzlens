#!/usr/bin/env node
// frotzlens — the Frotzlens CLI. GPL-3.0-or-later.
import { readFileSync } from 'node:fs'
import { main } from './main.js'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
process.exitCode = main(process.argv.slice(2), {
  stdout: s => process.stdout.write(s),
  stderr: s => process.stderr.write(s),
  readFile: p => new Uint8Array(readFileSync(p)),
  version: pkg.version,
})
