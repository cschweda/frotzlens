// Smoke test for a packed @frotzinc/worker-rpc, run by publish.sh in a scratch
// project where the tarball is installed. Exits non-zero on any problem.
import { createWorkerRpc } from '@frotzinc/worker-rpc'

if (typeof createWorkerRpc !== 'function') throw new Error('createWorkerRpc is not exported')
// A spawn that throws settles as `unavailable` (no Worker needed under Node).
const rpc = createWorkerRpc({ spawn: () => { throw new Error('no workers') }, parse: () => ({ kind: 'ignore' }) })
const outcome = await rpc.call({}, { timeoutMs: null })
if (outcome.kind !== 'unavailable') throw new Error(`expected unavailable, got ${JSON.stringify(outcome)}`)
console.log('worker-rpc: createWorkerRpc settles a dead worker as unavailable')
