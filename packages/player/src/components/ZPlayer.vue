<script setup lang="ts">
/**
 * The player (docs/13 §2): a story's screen, its command line and controls, and the accessibility
 * contract (docs/accessibility.md) built in. Give it the story's bytes.
 *
 *   <ZPlayer :story="bytes" title="The Dark Cellar" />
 *
 * The host page supplies a <main> and a skip link (it can call `focusCommand()`), sets the page
 * title from `title` (or the `title` event), and serves the fonts folder at `fontBase`.
 *
 * A host that drives the story (an IDE's "send this script") calls `send(line)` and `press(key)`,
 * which act as the player typing, and resolve when the turn is done. Their turns carry `fed: true`.
 * `started` fires when the story boots (or starts again); `status` when the status line changes.
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, useTemplateRef, watch } from 'vue'
import { timedNotice, turnAnnouncement } from '../announce.js'
import { clearAutosave, readAutosave, storyKey, writeAutosave } from '../autosave.js'
import { useMachine, type TurnBlock } from '../composables/useMachine.js'
import { loadSettings, saveSettings, type Settings, type Theme } from '../settings.js'
import { loadBindings, matches, saveBindings, type Action } from '../shortcuts.js'
import ZAnnouncer from './ZAnnouncer.vue'
import ZCommandLine from './ZCommandLine.vue'
import ZMessages, { type Message } from './ZMessages.vue'
import ZRestoreDialog from './ZRestoreDialog.vue'
import ZSettings from './ZSettings.vue'
import ZShortcuts from './ZShortcuts.vue'
import ZStatusBar from './ZStatusBar.vue'
import ZToolbar from './ZToolbar.vue'
import ZTranscript from './ZTranscript.vue'
import ZUpperWindow from './ZUpperWindow.vue'

const props = withDefaults(
  defineProps<{
    story: Uint8Array
    /** The story's title, for file names and the page title. */
    title?: string
    /** The session's seed; random when not given (design §7). */
    seed?: number
    /** Where the fonts folder is served. */
    fontBase?: string
    /** Keep an autosave in this browser, and offer to continue from it. */
    autosave?: boolean
    /** Where settings and shortcuts are kept (default: localStorage). */
    storage?: Pick<Storage, 'getItem' | 'setItem'>
  }>(),
  { title: 'story', seed: undefined, fontBase: '/fonts/', autosave: true, storage: undefined },
)
const emit = defineEmits<{
  turn: [block: TurnBlock]
  'input-wanted': [kind: 'line' | 'char']
  quit: []
  save: [data: Uint8Array]
  error: [message: string]
  started: []
  status: [status: { left: string; right: string; sentence: string }]
}>()

const store = props.storage ?? (typeof localStorage !== 'undefined' ? safeStorage() : undefined)
function safeStorage() {
  try {
    return localStorage
  } catch {
    return undefined
  }
}

const settings = ref<Settings>(loadSettings(store))

/**
 * The theme, as a model a host can bind (v-model:theme): frotzplay's page ties it to its own
 * light/dark switch. Left unbound, the player keeps its own setting.
 */
const themeModel = defineModel<Theme>('theme')
watch(
  themeModel,
  t => {
    if (t && t !== settings.value.theme) settings.value = { ...settings.value, theme: t }
  },
  { immediate: true },
)
watch(
  () => settings.value.theme,
  t => {
    if (themeModel.value !== undefined && t !== themeModel.value) themeModel.value = t
  },
)
// A first visit from a system that asks for more contrast starts in high contrast (statement R5);
// a theme chosen here always wins.
try {
  if (!store?.getItem('frotzplay:settings') && typeof matchMedia !== 'undefined' && matchMedia('(prefers-contrast: more)').matches) {
    settings.value = { ...settings.value, theme: 'high-contrast' }
  }
} catch {
  // No matchMedia or storage: the default theme.
}
const bindings = ref(loadBindings(store))
watch(settings, s => saveSettings(store, s), { deep: true })
watch(bindings, b => saveBindings(store, b), { deep: true })

const seed = props.seed ?? Math.floor(Math.random() * 0x7fffffff)
const key = storyKey(props.story)

