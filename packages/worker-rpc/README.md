# @frotzinc/worker-rpc

A request/response client for one long-lived Web Worker. Every call settles with an explicit outcome, and the caller owns the policy:

| Outcome | Meaning |
|---|---|
| `ok` | The worker answered this request |
| `error` | The worker answered with `{ error }` |
| `unavailable` | The worker couldn't be built, or fired `error`/`messageerror`; it will never answer |
| `timeout` | No answer within the budget; the worker was terminated |

On `unavailable` and `timeout` the worker is terminated and dropped, so the next call builds a fresh one, and every other request still waiting on it settles with the same outcome instead of leaking. A late reply from an abandoned request is ignored (requests carry a monotonic `requestId`).

```ts
import { createWorkerRpc } from '@frotzinc/worker-rpc'

const rpc = createWorkerRpc<Result>({
  spawn: () => new Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module' }),
  parse: data => data.result !== undefined
    ? { kind: 'ok', value: data.result as Result }
    : { kind: 'error', message: String(data.error) },
})

const outcome = await rpc.call({ bytes }, { timeoutMs: 30_000 })
```

The worker replies with `{ requestId, result }` or `{ requestId, error }`; messages without a `requestId` go to `onUntagged`. `clockStartsAfter` starts the timeout only once a promise settles, so a request queued behind other work doesn't pay for it.

`@frotzinc/worker-rpc/testing` exports `makeWorkerSpy(behavior)`, a Vitest Worker mock (`reply-result`, `reply-error`, `error-event`, `messageerror-event`, `silent`).

Extracted from [Frotzsmith](https://frotzsmith.com). MIT. From [Frotz, Inc.](https://frotzinc.com).
