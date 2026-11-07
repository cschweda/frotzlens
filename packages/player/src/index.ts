/**
 * @frotzinc/player: an accessible Z-machine player as Vue components (docs/13). Import the CSS once:
 *   import '@frotzinc/player/player.css'
 */
import './player.css'

export { default as ZPlayer } from './components/ZPlayer.vue'
export { useMachine, type MachineHandle, type MachineState, type TurnBlock, type Phase } from './composables/useMachine.js'
export { turnAnnouncement, statusSentence, timedNotice, type Verbosity } from './announce.js'
export { DEFAULTS as DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings, type Theme, type Font } from './settings.js'
export { ACTIONS, DEFAULT_BINDINGS, describe as describeBinding, type Action, type Binding } from './shortcuts.js'
export { keyToZscii } from './keys.js'
