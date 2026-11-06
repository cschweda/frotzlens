import { LIB_TEXTS } from './lib-texts.generated.js'
import type { LibraryId, VirtualFile } from './types.js'

/**
 * The HEAVY half of the package: ~900 KB of Standard Library + PunyInform
 * source text. Import it only where the content is needed (the compile path,
 * which is itself best kept in a Web Worker or a dynamic import).
 */

/** Include directory for each library inside the compiler's virtual FS. */
export const INCLUDE_PATH: Record<LibraryId, string> = {
  std: '/lib/std',
  puny: '/lib/puny',
}

/** Capitalized aliases where the Standard Library's own includes are
 *  mixed-case: the files ship lowercase and MEMFS is case-sensitive. */
const STD_ALIASES: Record<string, string> = {
  'Parser.h': 'parser.h',
  'VerbLib.h': 'verblib.h',
  'Grammar.h': 'grammar.h',
  'English.h': 'english.h',
  'Exits.h': 'exits.h',
}

function buildFiles(texts: Record<string, string>, includePath: string, aliases: Record<string, string> = {}): VirtualFile[] {
  const files: VirtualFile[] = Object.entries(texts).map(([name, content]) => ({ path: `${includePath}/${name}`, content }))
  for (const [alias, real] of Object.entries(aliases)) {
    const content = texts[real]
    if (content !== undefined) files.push({ path: `${includePath}/${alias}`, content })
  }
  return files
}

/** Library files (with any case aliases) ready to mount, per library. */
export const LIBRARY_FILES: Record<LibraryId, VirtualFile[]> = {
  std: buildFiles(LIB_TEXTS.std, INCLUDE_PATH.std, STD_ALIASES),
  puny: buildFiles(LIB_TEXTS.puny, INCLUDE_PATH.puny),
}
