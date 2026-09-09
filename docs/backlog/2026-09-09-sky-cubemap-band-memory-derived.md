# Sky-cubemap band memory derived, not stored

**Raised:** 2026-09-09, user reviewing what mutates `cameraRuntime` (the review
that moved `skyCubemapCapture` onto `EngineState`, PR #670).

## Stored today

`SkyCubemapCaptureRuntime` carries `lastBandActive` and `lastGcDistanceMpc`:
the lensing band's state and the camera's distance from the galactic-centre
anchor **as of the last rendered frame**. `renderFrame` is the sole writer (it
recomputes both from `ctx.drawCamPos` every frame); the `sky-cubemap`
render-target row's `allocateWhen` in `renderTargets.ts` is the sole reader.
Both are derivable from this frame's camera pose — they are stored only because
the reader cannot see it.

## Why stored

`allocateWhen` receives `(state, isAllocated)` and runs inside `reconcile`,
which `runFrame` calls before the frame's pose is produced. From `renderFrame.ts`:
"`runFrame`'s per-frame `reconcile` runs BEFORE this frame's camera pose is
produced, so it cannot see the band open; the edge reconciles here instead" —
and the band-entry frame is the frame that sweeps all six faces, so "it needs
the row to already exist". Hence the second, edge-triggered `reconcile` call
inside `renderFrame` plus the two last-frame fields.

## Un-braid shape

Give the reconcile path the frame context (or run it after pose production),
so `allocateWhen` derives the band and the distance rather than reading stored
copies. Either way the band-entry-frame constraint must be solved explicitly:
the row has to exist before the sweep on the frame the band opens, which is
what the current edge reconcile buys.

`bakedSettings` stays — it is GPU-texture bookkeeping (which settings the
current cubemap contents were baked under), not a derivable quantity. A
previous-frame band value stays too if the `bandJustEngaged` edge survives:
an edge is inherently a two-frame comparison.
