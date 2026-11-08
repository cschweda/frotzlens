// @ts-expect-error — a plain .mjs script in the zcode package
import { buildFixtures } from '../../zcode/scripts/build-fixtures.mjs'

export default async function setup(): Promise<void> {
  await buildFixtures()
}
