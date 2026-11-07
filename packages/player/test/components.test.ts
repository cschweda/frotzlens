/** Component tests: styled runs (O6, O7) and the fault path (S3). */
// (Paths from the package folder: under happy-dom, import.meta.url isn't a file: URL.)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ZRuns from '../src/components/ZRuns.vue'
import { useMachine } from '../src/composables/useMachine'

const run = (text: string, style = 0, extra = {}) => ({ text, style, fg: 1, bg: 1, font: 1, ...extra })

describe('ZRuns (O6, O7)', () => {
  it('bold is <b>, italic <i>, reverse and fixed-pitch are classes, game colours are theme classes', () => {
    const html = mount(ZRuns, { props: { runs: [run('bold', 2), run('italic', 4), run('both', 6), run('rev', 1), run('red', 0, { fg: 3 })] } }).html()
    expect(html).toContain('<b>bold</b>')
    expect(html).toContain('<i>italic</i>')
    expect(html).toContain('<b><i>both</i></b>')
    expect(html).toMatch(/class="zp-run--reverse">rev/)
    expect(html).toMatch(/class="zp-c3">red/)
    expect(html).not.toMatch(/<strong|<em|<code/)
    expect(html).not.toMatch(/style=/)
  })
  it('fixed-pitch text over several lines is its own focusable, scrolling block', () => {
    const w = mount(ZRuns, { props: { runs: [run('A map:\n'), run('+--+\n|  |\n+--+\n', 8)] } })
    const pre = w.find('pre.zp-fixedblock')
    expect(pre.exists()).toBe(true)
    expect(pre.attributes('tabindex')).toBe('0')
    expect(pre.text()).toContain('+--+')
  })
})

describe('useMachine: a story that stops is an error in words, with a way back (S3)', () => {
  it('a fault mid-game leaves the phase "fault", a message, and "back one turn"', async () => {
    const story = new Uint8Array(readFileSync(join(process.cwd(), '../../samples/dark-cellar.z5')))
    const m = useMachine(story, { seed: 1 })
    await m.start()
    expect(m.state.phase).toBe('line')
    await m.submitLine('look')
    // Break the machine: point the next instruction at bytes that aren't code.
    const snap = m.snapshot()!
    snap.pc = 0x40
    snap.input.pending = null
    await m.continueFrom(snap)
    expect(m.state.phase).toBe('fault')
    expect(m.state.fault?.message.length).toBeGreaterThan(10)
    expect(m.canGoBack()).toBe(true)
    expect(await m.backOneTurn()).toBe(true)
    expect(m.state.phase).toBe('line')
  })
  it('a file that isn’t a story is a fault in words, never a throw', async () => {
    const m = useMachine(new Uint8Array(10), { seed: 1 })
    await m.start()
    expect(m.state.phase).toBe('fault')
    expect(m.state.fault?.message).toMatch(/too short/)
  })
})

describe('the player’s theme values are the family palette’s', () => {
  it('dark, light and high contrast agree with nuxt-base/css/palette.css', () => {
    const palette = readFileSync(join(process.cwd(), '../nuxt-base/css/palette.css'), 'utf8')
    const player = readFileSync(join(process.cwd(), 'src/player.css'), 'utf8')
    const block = (css: string, selector: string) => css.slice(css.indexOf(selector), css.indexOf('}', css.indexOf(selector)))
    const val = (css: string, name: string) => new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(css)?.[1]?.toLowerCase()
    const pairs: [string, string][] = [['frotz-ground', 'zp-ground'], ['frotz-panel', 'zp-panel'], ['frotz-ink', 'zp-ink'], ['frotz-ink-muted', 'zp-muted'], ['frotz-rule', 'zp-rule'], ['frotz-lamp', 'zp-lamp'], ['frotz-lamp-text', 'zp-lamp-text']]
    for (const [pal, pl] of [['\n:root {', '.zp {'], ['\n.light {', ".zp[data-theme='light'] {"], ['\n.high-contrast {', ".zp[data-theme='high-contrast'] {"]] as const) {
      for (const [a, b] of pairs) expect(val(block(player, pl), b), `${pl} ${b}`).toBe(val(block(palette, pal), a))
    }
  })
})
