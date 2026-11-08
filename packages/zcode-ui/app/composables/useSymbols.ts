import { MAX_DEBUG_FILE, type StoryFile, type Symbols } from '@frotzinc/zcode'

/**
 * Names from Inform's debug file (gameinfo.dbg), over the story that's open.
 * Dropped anywhere, or chosen on the Symbols view. A debug file written for
 * another story is refused, not applied. `names` (the header's Names/Numbers
 * switch) chooses whether views show them; the story itself never changes.
 */
const symbols = shallowRef<Symbols | null>(null)
const symbolsFile = ref('')
const symbolsStatus = ref<'none' | 'loading' | 'ready' | 'failed'>('none')
const symbolsMessage = ref('')
/** The last file chosen was refused (whatever is loaded stays). */
const symbolsError = ref(false)
/** The loaded file says which story it was written for, and it's this one (else: names shown unchecked). */
const symbolsVerified = ref(false)
const names = ref(true)
let generation = 0

/** The symbols the views should use: loaded, for this story, and switched on. */
export const activeSymbols = computed<Symbols | undefined>(() => (names.value && symbols.value ? symbols.value : undefined))

/** A debug file by its look: Inform's are named *.dbg, and are XML. */
export const isDebugFile = (file: File) => /\.dbg$/i.test(file.name)

export function useSymbols() {
  async function loadSymbols(file: File, story: StoryFile) {
    const mine = ++generation
    symbolsStatus.value = 'loading'
    symbolsMessage.value = ''
    symbolsError.value = false
    try {
      // Checked before reading: an oversized file is never loaded into memory.
      if (file.size > MAX_DEBUG_FILE) throw new Error(`It is ${Math.round(file.size / 1048576)} MB, more than a debug file can be.`)
      const [{ readSymbols, symbolsMatch }, text] = await Promise.all([import('@frotzinc/zcode'), file.text()])
      if (mine !== generation) return
      const s = readSymbols(text)
      const usable = Object.keys(s.routines).length > 0 || Object.keys(s.objects).length > 0
      if (!usable) throw new Error(s.problems[0] ?? 'It has no names in it.')
      const match = symbolsMatch(story.bytes, s)
      if (match === false) throw new Error(`${file.name} was written for another story file, so its names would be wrong here.`)
      symbols.value = markRaw(s)
      symbolsFile.value = file.name
      symbolsStatus.value = 'ready'
      symbolsVerified.value = match === true
      names.value = true
      // A file with no story prefix can't be checked: its names are shown, and that is said.
      symbolsMessage.value = [match === undefined ? `${file.name} doesn't say which story it was written for, so its names can't be checked against this one.` : '', ...s.problems].filter(Boolean).join(' ')
    } catch (e) {
      if (mine !== generation) return
      symbolsStatus.value = symbols.value ? 'ready' : 'failed'
      symbolsError.value = true
      symbolsMessage.value = `${file.name} couldn't be used: ${e instanceof Error ? e.message : String(e)}`
    }
  }

  function clearSymbols() {
    generation++
    symbols.value = null
    symbolsFile.value = ''
    symbolsStatus.value = 'none'
    symbolsMessage.value = ''
    symbolsError.value = false
    symbolsVerified.value = false
    names.value = true
  }

  return { symbols, symbolsFile, symbolsStatus, symbolsMessage, symbolsError, symbolsVerified, names, loadSymbols, clearSymbols }
}
