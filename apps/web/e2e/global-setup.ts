/**
 * The symbols test opens zcode's fixtures (a story and its gameinfo.dbg), which are built, not
 * checked in. Build any that are missing or stale first (quick when they're current), so this suite
 * runs on its own as well as after zcode's tests. Needs @frotzinc/inform6-wasm built: `pnpm -r build`.
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export default function setup(): void {
  const zcode = fileURLToPath(new URL('../../../packages/zcode/', import.meta.url))
  const r = spawnSync(process.execPath, ['scripts/build-fixtures.mjs'], { cwd: zcode, stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`Building zcode's test fixtures failed (exit ${r.status}); run \`pnpm -r build\` first.`)
}