const root = useTemplateRef<HTMLElement>('root')
const announcer = useTemplateRef<InstanceType<typeof ZAnnouncer>>('announcer')
const commandLine = useTemplateRef<InstanceType<typeof ZCommandLine>>('commandLine')

let msgId = 0
const info = ref<Message | null>(null)
const error = ref<Message | null>(null)
const say = (text: string, actions?: Message['actions']) => (info.value = { id: ++msgId, text, actions })
const fail = (text: string, actions?: Message['actions']) => {
  error.value = { id: ++msgId, text, error: true, actions }
  emit('error', text)
}

const dialogs = reactive({ settings: false, shortcuts: false, restore: false })
const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

// ── the machine ───────────────────────────────────────────────────────────
const machine = useMachine(props.story, {
  seed,
  onTurn(block, state) {
    emit('turn', block)
    announcer.value?.announce(turnAnnouncement(block.command, block.text, settings.value.verbosity))
    if (settings.value.verbosity !== 'terse') announcer.value?.announceStatus(state.status.sentence)
    if (state.phase === 'line' || state.phase === 'char') emit('input-wanted', state.phase)
    if (state.phase === 'quit') {
      emit('quit')
      say('The story has ended.', [{ label: 'Play again', run: () => restart() }])
    }
    if (state.phase === 'fault' && state.fault) {
      const actions = [{ label: 'Start again', run: () => restart() }]
      if (machine.canGoBack()) actions.unshift({ label: 'Go back one turn', run: () => goBack() })
      fail(`The story stopped: ${state.fault.message} You can go back one turn, or start again.`, actions)
    }
    if (state.phase === 'line' && props.autosave) autosaveNow()
  },
})
const s = machine.state

const mode = computed(() => (s.phase === 'line' ? 'line' : s.phase === 'char' ? 'char' : s.phase === 'quit' || s.phase === 'fault' ? 'ended' : 'busy'))
const maxLength = computed(() => (s.waiting?.kind === 'input-line' ? s.waiting.maxLength : undefined))
const hasUpper = computed(() => s.version > 3 && s.upper.length > 1)
const statusBar = computed(() => (s.version === 3 ? s.status.left || s.status.right : s.upper.length >= 1 && s.upper[0]!.trim()))

// ── autosave ──────────────────────────────────────────────────────────────
async function autosaveNow() {
  const snapshot = machine.snapshot()
  if (!snapshot) return
  const ok = await writeAutosave(key, { snapshot, at: Date.now(), turns: s.turns.length })
  if (!ok && !autosaveWarned) {
    autosaveWarned = true
    say('This browser won’t keep an autosave here. Use Save to keep your place in a file.')
  }
}
let autosaveWarned = false

async function offerContinue() {
  if (!props.autosave) return
  const saved = await readAutosave(key)
  if (!saved || saved.turns < 2) return
  const when = new Date(saved.at).toLocaleString()
  say(`You played this story before (${when}).`, [
    {
      label: 'Continue where you left off',
      run: async () => {
        if (await machine.continueFrom(saved.snapshot)) say('Continued from your autosave.')
        else fail('That autosave couldn’t be used. The story starts from the beginning.')
        commandLine.value?.focus()
      },
    },
    {
      label: 'Start over',
      run: async () => {
        await clearAutosave(key)
        info.value = null
        commandLine.value?.focus()
      },
    },
  ])
}

// ── timed input (statement O8) ────────────────────────────────────────────
const timer = reactive({ paused: false, handle: 0 as ReturnType<typeof setTimeout> | 0, announcedFor: -1 })
const timed = computed(() => {
  const w = s.waiting
  if (!w || (w.kind !== 'input-line' && w.kind !== 'input-char') || !w.timeout) return null
  if (settings.value.timedInput === 'off') return { notice: 'The story’s timers are off in Settings.', paused: true }
  return { notice: timedNotice(w.timeout.tenths, timer.paused), paused: timer.paused }
})

function clearTimer() {
  if (timer.handle) clearTimeout(timer.handle)
  timer.handle = 0
}

