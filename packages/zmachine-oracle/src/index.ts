/**
 * The ZVM oracle: frotzsmith's headless ZVM replay, vendored, for @frotzinc/zmachine's
 * differential tests. GPL-3.0-or-later, private, test-only; never published, never bundled.
 */
export { runReplay, ReplayRunError } from './replayCore.js'
export { normalizeTurnOutput } from './normalizeTurnOutput.js'
export { parseScript } from './parseScript.js'
export { mulberry32 } from './random.js'
export type { BootOptions, ReplayResult, TurnRecord } from './StoryEngine.js'
