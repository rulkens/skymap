# Layers cannot take part in the HDR swap-format rebuild

**Readiness:** `needs-design`. **Surfaced:** 2026-10-19, architecture audit (`docs/audits/2026-10-16-architecture-weak-points.md`).

## Problem

`createLayers.ts:93` hands a Layer the boot swap format. `buildSwapRenderers.ts:153-158` rebuilds only the core `GPU_HANDLE_ROWS` flagged `rebuildOnSwapFormat`. No Layer pass sits on an `OVERLAYS` line today, so nothing is broken; nothing stops the next one, and the failure is the silent black frame the error-scope item describes.

## Direction

Either a Layer `onSwapFormat(runtime, format)` hook called from `buildSwapRenderers`, or `checkFrameOrder` rejects a Layer pass on a swap-target line (the cross-check item does the latter as the interim rule). Decide which when the first Layer overlay is wanted.
