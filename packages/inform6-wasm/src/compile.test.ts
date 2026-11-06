/**
 * Mount order (defence in depth): extensions are written FIRST and the
 * library after, so an extension named like a library file can't replace it —
 * unless it explicitly overrides (overridesLibrary), which is written last.
 */
import { describe, expect, it, vi } from 'vitest'
import { LIBRARY_FILES } from './library.js'

const files = new Map<string, string | Uint8Array>()
let lastArgs: string[] = []
vi.mock('./loader.js', () => ({
  createInstance: async () => ({
    FS: {
      mkdir: () => {},
      writeFile: (p: string, d: string | Uint8Array) => files.set(p, d),
      chdir: () => {},
      readFile: () => {
        throw new Error('not found')
      },
    },
    callMain: (args: string[]) => {
      lastArgs = args
      return 0
    },
  }),
}))

const { compile } = await import('./compile.js')
const lib = (l: 'std' | 'puny', path: string) => LIBRARY_FILES[l].find(f => f.path === path)!.content

describe('compile mounts the library after extensions', () => {
  it('a library-named extension without an override does not replace the library', async () => {
    files.clear()
    await compile('!', { library: 'std', extensions: [{ name: 'VerbLib', content: 'EVIL' }, { name: 'lamp', content: 'LAMP' }] })
    expect(files.get('/lib/std/VerbLib.h')).toBe(lib('std', '/lib/std/VerbLib.h'))
    expect(files.get('/lib/std/lamp.h')).toBe('LAMP')
  })

  it('…in PunyInform too', async () => {
    files.clear()
    await compile('!', { library: 'puny', extensions: [{ name: 'puny', content: 'EVIL' }] })
    expect(files.get('/lib/puny/puny.h')).toBe(lib('puny', '/lib/puny/puny.h'))
  })

  it('an explicit override is written after the library', async () => {
    files.clear()
    await compile('!', { library: 'std', extensions: [{ name: 'VerbLib', content: 'MINE', overridesLibrary: true }] })
    expect(files.get('/lib/std/VerbLib.h')).toBe('MINE')
  })
})

describe('compile switches', () => {
  it('passes -k only when debug is set, and the version switch', async () => {
    await compile('!', { version: 'z3' })
    expect(lastArgs).toContain('-v3')
    expect(lastArgs).not.toContain('-k')
    await compile('!', { version: 'ulx', debug: true })
    expect(lastArgs).toEqual(expect.arrayContaining(['-G', '-k', '-s', '-Cu']))
  })

  it('reports no story as ok:false, never throws', async () => {
    const r = await compile('!')
    expect(r.ok).toBe(false)
    expect(r.story).toBeUndefined()
    expect(r.version).toBe('z5')
  })
})

describe('instantiate', () => {
  it('uses the supplied instance instead of the bundled loader', async () => {
    const calls: string[][] = []
    const story = new Uint8Array([5, 0, 0])
    const r = await compile('!', {
      instantiate: async ({ print }) => ({
        FS: { mkdir: () => {}, writeFile: () => {}, chdir: () => {}, readFile: () => story },
        callMain: (args: string[]) => {
          calls.push(args)
          print('Compiled with no errors')
          return 0
        },
      }),
    })
    expect(calls).toHaveLength(1)
    expect(r.ok).toBe(true)
    expect(r.story).toBe(story)
    expect(r.rawOutput).toContain('Compiled')
  })
})
