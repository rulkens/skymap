# Boot phases return typed products instead of mutating shared state

**Readiness:** `needs-design`. **Surfaced:** 2026-10-19, architecture audit (`docs/audits/2026-10-16-architecture-weak-points.md`).

## Problem

`bootstrap.ts:1-5` says phases communicate only by mutating state. `phaseLocals?` is optional and read with `!` at `wireSlots.ts:332` and `wireInput.ts:36`; 38 GPU handles start `null`. The `pickProgram` row captures `state.passes` by value (`gpuHandleRegistry.ts:314`) and its comment says it waits for `focusUniform`, which is the first row `initGpu` builds; the real dependency is `createLayers`, and moving the row would capture `[]` and make picking silently return nothing. `createLayers.ts:117-138` forks Layer feeds whose `consumeSourceCountSaga` dispatches `'ready'` (`:78-81`) before `wireSlots.ts:358` dispatches `'loading'`; `starCatalogSourceCounts.ts:5-11` documents the workaround. `engine.ts:475-479` needs a getter because `initGpu` reassigns `timingService`; the camera runtime is seeded twice (`engine.ts:101`, `wireInput.ts:93`).

## Direction

Each phase returns a typed product the next phase takes as its input; `EngineState` is assembled from the products at the end. Gate Layer feeds on the `loading` dispatch. Fix the `pickProgram` row's comment in the same PR as whatever moves it.