watch([() => s.waiting, () => timer.paused, () => settings.value.timedInput], () => {
  clearTimer()
  const w = s.waiting
  if (!w || (w.kind !== 'input-line' && w.kind !== 'input-char') || !w.timeout) return
  const turn = s.turns.length
  if (timer.announcedFor !== turn) {
    timer.announcedFor = turn
    if (timed.value) announcer.value?.announce(timed.value.notice)
  }
  if (timer.paused || settings.value.timedInput === 'off') return
  timer.handle = setTimeout(() => {
    timer.handle = 0
    machine.timeout()
  }, w.timeout.tenths * 100)
})

function togglePause() {
  timer.paused = !timer.paused
  announcer.value?.announce(timer.paused ? 'Timer paused.' : 'Timer running.')
}

// ── save and restore ──────────────────────────────────────────────────────
const slug = computed(() => props.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'story')

function download(bytes: Uint8Array | string, name: string, type: string) {
  const blob = new Blob([bytes as BlobPart], { type })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.rel = 'noopener'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
}

watch(
  () => s.phase,
  async phase => {
    if (phase === 'save' && s.waiting?.kind === 'save') {
      const data = s.waiting.data
      emit('save', data)
      download(data, `${slug.value}.qzl`, 'application/octet-stream')
      say(`Saved: ${slug.value}.qzl, in your downloads.`)
      await machine.answerSave(true)
    } else if (phase === 'restore') {
      dialogs.restore = true
    }
  },
)

async function onRestoreChosen(bytes: Uint8Array, name: string) {
  dialogs.restore = false
  const why = await machine.answerRestore(bytes)
  if (why) fail(`${why} Choose another file, or carry on.`)
  else say(`Restored from ${name}.`)
  commandLine.value?.focus()
}

async function onRestoreCancel() {
  dialogs.restore = false
  if (s.phase === 'restore') {
    await machine.answerRestore(null)
    say('Restore cancelled.')
  }
}

// ── commands and controls ─────────────────────────────────────────────────
function send(line: string) {
  error.value = null
  machine.submitLine(line)
}

function command(text: string) {
  if (s.phase === 'line') send(text)
  commandLine.value?.focus()
}

function transcriptText(): string {
  return s.turns.map(t => (t.command !== null ? `> ${t.command}\n` : t.kind === 'timer' ? '(time passes)\n' : '') + t.text.replace(/\s+$/, '')).join('\n\n') + '\n'
}

function exportTranscript() {
  download(transcriptText(), `${slug.value}-transcript.txt`, 'text/plain')
  say(`Transcript saved: ${slug.value}-transcript.txt, in your downloads.`)
}

function exportScript() {
  const head = `! ${props.title}: the commands of a frotzplay session (seed ${seed}).\n! Replay: zmachine-run story script.txt --seed ${seed}\n`
  download(head + s.script.join('\n') + '\n', `${slug.value}-commands.txt`, 'text/plain')
  say(`Commands saved: ${slug.value}-commands.txt, in your downloads.`)
}

function readUpper() {
  const rows = s.upper.map(r => r.replace(/\s+/g, ' ').trim()).filter(Boolean)
  announcer.value?.announce(rows.length ? `Upper window: ${rows.join('. ')}` : 'The upper window is empty.')
}

const perform: Record<Action, () => void> = {
  readUpper,
  repeatStatus: () => announcer.value?.announceStatus(s.status.sentence || 'There is no status line.', true),
  undo: () => command('undo'),
  save: () => command('save'),
  restore: () => command('restore'),
  settings: () => (dialogs.settings = true),
  shortcuts: () => (dialogs.shortcuts = true),
}

function onKeydown(e: KeyboardEvent) {
  if (dialogs.shortcuts) return // recording new keys there
  for (const [action, b] of Object.entries(bindings.value) as [Action, (typeof bindings.value)[Action]][]) {
    if (matches(b, e)) {
      e.preventDefault()
      e.stopPropagation()
      perform[action]()
      return
    }
  }
}

async function restart() {
  info.value = null
  error.value = null
  await boot()
  commandLine.value?.focus()
}

/** Start the story, and tell the host. */
async function boot() {
  lastStatus = ''
  await machine.start()
  emit('started')
  emitStatus()
}

// The status line, to the host, when it changes.
let lastStatus = ''
function emitStatus() {
  const { left, right, sentence } = s.status
  const k = `${left}\u0000${right}`
  if (k === lastStatus) return
  lastStatus = k
  emit('status', { left, right, sentence })
}
watch(() => [s.status.left, s.status.right], emitStatus)

