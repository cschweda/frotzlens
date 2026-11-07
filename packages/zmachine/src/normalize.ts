/**
 * A turn's text as transcripts compare it: trailing spaces off each line, runs of blank lines
 * down to one, leading and trailing blank lines dropped, and the trailing command prompt removed.
 * The same rules as Frotzsmith's normalizeTurnOutput (its ADR-006), so a transcript from this
 * interpreter and one from ZVM can be compared line for line.
 */
export function normalizeTurn(raw: string): string {
  return raw
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .replace(/\n*>[ \t]*$/, '')
    .trim()
}
