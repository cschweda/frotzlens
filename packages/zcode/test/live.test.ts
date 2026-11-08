/** liveTables: the object table and globals re-read from a changed memory image (frotztrace). */
import { describe, expect, it } from 'vitest'
import { liveTables, parseStory } from '../src/index.js'
import { readStory } from './fixtures.js'

describe('liveTables', () => {
  it('reads the same tables as parseStory from the story as it is', () => {
    const story = parseStory(readStory('dark-cellar.z5'))
    const live = liveTables(story, story.bytes)
    expect(live.objects).toEqual(story.objects)
    expect(live.globals).toEqual(story.globals)
  })

  it('sees what changed: a global written, an object moved', () => {
    const story = parseStory(readStory('dark-cellar.z5'))
    const memory = story.bytes.slice()
    const g = story.globals[0]!
    memory[g.address] = 0x12
    memory[g.address + 1] = 0x34
    // Object 2's parent (v5: a word at entry + 6) becomes object 1.
    const entry = story.objects.address + 63 * 2 + 14
    memory[entry + 6] = 0
    memory[entry + 7] = 1
    const live = liveTables(story, memory)
    expect(live.globals[0]!.value).toBe(0x1234)
    expect(live.objects.objects[1]!.parent).toBe(1)
    expect(story.objects.objects[1]!.parent).not.toBe(1) // the static model is untouched
  })
})
