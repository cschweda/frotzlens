# @frotzinc/zmachine

A Z-machine interpreter for versions 3, 4, 5 and 8, in TypeScript. It runs decoded instructions one at a time (no `eval`, no JIT, so it runs under a strict Content-Security-Policy), keeps all its state as plain data, and stops whenever it needs input, so the host decides how input arrives. No DOM: it runs in a browser, a Web Worker, or Node. The interpreter behind [frotzplay](../../apps/play).


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

Or from a terminal: `zmachine-run story.z5 script.txt [--seed N]` prints each turn's text. A script is one command per line (`!` starts a comment); `[timeout]` means a timed read's interval ran out, and `[key x]` presses a key for `@read_char` (`[key]` is Return), so a recorded session with its timer events replays exactly.

## Debugging

`Debugger` (since 0.2.0) runs a machine under observation, for [frotztrace](https://frotztrace.frotzinc.com): breakpoints, stepping, the call stack and a trace. It owns the machine and runs its own loop over `step()`, so it stops between any two instructions; with nothing set, a story plays exactly as it does on a plain `Machine`.

```ts
import { Debugger } from '@frotzinc/zmachine'

const d = Debugger.create(storyBytes, { seed: 1, trace: { kinds: ['call', 'return'] } })
if (!(d instanceof Debugger)) throw new Error(d.fault.message)

d.addBreakpoint({ kind: 'routine', routine: 0x27f8 }) // or { kind: 'address', address }
let stop = d.run()            // 'breakpoint' | 'input-line' | … | 'budget' | 'paused'
d.stack()                     // [{ routine, pc, locals, evalStack, argCount }, …], innermost last
d.stepOver(); d.stepOut(); d.stepInstruction(); d.continueTo(0x2810)
d.resume({ line: 'look' })    // as Machine.resume, and logged in d.inputLog
d.trace.events()              // [{ kind: 'call', at, routine, args, depth }, …]
d.stepBack()                  // and goToInstruction(n), goToTurn(t): back (or forward) in time
d.timeline()                  // { current, head, turns: [{ turn, instruction, line }], checkpoints }

// With symbols (zcode's readSymbols(gameinfo.dbg), or inferSymbols without one):
d.addBreakpoint({ kind: 'action', action: 4, condition: 'noun == lantern' })
d.inform()                    // { action: { value: 4, name: 'Take' }, noun: { value: 27, name: 'lantern' }, … }
d.sourceLine(); d.stepLine()  // story.inf:106
d.addWatch('lantern in player'); d.evaluate('score > 10')
d.view()                      // { pc, frame, changed: { addresses, globals, objects } }
```

**Time runs both ways.** The debugger keeps checkpoints (at every prompt, and every 100 000 instructions) and the log of every input with when it was given; going back restores the nearest checkpoint and replays, exactly, since random is seeded. Behind the furthest point reached, running forward replays the logged future; giving a new input there starts a new timeline. Every stop is before the instruction at the PC runs; a breakpoint the debugger is resting on doesn't fire again until the machine moves. Each frame now records its routine (`Frame.routine`), so a stack can be named; a 0.1.x snapshot, whose frames lack it, still restores. The design: [docs/18](../../docs/18-frotztrace-phase-1-debugger.md).

## Conformance

The Z-Machine Standards Document 1.1, versions 3, 4, 5 and 8, checked against [ZVM](https://github.com/curiousdannii/ifvms.js) (Parchment's engine) on every sample story: the same story, commands and seed give the same transcript. Deliberate choices:

- **Random numbers** follow ZVM, not the Standard's suggested "predictable" mode for small seeds (§2.4.1, a recommendation ZVM doesn't follow either): seeded play draws from a mulberry32 stream where ZVM would use `Math.random`, and `@random -n` switches to ZVM's own xorshift.
- **Version 6**, sound beyond beeps, and font 3 are not supported.

## Standing on

The [Z-Machine Standards Document](https://inform-fiction.org/zmachine/standards/) (Graham Nelson, Andrew Hunter and contributors); [ZVM / ifvms.js](https://github.com/curiousdannii/ifvms.js) by Dannii Willis, the test oracle, whose xorshift `@random` is copied here with attribution (MIT).

MIT. From [frotz, Inc.](https://frotzinc.com).
