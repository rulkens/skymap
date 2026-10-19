# `runTakeoverSaga` races the body against `exitTakeover` once

**Readiness:** `ready`. **Surfaced:** 2026-10-19, architecture audit (`docs/audits/2026-10-16-architecture-weak-points.md`).

## Problem

`runTakeoverSaga.ts:13-22` does not race the body against `exitTakeover`; `exhibitBodySaga.ts:81,96`, `clipBodySaga.ts:63`, `tourBodySaga.ts:152` and `missionHoldSaga.ts:78` each take it themselves. `navigateSaga.ts:133` waits on `all([take(takeoverEnded), put(exitTakeover())])`, so a body that forgets hangs every later navigation. A Layer-declared hold kind (`missionTimelineKind.ts:11`) is exactly the author who will forget.

## Direction

`race({ body: call(body), exit: take(exitTakeover) })` in `runTakeoverSaga`; delete the four per-body takes. Reproduce first with a hold that never takes.
