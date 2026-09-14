# Sky-cubemap band memory derived, not stored

**Raised:** 2026-09-09, user reviewing what mutates `cameraRuntime` (the review
that moved the sky capture's runtime onto `EngineState`, PR #670).

Still open after the keyed-cubemap-captures work (PBR prep P1): that change made
the memory **per capture row** rather than one hardcoded sky row, but it is
still stored rather than derived.

## Stored today

`CubemapCaptureRuntime` carries `lastBandActive` and `lastAnchorDistanceMpc`:
the row's band state and the camera's distance from the row's anchor **as of the
last rendered frame**. `scheduleCubemapCaptures` is the sole writer (it
recomputes both from `ctx.drawCamPos` every frame); the row's `allocateWhen` in
`renderTargets.ts` is the sole reader. Both are derivable from this frame's
camera pose — they are stored only because the reader cannot see it.

## Why stored

`allocateWhen` receives `(state, isAllocated)` and runs inside `reconcile`,
which `runFrame` calls before the frame's pose is produced, so it cannot see the
band open; the edge reconciles inside the frame instead. The band-entry frame is
the frame that sweeps all six faces, so the target row has to already exist by
then. Hence the second, edge-triggered `reconcile` call plus the two last-frame
fields.

## Un-braid shape

Give the reconcile path the frame context (or run it after pose production), so
`allocateWhen` derives the band and the distance rather than reading stored
copies. Either way the band-entry-frame constraint must be solved explicitly:
the row has to exist before the sweep on the frame the band opens, which is what
the current edge reconcile buys.

`bakedSettings` stays — it is GPU-texture bookkeeping (which settings the
current cubemap contents were baked under), not a derivable quantity. A
previous-frame band value stays too if the band-entry edge survives: an edge is
inherently a two-frame comparison.

With more than one `CUBEMAP_CAPTURES` row the cost is per row, so this gets
worse, not better, as the PBR reflection probes land.
