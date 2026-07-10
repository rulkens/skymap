# Blue Marble texture loading out of initGpu's fire-and-forget IIFE

**Readiness:** ready
**Area:** Engine & State / loading

## Problem

`initGpu.ts` kicks off the Earth texture fetch as an un-awaited async IIFE
right after constructing the earth renderer
(`src/services/engine/phases/initGpu.ts:456` — `void (async () => { fetch →
createImageBitmap → setTexture → requestRender })()`). That was expedient for
plan 02 (PR #425) but it is the exact anti-pattern the `ASSET_WIRING` header
warns against: a scattered imperative load call instead of a row in the flat
registry of fetchable assets.

Concrete costs of the IIFE shape:

- **No lifecycle ownership.** Nothing can cancel or await it. `destroy()` is
  only half-guarded by the `?.` on `setTexture` — the fetch and the
  multi-megabyte `createImageBitmap` decode still run to completion after
  teardown, and `requestRender()` fires against a possibly-torn-down
  scheduler.
- **Unconditional cost at boot.** Every visitor pays the ~MB JPG fetch +
  decode at page load, even though the texture is only visible after a
  deep-zoom descent to Earth (sub-`1e-3` Mpc camera distance). Every other
  fetchable asset gates on a `demand(ctx)` predicate.
- **Untestable.** The load path is anonymous closure state inside a bootstrap
  phase — no unit can exercise the failure branch, the swap, or the wake.
- **Wrong layer.** `initGpu` is the construct-GPU-handles phase; content
  loading lives in `services/loading/slots/` + `assetWiring.ts`, wired by
  `wireSlots` and driven by `reevaluateDemand`.

## Fix direction

Make the texture a first-class asset row: a `createEarthTextureSlot` in
`src/services/loading/slots/` (fetch + `createImageBitmap` in `load`, abort
on release) plus an `ASSET_WIRING` row whose commit calls
`earthRenderer.setTexture(bitmap)` and wakes the scheduler. The `demand`
predicate is the design decision:

- **`() => true`** — behaviour-preserving (still loads at boot), but gains
  cancellation, testability, and the registry home. Smallest step.
- **Descent-gated** — e.g. `ctx.cam.distance < <threshold>` so the JPG only
  fetches when the user actually heads for Earth; mirrors how the thumbnail
  pipeline defers cost until visibility. Needs the placeholder-blue sphere
  (already the renderer's pre-texture state) to cover the in-flight window,
  which it does today. Check `DemandCtx` exposes camera distance; if not,
  that read-surface addition is part of the work.

Either way the IIFE (initGpu.ts:448-466) is deleted and the phase goes back
to pure handle construction.

## Timing

Best picked up alongside zoom-to-earth plan 03 (which touches the same
foreground/LOD surfaces) or the renderers-folder-reorg pass — but it is
self-contained enough to go standalone.
