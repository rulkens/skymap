# The saga-context boot-ordering argument is restated in nine passages

Surfaced during the 2026-07-30 entanglement-radar pass over the `url-hash-saga-port`
branch.

## The argument

One causal chain, told end to end:

> `createAppStore` runs the root saga inside the factory, before it returns. Almost every
> watcher is reactive and is therefore woken after the engine has registered the saga
> context. `watchHashSaga`'s read half is not: it dispatches on its own initiative from the
> arrival URL. Its dispatches wake watchers that reach the engine through `getContext`, and
> a throw in any watcher propagates to the root and cancels every sibling. So the bridge
> waits for `sagaContextRegistered`, which `createEngine` dispatches synchronously, before
> the async bootstrap IIFE.

## Where it is told

| File                                      | Lines       | Role                                            |
| ----------------------------------------- | ----------- | ----------------------------------------------- |
| `src/store/sagaContextRegistered.ts`      | 1-32        | the canonical telling                           |
| `src/store/createAppStore.ts`             | 35-45       | why the factory dispatches the action           |
| `src/store/createAppStore.ts`             | 81-88       | why merge-then-announce, in that order          |
| `src/store/rootSaga.ts`                   | 31-42       | why composing watchers pre-registration is safe |
| `src/state/url/watchHashSaga.ts`          | 26-61       | why the gate is in the parent, not either half  |
| `src/state/url/watchHashReadSaga.ts`      | 8-24        | why its dispatches need the context             |
| `src/state/url/watchHashWriteSaga.ts`     | 16-21       | why its `takeEvery` must not start early        |
| `src/services/engine/phases/wireInput.ts` | 169-181     | why registration must stay ahead of bootstrap   |
| `tests/state/url/watchHashSaga.test.ts`   | 8-23, 88-94 | what the test is pinning                        |

Nine passages, one fact. Line numbers are as of this branch and will drift.

## Why raise it against the didactic-comments convention

The convention is deliberate and this is not an argument against it. The objection is
narrower: the argument is not local to any of these files, and duplicating a NON-LOCAL fact
has the same failure mode as duplicating a constant. The concrete evidence is that the
branch tightened `setSagaContext` from `Partial<SagaContext>` to the whole `SagaContext`
precisely because the signal could lie — a one-line type change whose blast radius is nine
docblocks that each restate what the signal means.

## Proposed shape

The full chain stays in `sagaContextRegistered.ts`, which already tells it best and is the
thing the argument is about. The other eight state only their LOCAL consequence and point
there. For example, `watchHashWriteSaga` keeps "this `takeEvery` is live from the instant
the saga starts, so it must not start before the arrival read — `watchHashSaga` owns that
wait" and drops the retelling of why the wait exists.

The test's two comment blocks are the judgement call: a test docblock arguably should be
self-contained about what it pins. Reducing them to the local claim plus a pointer is still
the recommendation, but flag it at review rather than assuming.

## Read this first if you pick it up

The `setSagaContext` totality change lands on the `url-hash-saga-port` branch. Several of
these nine passages describe a `Partial` setter, a bag that grows a capability at a time, or
a signal that is true only by convention — all of which the tightening changed. Re-read
every passage against the current signature before consolidating, or the consolidated
telling will preserve a claim that is no longer true.

Size: small.
