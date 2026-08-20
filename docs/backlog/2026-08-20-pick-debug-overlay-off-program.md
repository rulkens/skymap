# Pick-debug overlay is off `frameProgram` — the target shape is a parallel pick program

`deferred` · Rendering · filed 2026-08-20, from decision #16 D5
(`docs/research/engine/decisions.md`), rung 6 of the engine-composition ladder

## The target shape (user directive, 2026-08-20)

Not "fold one overlay into `CONTENT_LAYERS` some day." Pick execution itself
adopts the frame-program shape: a **parallel program instance** — the same
executor, the same `(target, slab)` vocabulary — with its own rows and its own
targets. This is sequenced as a **new ladder rung at the umbrella
reassessment** (decision #9), not as a bolt-on to `frameProgram` and not as
this rung's work. This file exists so that rung inherits the evidence below
rather than re-deriving it.

## The site today

- `runFrame.ts:697` calls `drawPickDebugOverlay(state, deps)` **after**
  `renderFrame()` (`runFrame.ts:677`) — its own command encoder, its own
  `queue.submit`, no `ContentLayer`, no `frameProgram` step.
- `drawPickDebugOverlay.ts` is the call site; `pickProgram.ts`'s
  `renderForDebug()` (`:304-338`) does the actual per-slab recording.

Why it's off-program: `drawPickDebugOverlay.ts` itself argues the post-submit
placement is "a latency choice, not a data dep" and that folding it in would
widen `renderFrame`'s input type. Both are true and neither is the real
blocker — as a `ContentLayer` on `(swap, NEAR0)` it would need no encoder, no
pass and no swap view of its own (the executor supplies them), the pipeline is
depth-less and swap-formatted so it is pass-compatible, and it would join the
timing and toggle lists for free. What actually blocks it is a hazard neither
file names: `renderForDebug()` submits its own encoder from inside a layer's
`draw()`, and every `queue.writeBuffer` call issued there lands on the GPU
**before** the outer frame's already-recorded commands execute — the same trap
`bodyPickRenderer.ts` documents for the real pick path — and it was read as
breaking the non-reentrancy discipline `starCatalogLayer.ts:168-175` relies on
for its shared frustum scratch. The exhaustive renderer/layer sweep
(`renderer-layer-outliers.md:27`) never captured this site: it lists
`pickDebugOverlay` only as a factory-signature outlier, never as an
off-program draw.

## The 2026-08-20 audit — first evidence for the eventual rung

Verdict: **SAFE-WITH-CONDITIONS**. Eleven of twelve pickable rows are clean; one
is a blocker.

**Blocker** — `zoneOfAvoidanceRenderer.ts:70`'s single `uniformBuffer` is
written by both the visual `draw()` (`:434`) and `drawPick()` (`:464`) through
one `writeUniforms()` (`:420`), with **different values**: the visual write
uses the reduced `zoa` viewport and the LIVE tween-interpolated `upBasis`, the
pick write uses the full canvas and `ORIENTATION_FRAMES[orientation]`
(`helpers/pickFrameContext.ts:74-75`). Folding the overlay into `frameProgram`
without splitting these apart would let the pick pass's write land between
the visual pass's write and its own draw, snapping the visible band to the
destination roll for the duration of an orientation transition — a dev-only
overlay silently corrupting the visible frame, invisible to every unit test.
Splitting `drawPick` onto its own buffer + bind group is ~10 lines in the
pattern `galaxyPickRenderer.ts:161` already uses, and **is a valid prep
refactor on its own merits**, independent of whether the fold ever happens.

**Two premises this deferral was founded on are corrected, not confirmed, by
the audit:**

- Pick-texture completeness is **fine** — `submit(E2)` (the debug-overlay
  encoder) precedes `submit(E)` (the outer frame's encoder), so recording
  order is not execution order and the pick textures are complete before the
  outer frame samples them. This was assumed to be a problem; it is not.
- The `frustumScratch` re-entrancy worry is **placement-contingent**, not
  fatal. It does not bite provided the folded row sits in the program's last
  step, `(swap, NEAR0)`, immediately before `clipPathDebugLayer` — every
  visual `draw()` has returned by then, having already flushed its scratch to
  the GPU.

## Conditions, if the eventual rung picks this up

1. The row must sit at `(swap, NEAR0)` immediately before `clipPathDebugLayer`,
   or the `frustumScratch` re-entry hazard reopens.
2. Dawn must be runtime-verified to accept `queue.submit` from inside an open
   render pass recorded on another encoder — unproven, not merely assumed.
3. The gizmo-over-overlay stacking flip (`clipPathDebugLayer`'s gizmo would
   paint OVER the pick overlay instead of under it, as it does today) needs
   the user's explicit acceptance — a product call, not an engineering one.
4. The `zoneOfAvoidanceRenderer.ts:70` blocker above is fixed first (or as
   part of the same rung).

## What it buys

One timing slot (currently invisible to `TIMED_SLOTS`), one toggle row (folds
into the Renderer Toggles list for free), one fewer swap-chain acquisition per
frame, and roughly 110 deleted lines (the overlay's own encoder/submit
plumbing in `drawPickDebugOverlay.ts` and its call site).

## Related

- [`docs/research/engine/decisions.md`](../research/engine/decisions.md)
  decision #16 D5 — the ruling this file backs.
- [`docs/research/engine/renderer-layer-outliers.md`](../research/engine/renderer-layer-outliers.md):27
  — the factory-signature outlier entry that never captured this site.
