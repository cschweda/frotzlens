/**
 * The interpreter's public types (docs/11-frotzplay-phase-1-interpreter.md §2). Everything in
 * MachineState is plain data, so it can be copied, posted to a worker, and saved.
 */

/** What run() stopped for. */
export type StopReason =
  | { kind: 'input-line'; maxLength: number; timeout?: Timeout; preloaded: string }
  | { kind: 'input-char'; timeout?: Timeout }
  /** The story is saving: keep `data` (a Quetzal file), then resume({ saved }). */
  | { kind: 'save'; data: Uint8Array }
  /** The story wants a saved game: resume({ restore: bytes }), or { restore: null } to cancel. */
  | { kind: 'restore' }
  /** The instruction budget is spent; call run() again. */
  | { kind: 'budget' }
  | { kind: 'quit' }
  | { kind: 'fault'; fault: Fault }

/** A timed read's interval (in tenths of a second) and its interrupt routine (packed). */
export interface Timeout {
  tenths: number
  routine: number
}

export type FaultCode =
  | 'illegal-opcode'
  | 'bad-address'
  | 'stack-underflow'
  | 'stack-overflow'
  | 'bad-variable'
  | 'write-to-static'
  | 'division-by-zero'
  | 'bad-object'
  | 'bad-property'
  | 'bad-story'
  | 'not-waiting'
  /** A save file that can't be restored here (another story's, or damaged). The game goes on: the restore fails. */
  | 'bad-save'

/** Something the story did that the Standard doesn't allow, or a story that can't run. Never thrown past the package. */
export interface Fault {
  code: FaultCode
  message: string
  /** The instruction that faulted (0 when there is none). */
  pc: number
}

export interface Frame {
  returnPC: number
  /** Up to 15, each 16-bit unsigned. */
  locals: number[]
  evalStack: number[]
  /** The variable the result goes to; null when it's thrown away (call_*n) or for the main routine. */
  storeVariable: number | null
  /** How many arguments the caller gave (@check_arg_count). */
  argCount: number
  /** A timed-input interrupt routine's frame: its result decides whether the read ends. */
  interrupt?: boolean
  /**
   * The routine's address (its header), set by every call since 0.2.0, so a debugger can name the
   * frame. Undefined for the main routine's frame (v1–5 start it without a header), and in frames
   * from a 0.1.x snapshot, which still restore.
   */
  routine?: number
}

export interface RandomState {
  /**
   * 'session': draws from the session's own stream (mulberry32 from the seed), where ZVM would use
   * Math.random. 'xorshift': ZVM's xorshift, after the game seeds it with @random -n.
   */
  mode: 'session' | 'xorshift'
  /** mulberry32's state. */
  session: number
  /** ZVM's xorshift_seed (signed 32-bit). */
  xorshift: number
}

/** @set_text_style's bits: 1 reverse, 2 bold, 4 italic, 8 fixed-pitch. */
export type TextStyle = number

export interface StyledRun {
  text: string
  style: TextStyle
  fg: number
  bg: number
  font: number
}

export interface Cell {
  ch: string
  style: TextStyle
  fg: number
  bg: number
}

export interface ScreenModel {
  /** In characters: what the header says. */
  width: number
  height: number
  lower: {
    /** Everything printed to the lower window since the story started (or the last erase), in styled runs. */
    runs: StyledRun[]
    bufferMode: boolean
  }
  upper: {
    rows: number
    grid: Cell[][]
    /** 0-based. */
    cursor: { row: number; col: number }
  }
  window: 0 | 1
  style: TextStyle
  colours: { fg: number; bg: number }
  font: number
  /** v3: what the status line says, for the announcer (frotzplay-design §6). */
  statusLine?: StatusLine
  /** @sound_effect 1 and 2 (beeps) since the host last cleared this. */
  beeps: number[]
}

export interface StatusLine {
  location: string
  score?: number
  moves?: number
  hours?: number
  minutes?: number
}

export interface StreamState {
  /** Stream 1 (the screen), 2 (transcript, the header bit mirrors it) and 4 (the command script). */
  screen: boolean
  transcript: boolean
  commands: boolean
  /** Stream 3: the nested tables (§7.1.2.1.1: up to 16), innermost last. */
  memory: { table: number; count: number }[]
}

/** A read, save or restore the machine is waiting on, so resume() can finish it. */
export interface PendingInput {
  kind: 'line' | 'char' | 'save' | 'restore'
  /** save/restore: the address of the instruction's store byte (v4+) or branch byte (v3), Quetzal's PC. */
  at?: number
  /** The read's store variable (aread, read_char), or null (sread). */
  store: number | null
  textBuffer: number
  parseBuffer: number
  timeout?: Timeout
}

export interface InputState {
  pending: PendingInput | null
}

/** One save_undo's state. */
export interface Snapshot {
  dynamic: Uint8Array
  frames: Frame[]
  pc: number
  random: RandomState
  /** The save_undo's store variable, which receives 2 when this is restored. */
  store: number | null
}

export interface MachineState {
  /** The whole story; dynamic memory is live. Static and high memory are never written (§1.1). */
  memory: Uint8Array
  pc: number
  frames: Frame[]
  random: RandomState
  screen: ScreenModel
  input: InputState
  streams: StreamState
  counters: { instructions: number; turns: number }
  undo: Snapshot[]
}

export interface Hooks {
  write?(address: number, value: number, size: 1 | 2): void
  call?(routine: number, args: number[], frame: Frame): void
  return?(value: number, frame: Frame): void
  branch?(at: number, taken: boolean): void
  print?(text: string, window: 0 | 1): void
  input?(kind: 'line' | 'char', value: string | number): void
}

/**
 * What the interpreter writes into the header (§11). 'standard': what frotzplay is (Standard 1.1,
 * timed input, colour). 'zvm': exactly what ZVM writes, for the differential tests.
 */
export type HeaderProfile = 'standard' | 'zvm'

export interface MachineOptions {
  seed: number
  header?: {
    profile?: HeaderProfile
    screen?: { width: number; height: number }
    interpreterNumber?: number
    interpreterVersion?: number
    /** Colour available (Flags 1 bit 0, v5+). */
    colour?: boolean
    /** The Standard revision to claim (default 1.1, what this implements). Tests set ZVM's 1.2 to compare save files byte for byte. */
    standard?: [number, number]
  }
  hooks?: Hooks
  /** save_undo states kept (default 10). */
  undoDepth?: number
}

/** What resume() takes: the line typed, the key pressed, a timed read's interval running out, or how a save or restore went. */
export type InputValue =
  | { line: string }
  | { char: number }
  | { timeout: true }
  /** After a `save` stop: whether the host kept the file. */
  | { saved: boolean }
  /** After a `restore` stop: the file, or null when the player cancelled. */
  | { restore: Uint8Array | null }

/**
 * The whole machine as plain data (for autosave, and for posting to and from a worker): restored
 * with Machine.fromSnapshot(story, snapshot, options), it goes on exactly where it was.
 */
export interface MachineSnapshot {
  version: 1
  /** Which story: release, serial and checksum, checked on restore. */
  story: { release: number; serial: string; checksum: number }
  dynamic: Uint8Array
  pc: number
  frames: Frame[]
  random: RandomState
  screen: ScreenModel
  input: InputState
  streams: StreamState
  counters: { instructions: number; turns: number }
  undo: Snapshot[]
  /** A timed read whose interrupt routine is running. */
  interrupted: PendingInput | null
}
