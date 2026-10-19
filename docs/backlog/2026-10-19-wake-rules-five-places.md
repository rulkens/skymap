# Render-wake rules live in five places

**Readiness:** `needs-design`. **Surfaced:** 2026-10-19, architecture audit (`docs/audits/2026-10-16-architecture-weak-points.md`).

## Problem

`watchWakeSaga.ts:45` (routes), `watchSelectionWakeSaga`, `watchInputWakeSaga` and `layers/galaxyCatalog/sagas/watchPaletteWakeSaga.ts` (which exists only because `galaxyCatalogAssetRows.ts:63` reads `ui.paletteOpen`) each decide when the loop wakes; `applySceneEffect.ts:49,64-72` and `createPickDriver.ts` dispatch from inside the frame. A Layer that reads `ui`, `engine` or `takeover` renders late until something else wakes the loop.

## Direction

One declarative wake table: a Layer's asset row or pass declares the store routes it reads; one saga wakes on any of them. Delete the four watchers.
