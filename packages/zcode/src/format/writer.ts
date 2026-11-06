/**
 * Text output in the Ztools style: lines wrap at `width` columns (79 by
 * default; 0 = never) by breaking at the last space, which is dropped, and the
 * rest continues at column 0. Observed from infodump's output: a 79-column
 * line is kept; an 80th character sends the line back to its last space.
 */
export class Writer {
  private out: string[] = []
  private line = ''

  constructor(private readonly width = 79) {}

  write(text: string): this {
    for (const ch of text) {
      if (ch === '\n') {
        this.out.push(this.line, '\n')
        this.line = ''
        continue
      }
      this.line += ch
      if (this.width && this.line.length > this.width) {
        const space = this.line.lastIndexOf(' ')
        const cut = space >= 0 ? space : this.width
        this.out.push(this.line.slice(0, cut), '\n')
        this.line = this.line.slice(space >= 0 ? cut + 1 : cut)
      }
    }
    return this
  }

  toString(): string {
    return this.out.join('') + this.line
  }
}

/** Lowercase hex, zero-padded. */
export const hx = (n: number, width: number): string => n.toString(16).padStart(width, '0')
/** Right-aligned decimal. */
export const dec = (n: number, width: number): string => String(n).padStart(width, ' ')

/**
 * The banner a section opens with: "Story file is <name>" and the title. A
 * section printed after another one for the same file (infodump -io) leaves out
 * the "Story file is" line.
 */
export function banner(w: Writer, opts: FormatOptions, title: string): void {
  if (!opts.continuation) w.write(`\nStory file is ${opts.fileName}\n`)
  w.write(`\n    **** ${title} ****\n\n`)
}

export interface FormatOptions {
  /** As infodump prints it on its first line: "Story file is <fileName>". */
  fileName: string
  /** Wrap width (default 79, as infodump; 0 = no wrapping). */
  width?: number
  /** True for a section that follows another one of the same file: no "Story file is" line. */
  continuation?: boolean
}
