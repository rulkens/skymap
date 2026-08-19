# mcpm-workbench frame-loop economy

Two coupled improvements to `Viewport.tsx`'s `startLoop`. Assessed during the grid-box gizmo
wrap-up design discussion; not started.

## 1. Render-on-demand

Skip command encoding when nothing changed. Dirty signals: store `subscribe` (one flag), pointer
events, canvas resize. Always-dirty cases: `sim.running`, `layers.pathTracer` on (progressive
accumulator). Keep the rAF alive, early-out before the encoder.

Gotchas to carry into the fix:

- The FPS-badge store write must NOT itself set the dirty flag (feedback loop).
- Time-based windows (box-preview flash, drag-holds-wireframe) need a `holdUntil` deadline term,
  not just change edges.
- The FPS EMA needs the existing `lastFrameTime = -1` reseed after idle gaps.

Optional extension: a path-tracer sample cap, so the tracer layer can go idle once accumulated.

## 2. Interaction-priority quality window

UI sluggishness at low fps is GPU contention (compositor jobs queue behind big workbench
submits), not main-thread JS. Generalize the existing `effectiveVolpathDivisor` boost pattern:
trigger on any UI store write (not just camera), apply to the path-tracer divisor, the raymarch
divisor, and the sim step cadence.

Second lever: split the single per-frame encoder into smaller submits so compositor work can
interleave.

Non-fix: an OffscreenCanvas worker — same GPU contention, doesn't address the cause.
