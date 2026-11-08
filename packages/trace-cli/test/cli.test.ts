/** The frotztrace CLI (docs/18 §4), run in memory on the samples. */
import { readFileSync } from 'node:fs'
import { play } from '@frotzinc/zmachine'
import { describe, expect, it } from 'vitest'
import { EXIT, main, readCommands } from '../src/main.js'

const SAMPLES = new URL('../../../samples/', import.meta.url)
const STORY = 'dark-cellar.z5'
const SCRIPT = 'walkthroughs/dark-cellar.txt'

function run(argv: string[], extra: Record<string, string> = {}) {
  let out = ''
  let err = ''
  const code = main(argv, {
    stdout: s => (out += s),
    stderr: s => (err += s),
    readFile: p => (p in extra ? new TextEncoder().encode(extra[p]) : new Uint8Array(readFileSync(new URL(p, SAMPLES)))),
    version: '0.0.0-test',
  })
  return { code, out, err }
}

describe('frotztrace', () => {
  it('plays the script to the end (exit 0), printing what play() prints', () => {
    const r = run([STORY, '--script', SCRIPT])
    expect(r.code).toBe(EXIT.done)
    expect(r.err).toBe('')
    const commands = readCommands(readFileSync(new URL(SCRIPT, SAMPLES), 'utf8'))
    const turns = play(new Uint8Array(readFileSync(new URL(STORY, SAMPLES))), commands, { seed: 1 }).turns
    for (const t of turns) expect(r.out).toContain(t.output)
    for (const c of commands) expect(r.out).toContain(`> ${c}`)
  })

  it('stops at a routine given by its txd name, prints the stack, and exits 2', () => {
    const r = run([STORY, '--script', SCRIPT, '--break', 'R0097'])
    expect(r.code).toBe(EXIT.breakpoint)
    expect(r.out).toMatch(/\[breakpoint\] R0097 · turn 1 · instruction \d+ · pc [0-9a-f]+/)
    expect(r.out).toMatch(/Stack \(innermost first\):\n {2}#0 {2}R0097 \([0-9a-f]+\) {2}at [0-9a-f]+ {2}L00=\d+/)
    expect(r.out).toMatch(/#\d+ {2}\(main\)/)
    // It stopped in turn 1: nothing after the first command was played.
    expect(r.out.match(/^> /gm)).toHaveLength(1)
  })

  it('takes a routine by address too', () => {
    const byName = run([STORY, '--script', SCRIPT, '--break', 'R0097'])
    const address = /#0 {2}R0097 \(([0-9a-f]+)\)/.exec(byName.out)![1]!
    const r = run([STORY, '--script', SCRIPT, '--break', `0x${address}`])
    expect(r.code).toBe(EXIT.breakpoint)
    expect(r.out).toContain(`#0  R0097 (${address})`)
  })

  it('refuses a routine that isn’t there (exit 1)', () => {
    const r = run([STORY, '--break', 'NoSuchRoutine'])
    expect(r.code).toBe(EXIT.error)
    expect(r.err).toContain("there's no routine 'NoSuchRoutine'")
    expect(run([STORY, '--break', '0x1']).code).toBe(EXIT.error)
  })

  it('traces calls and returns, indented by depth', () => {
    const r = run([STORY, '--script', SCRIPT, '--trace', 'calls'])
    expect(r.code).toBe(EXIT.done)
    expect(r.out).toMatch(/^ {2}→ R0002\(\)$/m)
    expect(r.out).toMatch(/^ +← R\d{4} \d+$/m)
  })

  it('exits 3 when the story quits before the script ends', () => {
    const r = run([STORY, '--script', 'quit.txt'], { 'quit.txt': 'quit\ny\nlook\n' })
    expect(r.code).toBe(EXIT.quit)
  })

  it('exits 1 on a usage error, and 0 for --help and --version', () => {
    expect(run([]).code).toBe(EXIT.error)
    expect(run([STORY, '--trace', 'everything']).code).toBe(EXIT.error)
    expect(run([STORY, '--seed', 'x']).code).toBe(EXIT.error)
    expect(run([STORY, '--bogus']).code).toBe(EXIT.error)
    expect(run(['--help']).out).toContain('Usage: frotztrace')
    expect(run(['--version']).out).toBe('frotztrace 0.0.0-test\n')
  })

  it('says why it can’t read a story', () => {
    const r = run(['junk.z5'], { 'junk.z5': 'not a story' })
    expect(r.code).toBe(EXIT.error)
    expect(r.err).toContain('frotztrace:')
  })

  it('is deterministic: the same script and seed give the same output', () => {
    expect(run([STORY, '--script', SCRIPT, '--trace', 'calls']).out).toBe(run([STORY, '--script', SCRIPT, '--trace', 'calls']).out)
  })
})

describe('readCommands', () => {
  it('reads the script format zmachine-run reads', () => {
    expect(readCommands('! a comment\n> look\ntake lamp. light lamp\n[timeout]\n[key x]\n\n')).toEqual(['look', 'take lamp', 'light lamp', '[timeout]', '[key x]'])
  })
})
