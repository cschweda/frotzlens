# @frotzinc/zmachine

A Z-machine interpreter for versions 3, 4, 5 and 8, in TypeScript. It runs decoded instructions one at a time (no `eval`, no JIT, so it runs under a strict Content-Security-Policy), keeps all its state as plain data, and stops whenever it needs input, so the host decides how input arrives. No DOM: it runs in a browser, a Web Worker, or Node. The interpreter behind [frotzplay](../../apps/play).

> **Status: in development** (frotzplay Phase 1). Not yet on npm.

```ts
import { Machine } from '@frotzinc/zmachine'

const m = Machine.create(storyBytes, { seed: 1 })
if (!(m instanceof Machine)) throw new Error(m.fault.message)

let stop = m.run(100_000)
// stop.kind: 'input-line' | 'input-char' | 'budget' (call run again) | 'quit' | 'fault'
console.log(m.flushText())
m.resume({ line: 'look' })
stop = m.run(100_000)
```

Or from a terminal: `zmachine-run story.z5 script.txt [--seed N]` prints each turn's text.

## Conformance

The Z-Machine Standards Document 1.1, versions 3, 4, 5 and 8, checked against [ZVM](https://github.com/curiousdannii/ifvms.js) (Parchment's engine) on every sample story: the same story, commands and seed give the same transcript. Deliberate choices:

- **Random numbers** follow ZVM, not the Standard's suggested "predictable" mode for small seeds (§2.4.1, a recommendation ZVM doesn't follow either): seeded play draws from a mulberry32 stream where ZVM would use `Math.random`, and `@random -n` switches to ZVM's own xorshift.
- **Version 6**, sound beyond beeps, and font 3 are not supported.

## Standing on

The [Z-Machine Standards Document](https://inform-fiction.org/zmachine/standards/) (Graham Nelson, Andrew Hunter and contributors); [ZVM / ifvms.js](https://github.com/curiousdannii/ifvms.js) by Dannii Willis, the test oracle, whose xorshift `@random` is copied here with attribution (MIT).

MIT. From [Frotz, Inc.](https://frotzinc.com).
