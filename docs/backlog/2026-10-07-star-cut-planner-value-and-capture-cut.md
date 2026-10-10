# Star cut: two simplifications blocked by the frame engine

**Found:** 2026-10-07, simplicity review of the GPU star cut (PR #856). Both
were attempted and stopped at the engine boundary. They belong with the
declarative frame program design
(`docs/grill-sessions/declarative-frame-program-2026-09-23.md`), which decides
what a frame step may know and when.

## 1. The planner's value is parked on the renderer

`starCatalogPlanner` (`src/layers/starCatalog/frame.ts`) is a
`FrameContentPlanner<void>`: it stores the frame's `StarCutInputs` with
`renderer.setFrameCut` and reads its own previous value back with
`getFrameCut`. The compute row, both star passes and `drawPick` then reach
through `runtime.renderer` for a value the renderer only holds.

Un-braided shape: the planner returns the inputs as its planner value and
consumers read `snapshot.plans.get(planner)`.

Blocker: `drawPick` runs from `pickProgram`, whose context
(`pickFrameContext` → `deriveFrameContext`) mints an empty plan store, and a
pick must name a star from the last rendered frame's lists. The value has to
outlive the frame, so it needs either a plan store the pick context can read
or a pick-side hand-off in `src/services/engine/frame/`.

## 2. The capture cut is submitted by a draw

`starCatalogRenderer.drawCut` calls `cut.submitCapture(inputs)` for a capture
face, and `starCutGpu.submitCapture` uses the identity of the inputs object as
a once-per-frame token, on its own encoder with its own `queue.submit` inside
a render-pass callback. A planner that reused one inputs object across frames
would silently leave the capture cut stale.

Un-braided shape: the `star-cut` compute row encodes the capture cut beside
the frame cut when the frame has capture faces.

Blockers: capture faces are partitioned out of the once-scope prelude, run on
their own encoder and are submitted before the remaining steps (including
`star-cut`) are encoded (`renderFrame.ts`, the capture branch); and once-scope
planners run before `scheduleCubemapCaptures`, so nothing ahead of the faces
knows the frame has any.
