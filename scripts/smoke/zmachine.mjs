// Smoke test for a packed @frotzinc/zmachine, run by publish.sh in a scratch project where the tarball
// (and @frotzinc/zcode, its one dependency, from npm) is installed. A 72-byte version 5 story is built
// here: it prints "hi" and quits. Exits non-zero on any problem.
import { Machine, normalizeTurn, play, readQuetzal, writeQuetzal } from '@frotzinc/zmachine'

const check = (ok, what) => { if (!ok) throw new Error(what) }

// The story: a 64-byte header, then PRINT "hi", NEW_LINE, QUIT at 0x40.
const story = new Uint8Array(72)
story[0] = 5 // version
const set16 = (a, v) => { story[a] = v >> 8; story[a + 1] = v & 255 }
set16(0x04, 0x40) // high memory
set16(0x06, 0x40) // initial PC
set16(0x0c, 0x40) // globals (unused)
set16(0x0e, 0x40) // static memory
set16(0x1a, 72 / 4) // file length
// PRINT (0OP:2) "hi": h=13, i=14, padded with 5, the end bit set; NEW_LINE (0OP:11); QUIT (0OP:10).
story.set([0xb2, 0xb5, 0xc5, 0xbb, 0xba], 0x40)

const r = play(story, [], { seed: 1 })
check(r.turns[0]?.output === 'hi', `output ${JSON.stringify(r.turns[0]?.output)}`)
check(r.stoppedBy === 'quit', `stopped by ${JSON.stringify(r.stoppedBy)}`)

const m = Machine.create(story, { seed: 1 })
check(m instanceof Machine, 'Machine.create')
check(m.run(1000).kind === 'quit', 'run')
const bad = Machine.create(new Uint8Array(10), { seed: 1 })
check(!(bad instanceof Machine) && bad.fault.code === 'bad-story', 'a bad story is a fault, not a throw')
check(normalizeTurn('\n hello \n\n\n>') === 'hello', 'normalizeTurn')
check(typeof readQuetzal === 'function' && typeof writeQuetzal === 'function', 'Quetzal')
console.log('zmachine: played a story ("hi"), quit, faulted a bad one')
