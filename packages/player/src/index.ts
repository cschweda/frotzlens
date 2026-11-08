/**
 * @frotzinc/player: an accessible Z-machine player as Vue components (docs/13). Import the CSS once:
 *   import '@frotzinc/player/player.css'
 */
import './player.css'

export { default as ZPlayer } from './components/ZPlayer.vue'
export { useMachine, type MachineHandle, type MachineState, type TurnBlock, type Phase } from './composables/useMachine.js'
// The screen without a machine of its own (docs/21 §2): for a host that drives the machine itself,
// such as frotztrace's debugger, drawing the same screen with the same components.
export { useScreen, type ScreenHandle, type TurnKind } from './composables/useScreen.js'
export { default as ZTranscript } from './components/ZTranscript.vue'
export { default as ZUpperWindow } from './components/ZUpperWindow.vue'
export { default as ZStatusBar } from './components/ZStatusBar.vue'
export { default as ZCommandLine } from './components/ZCommandLine.vue'
export { default as ZRuns } from './components/ZRuns.vue'
export { default as ZAnnouncer } from './components/ZAnnouncer.vue'
export { default as ZMessages } from './components/ZMessages.vue'
export { turnAnnouncement, statusSentence, timedNotice, type Verbosity } from './announce.js'
export { DEFAULTS as DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings, type Theme, type Font } from './settings.js'
export { ACTIONS, DEFAULT_BINDINGS, describe as describeBinding, type Action, type Binding } from './shortcuts.js'
export { keyToZscii } from './keys.js'
export { bundle, bundleFolder, zip, crc32, slugOf, type BundleOptions, type ExportedFile } from './export.js'