// ── the host's input (send, press) ────────────────────────────────────────
/** Type a command as the player would. False when the story isn't waiting for a line. */
async function hostSend(line: string): Promise<boolean> {
  if (s.phase !== 'line') return false
  error.value = null
  await machine.submitLine(line, true)
  return true
}

/** Press a key ("Enter", " ", or one character). False when the story isn't waiting for a key. */
async function hostPress(key: string): Promise<boolean> {
  if (s.phase !== 'char' || !key) return false
  const code = key === 'Enter' ? 13 : key === 'Escape' ? 27 : key.charCodeAt(0)
  await machine.pressKey(code, key === ' ' ? 'Space' : key, true)
  return true
}

async function goBack() {
  error.value = null
  if (await machine.backOneTurn()) say('Back one turn.')
  commandLine.value?.focus()
}

// ── settings applied (custom properties, no inline style attributes) ──────
const loadedFonts = new Set<string>()
async function ensureFont() {
  if (settings.value.font !== 'dyslexic' || !props.fontBase || loadedFonts.has('dyslexic') || typeof FontFace === 'undefined') return
  loadedFonts.add('dyslexic')
  const faces: [string, FontFaceDescriptors][] = [
    ['OpenDyslexic-Regular.woff2', {}],
    ['OpenDyslexic-Bold.woff2', { weight: '700' }],
    ['OpenDyslexic-Italic.woff2', { style: 'italic' }],
    ['OpenDyslexic-Bold-Italic.woff2', { weight: '700', style: 'italic' }],
  ]
  for (const [file, d] of faces) {
    try {
      const face = new FontFace('OpenDyslexic', `url(${props.fontBase}${file})`, d)
      document.fonts.add(await face.load())
    } catch {
      // A font that won't load leaves the fallback in place.
    }
  }
}

/**
 * The text settings are data attributes on the root, matched by plain CSS rules (player.css), not
 * inline styles: WebKit counts even script-set style properties against `style-src`, and an
 * embedder's CSP may not allow them.
 */
function applySettings() {
  ensureFont()
}
watch(settings, applySettings, { deep: true })

onMounted(async () => {
  applySettings()
  await boot()
  commandLine.value?.focus()
  offerContinue()
})
onBeforeUnmount(clearTimer)

defineExpose({
  focusCommand: () => commandLine.value?.focus(),
  state: s,
  seed,
  send: hostSend,
  press: hostPress,
  restart,
})
</script>

<template>
  <div
    ref="root"
    class="zp"
    :data-theme="settings.theme"
    :data-font="settings.font"
    :data-motion="settings.motion"
    :data-size="settings.size"
    :data-measure="settings.lineLength"
    :data-leading="String(settings.lineSpacing).replace('.', '_')"
    :data-tracking="String(settings.letterSpacing).replace('.', '_')"
    @keydown.capture="onKeydown"
  >
    <ZStatusBar v-if="statusBar" :left="s.status.left" :right="s.status.right" />
    <ZUpperWindow v-if="hasUpper" :rows="s.upper.slice(1)" />
    <ZTranscript :turns="s.turns" />
    <ZMessages :info="info" :error="error" />
    <ZCommandLine ref="commandLine" :mode="mode" :max-length="maxLength" :timed="timed" @line="send" @key="(code, label) => machine.pressKey(code, label)" @pause="togglePause" />
    <ZToolbar
      :busy="s.phase !== 'line'"
      :has-upper="hasUpper"
      @undo="command('undo')"
      @save="command('save')"
      @restore="command('restore')"
      @read-upper="readUpper"
      @transcript="exportTranscript"
      @script="exportScript"
      @settings="dialogs.settings = true"
      @shortcuts="dialogs.shortcuts = true"
    />
    <ZAnnouncer ref="announcer" />
    <ZSettings v-model="settings" :open="dialogs.settings" :dyslexic="!!fontBase" @close="dialogs.settings = false" />
    <ZShortcuts v-model="bindings" :open="dialogs.shortcuts" :mac="mac" @close="dialogs.shortcuts = false" />
    <ZRestoreDialog :open="dialogs.restore" @choose="onRestoreChosen" @cancel="onRestoreCancel" />
  </div>
</template>
