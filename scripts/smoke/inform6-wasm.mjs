// Smoke test for a packed @frotzinc/inform6-wasm, run by publish.sh in a
// scratch project where the tarball is installed: a real compile, with and
// without the Standard Library. Exits non-zero on any problem.
import { compile } from '@frotzinc/inform6-wasm'
import { LIBRARY_FILES } from '@frotzinc/inform6-wasm/library'

const bare = await compile('[ Main; print "Hi^"; @quit; ];\n', { version: 'z5' })
if (!bare.ok || bare.story?.[0] !== 5) throw new Error(`bare compile failed:\n${bare.rawOutput}`)

const std = await compile(
  'Constant Story "T";\nInclude "Parser";\nInclude "VerbLib";\nObject Hall "Hall" with description "A hall.", has light;\n[ Initialise; location = Hall; ];\nInclude "Grammar";\n',
  { debug: true },
)
if (!std.ok || !std.dbg?.includes('<inform-story-file')) throw new Error(`std compile failed:\n${std.rawOutput}`)
if (!LIBRARY_FILES.std.length || !LIBRARY_FILES.puny.length) throw new Error('LIBRARY_FILES is empty')
console.log(`inform6-wasm: compiled a bare v5 (${bare.story.length} B) and a Standard Library game with gameinfo.dbg`)
