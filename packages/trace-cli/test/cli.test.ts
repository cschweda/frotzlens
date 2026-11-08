/** The frotztrace CLI (docs/18 §4), run in memory on the samples. */
import { readFileSync } from 'node:fs'
import { play, readQuetzal } from '@frotzinc/zmachine'
import { readSymbols } from '@frotzinc/zcode'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { EXIT, main, readCommands } from '../src/main.js'

const SAMPLES = new URL('../../../samples/', import.meta.url)
const STORY = 'dark-cellar.z5'
const SCRIPT = 'walkthroughs/dark-cellar.txt'

const written = new Map<string, Uint8Array>()
async function run(argv: string[], extra: Record<string, string> = {}) {
  let out = ''
  let err = ''
  const code = await main(argv, {
    stdout: s => (out += s),
    stderr: s => (err += s),
    readFile: p => (p in extra ? new TextEncoder().encode(extra[p]) : written.get(p) ?? new Uint8Array(readFileSync(p.startsWith('/') ? p : new URL(p, SAMPLES)))),
    writeFile: (p, data) => written.set(p, data),
    version: '0.0.0-test',
  })
  return { code, out, err }
}

describe('frotztrace', async () => {
  it('plays the script to the end (exit 0), printing what play() prints', async () => {
    const r = await run([STORY, '--script', SCRIPT])
    expect(r.code).toBe(EXIT.done)
    expect(r.err).toBe('')
    const commands = readCommands(readFileSync(new URL(SCRIPT, SAMPLES), 'utf8'))
    const turns = play(new Uint8Array(readFileSync(new URL(STORY, SAMPLES))), commands, { seed: 1 }).turns
    for (const t of turns) expect(r.out).toContain(t.output)
    for (const c of commands) expect(r.out).toContain(`> ${c}`)
  })

  it('stops at a routine given by its txd name, prints the stack, and exits 2', async () => {
    const r = await run([STORY, '--script', SCRIPT, '--break', 'R0097'])
    expect(r.code).toBe(EXIT.breakpoint)
    expect(r.out).toMatch(/\[breakpoint\] R0097 · turn 1 · instruction \d+ · pc [0-9a-f]+/)
    expect(r.out).toMatch(/Stack \(innermost first\):\n {2}#0 {2}R0097 \([0-9a-f]+\) {2}at [0-9a-f]+ {2}L00=\d+/)
    expect(r.out).toMatch(/#\d+ {2}\(main\)/)
    // It stopped in turn 1: nothing after the first command was played.
    expect(r.out.match(/^> /gm)).toHaveLength(1)
  })

  it('takes a routine by address too', async () => {
    const byName = await run([STORY, '--script', SCRIPT, '--break', 'R0097'])
    const address = /#0 {2}R0097 \(([0-9a-f]+)\)/.exec(byName.out)![1]!
    const r = await run([STORY, '--script', SCRIPT, '--break', `0x${address}`])
    expect(r.code).toBe(EXIT.breakpoint)
    expect(r.out).toContain(`#0  R0097 (${address})`)
  })

  it('refuses a routine that isn’t there (exit 1)', async () => {
    const r = await run([STORY, '--break', 'NoSuchRoutine'])
    expect(r.code).toBe(EXIT.error)
    expect(r.err).toContain("there's no routine 'NoSuchRoutine'")
    expect((await run([STORY, '--break', '0x1'])).code).toBe(EXIT.error)
  })

  it('traces calls and returns, indented by depth', async () => {
    const r = await run([STORY, '--script', SCRIPT, '--trace', 'calls'])
    expect(r.code).toBe(EXIT.done)
    expect(r.out).toMatch(/^ {2}→ R0002\(\)$/m)
    expect(r.out).toMatch(/^ +← R\d{4} \d+$/m)
  })

  it('exits 3 when the story quits before the script ends', async () => {
    const r = await run([STORY, '--script', 'quit.txt'], { 'quit.txt': 'quit\ny\nlook\n' })
    expect(r.code).toBe(EXIT.quit)
  })

  it('exits 1 on a usage error, and 0 for --help and --version', async () => {
    expect((await run([])).code).toBe(EXIT.error)
    expect((await run([STORY, '--trace', 'everything'])).code).toBe(EXIT.error)
    expect((await run([STORY, '--seed', 'x'])).code).toBe(EXIT.error)
    expect((await run([STORY, '--bogus'])).code).toBe(EXIT.error)
    expect((await run(['--help'])).out).toContain('Usage: frotztrace')
    expect((await run(['--version'])).out).toBe('frotztrace 0.0.0-test\n')
  })

  it('says why it can’t read a story', async () => {
    const r = await run(['junk.z5'], { 'junk.z5': 'not a story' })
    expect(r.code).toBe(EXIT.error)
    expect(r.err).toContain('frotztrace:')
  })

  it('is deterministic: the same script and seed give the same output', async () => {
    expect((await run([STORY, '--script', SCRIPT, '--trace', 'calls'])).out).toBe((await run([STORY, '--script', SCRIPT, '--trace', 'calls'])).out)
  })
})

describe('readCommands', async () => {
  it('reads the script format zmachine-run reads', async () => {
    expect(readCommands('! a comment\n> look\ntake lamp. light lamp\n[timeout]\n[key x]\n\n')).toEqual(['look', 'take lamp', 'light lamp', '[timeout]', '[key x]'])
  })
})

describe('frotztrace, the Inform layer (docs/20)', () => {
  const FIX = fileURLToPath(new URL('../../zcode/test/.fixtures/', import.meta.url))
  const FSTORY = `${FIX}dark-cellar.z5`
  const DBG = `${FIX}dark-cellar.dbg`
  const SCRIPT_PATH = fileURLToPath(new URL(SCRIPT, SAMPLES))

  it('the deliverable: --break action:Take on a bare story stops in turn 3, with a named stack (exit 2)', async () => {
    const r = await run([STORY, '--script', SCRIPT, '--break', 'action:Take'])
    expect(r.code).toBe(EXIT.breakpoint)
    expect(r.err).toContain('working out names from the story')
    expect(r.out).toMatch(/\[breakpoint\] action Take · turn 3 · instruction \d+ · pc [0-9a-f]+/)
    expect(r.out).toMatch(/action: Take · noun: \w+ · second: nothing/)
    expect(r.out).toMatch(/#0 {2}InformLibrary\.begin_action \([0-9a-f]+\)/)
    expect(r.out).toMatch(/#\d+ {2}Main \(/)
  })

  it('with --symbols and --if, at the right turn, with source lines', async () => {
    const r = await run([FSTORY, '--symbols', DBG, '--script', SCRIPT_PATH, '--break', 'action:Take', '--if', 'noun == rusty_key'])
    expect(r.code).toBe(EXIT.breakpoint)
    expect(r.err).toBe('')
    expect(r.out).toMatch(/\[breakpoint\] action Take · turn 6 .* · Parser:\d+/)
    expect(r.out).toContain('action: Take · noun: rusty_key')
  })

  it('a source line, and printed text', async () => {
    const init = Object.values(readSymbols(readFileSync(DBG, 'utf8')).routines).find(x => x.name === 'Initialise')!
    const line = init.location!.line + 1
    const a = await run([FSTORY, '--symbols', DBG, '--break', `line:story.inf:${line}`])
    expect(a.code).toBe(EXIT.breakpoint)
    expect(a.out).toContain(`[breakpoint] line story.inf:${line}`)
    expect(a.out).toMatch(new RegExp(`#0 {2}Initialise \\([0-9a-f]+\\) {2}at [0-9a-f]+ \\(story\\.inf:${line}\\)`))
    const b = await run([STORY, '--script', SCRIPT, '--break', 'text:"Taken."'])
    expect(b.code).toBe(EXIT.breakpoint)
    expect(b.out).toContain('printed "Taken."')
  })

  it('--watch prints each change, turn by turn', async () => {
    const r = await run([FSTORY, '--symbols', DBG, '--script', SCRIPT_PATH, '--watch', 'lantern in player, score'])
    expect(r.code).toBe(EXIT.done)
    expect(r.out).toContain('[watch] lantern in player: 0 → 1')
    expect(r.out).not.toContain('[watch] score:')
  })

  it('--save-at writes the story’s own save, which --quetzal reads back', async () => {
    const save = '/virtual/cellar.qzl'
    const r = await run([FSTORY, '--symbols', DBG, '--script', SCRIPT_PATH, '--save-at', '3', save])
    expect(r.code).toBe(EXIT.done)
    expect(r.out).toContain(`[saved to ${save}]`)
    const bytes = written.get(save)!
    const story = new Uint8Array(readFileSync(FSTORY))
    expect(readQuetzal(bytes, story.slice(0, (story[0x0e]! << 8) | story[0x0f]!)).frames.length).toBeGreaterThan(2)
    const q = await run([FSTORY, '--symbols', DBG, '--quetzal', save])
    expect(q.code).toBe(EXIT.done)
    expect(q.out).toMatch(/#0 {2}SaveSub/)
    expect(q.out).toMatch(/location +\d+/)
    expect(q.out).toContain('action: Save')
  })

  it('refuses what can’t work, in words (exit 1)', async () => {
    const line = await run([STORY, '--break', 'line:story.inf:10'])
    expect(line.code).toBe(EXIT.error)
    expect(line.err).toContain('line breakpoints need the debug file')
    const action = await run([FSTORY, '--symbols', DBG, '--break', 'action:Fly'])
    expect(action.err).toContain("there's no action called Fly")
    expect((await run([STORY, '--if', 'noun'])).code).toBe(EXIT.error)
    const cond = await run([FSTORY, '--symbols', DBG, '--break', 'action:Take', '--if', 'noun =='])
    expect(cond.err).toContain("the condition doesn't parse")
  })
})
