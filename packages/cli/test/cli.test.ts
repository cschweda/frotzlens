import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { main, USAGE, type Io } from '../src/main.js'

const FIXTURES = fileURLToPath(new URL('../../zcode/test/.fixtures/', import.meta.url))
const GOLDEN = fileURLToPath(new URL('../../zcode/test/golden/', import.meta.url))
const BIN = fileURLToPath(new URL('../dist/bin.js', import.meta.url))

function run(argv: string[]) {
  let out = ''
  let err = ''
  const io: Io = {
    stdout: s => void (out += s),
    stderr: s => void (err += s),
    readFile: p => new Uint8Array(readFileSync(FIXTURES + p)),
    version: '9.9.9',
  }
  return { code: main(argv, io), out, err }
}
const golden = (name: string, opt: string) => readFileSync(`${GOLDEN}${name}.${opt}.txt`, 'latin1')

describe('frotzlens (the Phase 1 exit criterion)', () => {
  it('`npx frotzlens --objects dark-cellar.z5` prints exactly what `infodump -o` does', () => {
    const r = spawnSync(process.execPath, [BIN, '--objects', 'dark-cellar.z5'], { cwd: FIXTURES, encoding: 'latin1' })
    expect(r.status).toBe(0)
    expect(r.stderr).toBe('')
    expect(r.stdout).toBe(golden('dark-cellar', 'o'))
  })
})

describe('options', () => {
  it.each([
    ['--header', 'i'], ['-i', 'i'], ['--abbreviations', 'a'], ['-a', 'a'],
    ['--objects', 'o'], ['-o', 'o'], ['--tree', 't'], ['-t', 't'], ['--dict', 'd'], ['-d', 'd'],
  ])('%s', (flag, opt) => {
    expect(run([flag, 'hermit.z5']).out).toBe(golden('hermit', opt))
  })

  it('the header by default', () => {
    expect(run(['demo.z5']).out).toBe(golden('demo', 'i'))
  })

  it('several sections: one "Story file is" line, then each section in infodump\'s order', () => {
    const r = run(['-ot', 'demo.z5'])
    expect(r.out).toBe(golden('demo', 'o') + golden('demo', 't').replace('\nStory file is demo.z5\n', ''))
    expect(run(['--tree', '--objects', 'demo.z5']).out).toBe(r.out)
  })

  it('--width 0 never wraps', () => {
    // mingus-1 has a 22-byte property, which infodump wraps at 79 columns.
    const wrapped = run(['-o', 'mingus-1.z5']).out
    const unwrapped = run(['-o', '-w', '0', 'mingus-1.z5']).out
    expect(unwrapped.split('\n').length).toBe(wrapped.split('\n').length - 1)
  })

  it('--json prints the model, bytes as hex and without the story itself', () => {
    const r = run(['--json', 'minimal.z5'])
    const model = JSON.parse(r.out)
    expect(model.bytes).toBeUndefined()
    expect(model.header.version).toBe(5)
    expect(model.objects.objects).toHaveLength(4)
    expect(model.errors).toEqual([])
  })
})

describe('exit codes and messages', () => {
  it('--help and --version', () => {
    expect(run(['--help'])).toEqual({ code: 0, out: USAGE, err: '' })
    expect(run(['-v']).out).toBe('frotzlens 9.9.9\n')
  })

  it('usage errors exit 2', () => {
    expect(run([]).code).toBe(2)
    expect(run(['--nope', 'x.z5']).code).toBe(2)
    expect(run(['-q', 'x.z5']).err).toContain('unknown option -q')
    expect(run(['-w', 'wide', 'x.z5']).code).toBe(2)
  })

  it('an unreadable file exits 1 and says so', () => {
    const r = run(['no-such-file.z5'])
    expect(r.code).toBe(1)
    expect(r.err).toContain("can't read no-such-file.z5")
  })
})
