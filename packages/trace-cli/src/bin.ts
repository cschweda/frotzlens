#!/usr/bin/env node
// frotztrace — the frotztrace CLI. GPL-3.0-or-later.
import { readFileSync, writeFileSync } from 'node:fs'
import { main } from './main.js'

// Piped into something that stops reading (`frotztrace game.z5 --trace calls | head`): stop quietly.
process.stdout.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EPIPE') process.exit(0)
  throw e
})

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
void main(process.argv.slice(2), {
  stdout: s => process.stdout.write(s),
  stderr: s => process.stderr.write(s),
  readFile: p => new Uint8Array(readFileSync(p)),
  writeFile: (p, data) => writeFileSync(p, data),
  version: pkg.version,
}).then(code => {
  process.exitCode = code
})
