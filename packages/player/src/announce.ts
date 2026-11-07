/**
 * What the screen reader is told (docs/13 §3, statements O2–O4): pure functions, unit-tested.
 */
import type { StatusLine } from '@frotzinc/zmachine'

export type Verbosity = 'full' | 'standard' | 'terse'

/** Blank lines collapsed, trailing spaces gone, and the trailing prompt ("> ") dropped. */
function tidy(text: string): string {
  return text
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
    .replace(/\n*>\s*$/, '')
    .trim()
}

/**
 * One turn's announcement (O2, O3). `standard` and `terse`: the output only, tidied. `full`: the
 * command echoed, then the output as printed, blank lines and the prompt included.
 */
export function turnAnnouncement(command: string | null, output: string, verbosity: Verbosity): string {
  if (verbosity === 'full') return [command ? `> ${command}` : '', output.replace(/[ \t]+$/gm, '').trim()].filter(Boolean).join('\n')
  return tidy(output)
}

/**
 * The status line as a sentence (O4). v3: from the interpreter's fields ("West of House. Score 0,
 * moves 3." or "Kitchen. 9:30."); v4+: the upper window's first row, trimmed, spaces collapsed.
 */
export function statusSentence(version: number, line: StatusLine | undefined, firstRow: string | undefined): string {
  if (version === 3) {
    if (!line) return ''
    const place = line.location.trim()
    if (line.hours !== undefined) {
      const h = line.hours % 24
      return `${place}. ${h}:${String(line.minutes ?? 0).padStart(2, '0')}.`
    }
    return `${place}. Score ${line.score ?? 0}, moves ${line.moves ?? 0}.`
  }
  return (firstRow ?? '').replace(/\s+/g, ' ').trim()
}

/** The timed-input announcement (O8). */
export function timedNotice(tenths: number, paused: boolean): string {
  if (paused) return 'The game’s timer is paused. Take your time.'
  const s = Math.max(1, Math.round(tenths / 10))
  return `The game will go on in ${s} second${s === 1 ? '' : 's'} unless you type.`
}
