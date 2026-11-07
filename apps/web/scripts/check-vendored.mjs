// The vendored player (public/play/web/, Parchment, copied from Frotzsmith) is exactly the reviewed
// bytes: every file listed in vendored-files.json, each with its sha256. zvm.js, with Frotzsmith's
// security patch undone, is the original download, so the patch is all that changed. jquery.min.js
// is the official 3.5.1 file less its trailing newline. Exits 1 on any difference.
//   node scripts/check-vendored.mjs   (CI runs it)
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { unpatchVendoredZvm } from './vendored-zvm-patch.mjs'

const root = new URL('../', import.meta.url)
const manifest = JSON.parse(readFileSync(new URL('vendored-files.json', root), 'utf8'))
const sha256 = b => createHash('sha256').update(b).digest('hex')
const read = p => readFileSync(new URL(p, root))
const problems = []

const listed = manifest.files.map(f => f.path).sort()
// Ours, not vendored: the README and the notices file.
const ours = new Set(['README.md', 'THIRD-PARTY-NOTICES.txt'])
const onDisk = readdirSync(new URL('public/play/web/', root)).filter(f => !ours.has(f)).map(f => `public/play/web/${f}`).sort()
if (JSON.stringify(listed) !== JSON.stringify(onDisk)) problems.push(`listed ${listed.join(', ')}; on disk ${onDisk.join(', ')}`)
for (const f of manifest.files) {
  if (sha256(read(f.path)) !== f.sha256) problems.push(`${f.path}: its sha256 isn't the recorded one`)
}
const zvm = manifest.files.find(f => f.path.endsWith('/zvm.js'))
try {
  // The header must be one leading /*! … */ comment, its only "*/" the one that ends it, so stripping
  // it can't hide anything else from the upstream comparison.
  let s = read(zvm.path).toString('utf8')
  const end = s.indexOf('*/\n')
  if (!s.startsWith('/*!') || end < 0 || s.slice(0, end).includes('*/')) throw new Error('its header is not one leading /*! comment')
  s = unpatchVendoredZvm(s.slice(end + 3))
  if (sha256(s) !== zvm.upstreamSha256) problems.push('zvm.js minus its security patch is not the original download')
} catch (e) {
  problems.push(`zvm.js: ${e.message}`)
}
const jq = manifest.files.find(f => f.path.endsWith('/jquery.min.js'))
if (sha256(Buffer.concat([read(jq.path), Buffer.from('\n')])) !== jq.upstreamSha256) problems.push('jquery.min.js is not the official 3.5.1 file')

if (problems.length) {
  console.error(`check-vendored:\n  ${problems.join('\n  ')}`)
  process.exit(1)
}
console.log(`check-vendored: ${manifest.files.length} vendored files match, and zvm.js is upstream plus its security patch`)
