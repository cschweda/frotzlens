// @ts-expect-error — a plain .mjs script, shared with scripts/golden.sh
import { buildFixtures } from '../scripts/build-fixtures.mjs'

export default async function setup(): Promise<void> {
  await buildFixtures()
}
