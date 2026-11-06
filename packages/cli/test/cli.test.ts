import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { gunzipSync } from 'node:zlib'
import { join } from 'node:path'
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
// The golden files are ASCII; the CLI writes UTF-8 (a deliberate difference only for non-ASCII text).
const golden = (name: string, opt: string) => readFileSync(`${GOLDEN}${name}.${opt}.txt`, 'utf8')

describe('frotzlens (the Phase 1 exit criterion)', () => {
  it('`npx frotzlens --objects dark-cellar.z5` prints exactly what `infodump -o` does', () => {
    const r = spawnSync(process.execPath, [BIN, '--objects', 'dark-cellar.z5'], { cwd: FIXTURES, encoding: 'utf8' })
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

  it('the disassembly by default, as txd prints it; -n as txd -n', () => {
    const txd = (mode: string) => gunzipSync(readFileSync(`${GOLDEN}demo.${mode}.txt.gz`)).toString('latin1')
    expect(run(['demo.z5']).out).toBe(txd('txd'))
    expect(run(['-n', 'demo.z5']).out).toBe(txd('txd-n'))
    expect(run(['--txd', '--addresses', 'demo.z5']).out).toBe(txd('txd-n'))
  })

  it('--routine prints one routine, as it appears in txd', () => {
    const r = run(['--routine', '0x27f8', 'dark-cellar.z5'])
    expect(r.code).toBe(0)
    expect(r.err).toBe('')
    // The whole block: exactly as it appears inside txd's output.
    const txd = gunzipSync(readFileSync(`${GOLDEN}dark-cellar.txd.txt.gz`)).toString('latin1')
    const start = txd.indexOf('Routine R0002, 0 locals\n')
    // Up to the blank line that separates it from the next routine.
    expect(r.out).toBe(txd.slice(start, txd.indexOf('\nRoutine R0003', start)))
    expect(run(['--routine', '27f9', 'dark-cellar.z5'])).toMatchObject({ code: 1, err: expect.stringContaining('no routine starts at 27f9') })
    expect(run(['--routine', 'xyz', 'dark-cellar.z5']).code).toBe(2)
  })

  it('-m and -g, and -f as infodump -f (header, map, abbreviations, objects, tree, grammar, dictionary)', () => {
    expect(run(['-m', 'hermit.z5']).out).toBe(golden('hermit', 'm'))
    expect(run(['-g', 'hermit.z5']).out).toBe(golden('hermit', 'g'))
    const parts = ['i', 'm', 'a', 'o', 't', 'g', 'd'].map((o, n) => (n ? golden('hermit', o).replace('\nStory file is hermit.z5\n', '') : golden('hermit', o)))
    expect(run(['-f', 'hermit.z5']).out).toBe(parts.join(''))
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

  it('-f and --all are -imaotgd', () => {
    const all = run(['-imaotgd', 'hermit.z5']).out
    expect(run(['-f', 'hermit.z5']).out).toBe(all)
    expect(run(['--all', 'hermit.z5']).out).toBe(all)
  })

  it('--json prints the model as plain JSON, without the story\'s own bytes', () => {
    const r = run(['--json', 'dark-cellar.z5'])
    const model = JSON.parse(r.out)
    expect(model.bytes).toBeUndefined()
    expect(model.file).toBeUndefined()
    expect(model.header.version).toBe(5)
    expect(model.objects.objects).toHaveLength(29)
    expect(model.errors).toEqual([])
    // Property data is a plain array of byte values.
    const data = model.objects.objects[6].properties[0].data
    expect(Array.isArray(data) && data.every((b: unknown) => Number.isInteger(b))).toBe(true)
  })

  it('--json with several files is one JSON array, each with its file', () => {
    const models = JSON.parse(run(['--json', 'minimal.z5', 'demo.z5']).out)
    expect(models.map((m: { file: string }) => m.file)).toEqual(['minimal.z5', 'demo.z5'])
  })

  it('--json with several files is an array even when only one could be read', () => {
    const r = run(['--json', 'minimal.z5', 'missing.z5'])
    expect(r.code).toBe(1)
    expect(JSON.parse(r.out).map((m: { file: string }) => m.file)).toEqual(['minimal.z5'])
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

  it('a blank --width is a usage error, not "never wrap"', () => {
    expect(run(['-w', '', 'demo.z5']).code).toBe(2)
    expect(run(['-w', ' ', 'demo.z5']).code).toBe(2)
  })

  it('a Blorb file: the error, and no made-up header', () => {
    const dir = mkdtempSync(join(tmpdir(), 'frotzlens-cli-'))
    try {
      writeFileSync(join(dir, 'game.zblorb'), Buffer.concat([Buffer.from('FORM\0\0\0\x38IFRS'), Buffer.alloc(56)]))
      const r = spawnSync(process.execPath, [BIN, 'game.zblorb'], { cwd: dir, encoding: 'utf8' })
      expect(r.status).toBe(1)
      expect(r.stdout).toBe('')
      expect(r.stderr).toContain('Blorb')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('piped into a reader that stops early, it exits quietly', () => {
    const r = spawnSync('sh', ['-c', `"${process.execPath}" "${BIN}" -f architect-legacy.z5 | head -1`], { cwd: FIXTURES, encoding: 'utf8' })
    expect(r.stderr).toBe('')
    expect(r.stdout).toBe('\n')
  })

  it('a version this package does not disassemble shows its header', () => {
    const dir = mkdtempSync(join(tmpdir(), 'frotzlens-cli-'))
    try {
      const b = readFileSync(`${FIXTURES}minimal.z5`)
      b[0] = 6
      writeFileSync(join(dir, 'v6.z6'), b)
      const r = spawnSync(process.execPath, [BIN, 'v6.z6'], { cwd: dir, encoding: 'utf8' })
      expect(r.status).toBe(1)
      expect(r.stdout).toContain('    **** Story file header ****')
      expect(r.stdout).not.toContain('[Start of code')
      expect(r.stderr).toContain('not supported')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('an unreadable file exits 1 and says so', () => {
    const r = run(['no-such-file.z5'])
    expect(r.code).toBe(1)
    expect(r.err).toContain("can't read no-such-file.z5")
  })
})
