# `EngineState` store getters tear mid-frame

**Readiness:** `needs-design`. **Surfaced:** 2026-10-19, architecture audit (`docs/audits/2026-10-16-architecture-weak-points.md`).

## Problem

`engine.ts:132-146` defines `settings`, `selection` and three more as getters that read `store.getState()` on every access. `runFrame.ts:105` reads "the frame's ONE store snapshot" into `stored`, yet the frame dispatches camera actions (`:140`), `engineScaleChanged` (`:188`) and `engineBodyDistanceReported` (`:251`) before the passes run, and sagas run synchronously on dispatch. Two passes in one frame can therefore read different store states. `EngineState` has 28 top-level fields, ~90 reachable members and 79 importers; `contentVersion`'s docblock named a writer that no longer writes it (fixed 2026-10-19).

## Direction

Freeze one root state per frame into the frame context and pass it to every consumer; the getters go. Longer term, split `EngineState` into the boot product, a per-frame view and runtime scratch (pairs with the boot-phase-products item).
