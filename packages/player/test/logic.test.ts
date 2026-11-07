/** Unit tests: the announcements (O2–O4, O8), keys (I3), settings, shortcuts (I6). */
import { describe, expect, it } from 'vitest'
import { statusSentence, timedNotice, turnAnnouncement } from '../src/announce'
import { keyToZscii } from '../src/keys'
import { DEFAULTS, loadSettings, saveSettings } from '../src/settings'
import { DEFAULT_BINDINGS, bindingFrom, describe as describeBinding, loadBindings } from '../src/shortcuts'

describe('turnAnnouncement (O3)', () => {
  const out = '\nHall\nA plain hall.\n\n\nYou can see a lantern here.\n\n>'
  it('standard: the output only, blank lines collapsed, no prompt', () => {
    expect(turnAnnouncement('look', out, 'standard')).toBe('Hall\nA plain hall.\nYou can see a lantern here.')
  })
  it('terse: as standard', () => {
    expect(turnAnnouncement('look', out, 'terse')).toBe(turnAnnouncement('look', out, 'standard'))
  })
  it('full: the command, then everything, the prompt included', () => {
    expect(turnAnnouncement('look', out, 'full')).toBe('> look\nHall\nA plain hall.\n\n\nYou can see a lantern here.\n\n>')
  })
})

describe('statusSentence (O4)', () => {
  it('v3 score games: room first', () => expect(statusSentence(3, { location: 'West of House ', score: 0, moves: 3 }, undefined)).toBe('West of House. Score 0, moves 3.'))
  it('v3 time games', () => expect(statusSentence(3, { location: 'Kitchen', hours: 21, minutes: 5 }, undefined)).toBe('Kitchen. 21:05.'))
  it('v4+: the first row, spaces collapsed', () => expect(statusSentence(5, undefined, '  Hall          Score: 0   Moves: 1  ')).toBe('Hall Score: 0 Moves: 1'))
})

describe('timedNotice (O8)', () => {
  it('counts seconds, and says when paused', () => {
    expect(timedNotice(10, false)).toBe('The game will go on in 1 second unless you type.')
    expect(timedNotice(55, false)).toBe('The game will go on in 6 seconds unless you type.')
    expect(timedNotice(10, true)).toMatch(/paused/)
  })
})

describe('keyToZscii (I3, §10.7)', () => {
  it('maps keys as @read_char returns them', () => {
    expect(['a', 'Z', ' ', 'Enter', 'Backspace', 'Escape', 'ArrowUp', 'ArrowRight', 'F1', 'F12', 'é', 'Shift', 'Tab'].map(key => keyToZscii({ key }))).toEqual([97, 90, 32, 13, 8, 27, 129, 132, 133, 144, 63, null, null])
  })
})

describe('settings', () => {
  const mem = () => {
    const m = new Map<string, string>()
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
  }
  it('dark by default; round-trips; ignores junk; survives storage that throws', () => {
    expect(loadSettings(undefined)).toEqual(DEFAULTS)
    expect(DEFAULTS.theme).toBe('dark')
    const s = mem()
    saveSettings(s, { ...DEFAULTS, theme: 'light', size: 150 })
    expect(loadSettings(s)).toMatchObject({ theme: 'light', size: 150 })
    s.setItem('frotzplay:settings', '{"size":"huge","theme":7}')
    expect(loadSettings(s)).toEqual(DEFAULTS)
    const throwing = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('full') } }
    expect(loadSettings(throwing)).toEqual(DEFAULTS)
    expect(() => saveSettings(throwing, DEFAULTS)).not.toThrow()
  })
})

describe('shortcuts (I6, WCAG 2.1.4)', () => {
  const ev = (o: Partial<KeyboardEvent>) => ({ code: 'KeyP', altKey: false, shiftKey: false, ctrlKey: false, metaKey: false, ...o }) as KeyboardEvent
  it('every default needs a modifier; a single key is refused', () => {
    for (const b of Object.values(DEFAULT_BINDINGS)) expect(b.alt || b.ctrl || b.meta).toBe(true)
    expect(bindingFrom(ev({}))).toBeNull()
    expect(bindingFrom(ev({ shiftKey: true }))).toBeNull()
    expect(bindingFrom(ev({ code: 'AltLeft', altKey: true }))).toBeNull()
    expect(bindingFrom(ev({ altKey: true, shiftKey: true }))).toMatchObject({ code: 'KeyP', alt: true, shift: true })
  })
  it('describes bindings for people', () => {
    expect(describeBinding(DEFAULT_BINDINGS.readUpper)).toBe('Alt+Shift+U')
    expect(describeBinding(DEFAULT_BINDINGS.readUpper, true)).toBe('Option+Shift+U')
    expect(describeBinding({ ...DEFAULT_BINDINGS.readUpper, code: null })).toBe('Off')
  })
  it('loads the defaults when nothing is stored', () => expect(loadBindings(undefined)).toEqual(DEFAULT_BINDINGS))
})
