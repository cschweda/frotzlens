/**
 * The screen model (§8), as data: a lower window of styled runs and an upper window that is a
 * character grid with a cursor. Nothing here draws; the player (`@frotzinc/player`) does, and the
 * Node runner reads the lower window's text.
 */
import type { Cell, ScreenModel, StyledRun } from './types.js'

export function initialScreen(width: number, height: number): ScreenModel {
  return {
    width,
    height,
    lower: { runs: [], bufferMode: true },
    upper: { rows: 0, grid: [], cursor: { row: 0, col: 0 } },
    window: 0,
    style: 0,
    colours: { fg: 1, bg: 1 },
    font: 1,
    beeps: [],
  }
}

const blankRow = (s: ScreenModel): Cell[] => Array.from({ length: s.width }, () => ({ ch: ' ', style: 0, fg: s.colours.fg, bg: s.colours.bg }))

export class Screen {
  /** Lower-window text since the runner last took it (the transcript). */
  private pending = ''

  constructor(readonly model: ScreenModel) {}

  /** Text to the current window (stream 1). */
  print(text: string): void {
    const s = this.model
    if (s.window === 1) return this.printUpper(text)
    this.pending += text
    const last = s.lower.runs.at(-1)
    if (last && last.style === s.style && last.fg === s.colours.fg && last.bg === s.colours.bg && last.font === s.font) last.text += text
    else s.lower.runs.push({ text, style: s.style, fg: s.colours.fg, bg: s.colours.bg, font: s.font } satisfies StyledRun)
  }

  private printUpper(text: string): void {
    const u = this.model.upper
    for (const ch of text) {
      if (ch === '\n') {
        u.cursor.row++
        u.cursor.col = 0
        continue
      }
      const row = u.grid[u.cursor.row]
      // Text past the right edge or below the window is lost (§8.6.2: the upper window doesn't scroll).
      if (row && u.cursor.col < this.model.width) {
        row[u.cursor.col] = { ch, style: this.model.style, fg: this.model.colours.fg, bg: this.model.colours.bg }
        u.cursor.col++
      }
    }
  }

  /** Take the lower window's text printed since the last call. */
  take(): string {
    const t = this.pending
    this.pending = ''
    return t
  }

  /** @split_window (§8.6.1, §8.7.2.1): the upper window is `lines` tall; v3 clears it. */
  split(lines: number, version: number): void {
    const u = this.model.upper
    const n = Math.max(0, Math.min(lines, this.model.height))
    while (u.grid.length < n) u.grid.push(blankRow(this.model))
    u.grid.length = n
    u.rows = n
    if (version === 3) for (let r = 0; r < n; r++) u.grid[r] = blankRow(this.model)
    if (u.cursor.row >= n) u.cursor = { row: 0, col: 0 }
    if (n === 0) this.model.window = 0
  }

  /** @set_window: selecting the upper window puts its cursor at the top left (§8.7.2.2). */
  setWindow(w: number): void {
    this.model.window = w === 1 ? 1 : 0
    if (w === 1) this.model.upper.cursor = { row: 0, col: 0 }
  }

  /** @erase_window (§8.7.3.2): -1 unsplits and clears both, -2 clears both, 0 lower, 1 upper. */
  erase(w: number): void {
    const s = this.model
    if (w === -1) {
      this.split(0, 0)
      s.lower.runs = []
      s.window = 0
    } else if (w === -2) {
      s.lower.runs = []
      for (let r = 0; r < s.upper.rows; r++) s.upper.grid[r] = blankRow(s)
    } else if (w === 0) s.lower.runs = []
    else if (w === 1) {
      for (let r = 0; r < s.upper.rows; r++) s.upper.grid[r] = blankRow(s)
      s.upper.cursor = { row: 0, col: 0 }
    }
  }

  /** @erase_line 1: the upper window's line from the cursor to its end. */
  eraseLine(): void {
    const u = this.model.upper
    const row = u.grid[u.cursor.row]
    if (!row || this.model.window !== 1) return
    for (let c = u.cursor.col; c < row.length; c++) row[c] = { ch: ' ', style: 0, fg: this.model.colours.fg, bg: this.model.colours.bg }
  }

  /** @set_cursor (1-based; the upper window only: §8.7.2.3). */
  setCursor(line: number, col: number): void {
    if (this.model.window !== 1) return
    this.model.upper.cursor = { row: Math.max(0, line - 1), col: Math.max(0, col - 1) }
  }

  /** @get_cursor: 1-based row and column. */
  cursor(): [number, number] {
    if (this.model.window !== 1) return [1, 1]
    const c = this.model.upper.cursor
    return [c.row + 1, c.col + 1]
  }

  /** The upper window's rows as text (for the "Read upper window" command and the v4+ status announcement). */
  upperText(): string[] {
    return this.model.upper.grid.map(row => row.map(c => c.ch).join('').replace(/\s+$/, ''))
  }
}
