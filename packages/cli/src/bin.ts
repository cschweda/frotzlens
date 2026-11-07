#!/usr/bin/env node
// frotzlens — the frotzlens CLI. GPL-3.0-or-later.
import { readFileSync } from 'node:fs'
import { main } from './main.js'

// Piped into something that stops reading (`frotzlens -f game.z5 | head`): stop quietly.
process.stdout.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EPIPE') process.exit(0)
  throw e
})

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
void Promise.resolve(main(process.argv.slice(2), {
  stdout: s => process.stdout.write(s),
  stderr: s => process.stderr.write(s),
  readFile: p => new Uint8Array(readFileSync(p)),
  version: pkg.version,
})).then(code => {
  process.exitCode = code
})
