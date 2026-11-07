// Vendored from frotzsmith (app/modules/inform6/engine/StoryEngine.ts @ cf87b65), GPL-3.0-or-later.
// Changed: Z-machine only (no Glulx engine, no createEngine), and boot() takes options.

export type EngineTarget = 'zmachine' | 'glulx'

export interface TurnRecord {
  /** The input for this turn; '' for the boot banner (turn 0). */
  command: string
  /** Normalized buffer-window text produced after this turn. */
  output: string
  /** Raw grid/status-window text (excluded from `output` by default). */
  status?: string
}

export interface ReplayResult {
  turns: TurnRecord[]
  ms: number
  /** The story's first 64 bytes as ZVM left them after booting: what it wrote into the header. */
  header?: Uint8Array
}

export interface BootOptions {
  /**
   * Make ZVM's randomness reproducible: Math.random is replaced, for the run, by the mulberry32
   * stream from this seed. ZVM draws from Math.random whenever its xorshift seed is 0 (at start,
   * restart, restore and after @random 0), so this is the stream @frotzinc/zmachine's 'session'
   * random mode uses; @random -n then switches both to ZVM's xorshift, seeded the same.
   */
  seed?: number
  /** Save files by name: a save writes 'save', a restore reads it. Without this, saves and restores fail. */
  files?: Map<string, Uint8Array>
}
