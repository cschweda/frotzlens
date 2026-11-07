/**
 * @frotzinc/zmachine: a Z-machine interpreter for versions 3, 4, 5 and 8, in TypeScript. It runs
 * decoded instructions one at a time (no eval, no JIT), keeps all its state as plain data, and
 * stops for the host to supply input. No DOM; runs in a browser, a worker, or Node.
 */
export { Machine } from './machine.js'
export { play, type PlayOptions, type PlayResult, type Turn } from './play.js'
export { normalizeTurn } from './normalize.js'
export { readQuetzal, writeQuetzal, type QuetzalState } from './quetzal.js'
export { mulberry32, mulberry32Step, random } from './random.js'
export type * from './types.js'
