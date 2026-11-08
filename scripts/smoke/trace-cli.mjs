// Smoke test for a packed frotztrace (the CLI), run by publish.sh in a scratch project where the
// tarball is installed (with @frotzinc/zcode, zmachine and inform6-wasm from npm). Compiles a tiny
// Standard Library game with the installed inform6-wasm, then runs the installed bin on it: a
// script played to an action breakpoint (exit 2), the stack named with and without the debug file.
// Exits non-zero on any problem.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compile } from '@frotzinc/inform6-wasm'

const bin = join(dirname(fileURLToPath(import.meta.url)), 'node_modules', '.bin', 'frotztrace')
const dir = mkdtempSync(join(tmpdir(), 'frotztrace-smoke-'))
try {
  const game = await compile(
    'Constant Story "T";\nInclude "Parser";\nInclude "VerbLib";\nObject Hall "Hall" with description "A hall.", has light;\nObject -> lamp "brass lamp" with name \'brass\' \'lamp\';\n[ Initialise; location = Hall; ];\nInclude "Grammar";\n',
    { debug: true },
  )
  if (!game.ok) throw new Error(`compile failed:\n${game.rawOutput}`)
  writeFileSync(join(dir, 'game.z5'), game.story)
  writeFileSync(join(dir, 'gameinfo.dbg'), game.dbg)
  writeFileSync(join(dir, 'script.txt'), 'look\ntake lamp\n')
  const run = (...args) => {
    const r = spawnSync(bin, args, { cwd: dir, encoding: 'utf8' })
    if (r.error) throw r.error
    return r
  }
  const check = (ok, what) => { if (!ok) throw new Error(what) }

  const v = run('--version')
  check(v.status === 0 && /^frotztrace \d+\.\d+\.\d+/.test(v.stdout), `--version: ${v.stdout}${v.stderr}`)
  const named = run('game.z5', '--script', 'script.txt', '--symbols', 'gameinfo.dbg', '--break', 'action:Take')
  check(named.status === 2 && named.stdout.includes('[breakpoint] action Take') && named.stdout.includes('noun: lamp'), `--symbols: ${named.stdout}${named.stderr}`)
  const inferred = run('game.z5', '--script', 'script.txt', '--break', 'action:Take')
  check(inferred.status === 2 && inferred.stdout.includes('InformLibrary.begin_action'), `inferred names: ${inferred.stdout}${inferred.stderr}`)
  console.log('frotztrace: --version, and an action breakpoint with the debug file and with names worked out')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
