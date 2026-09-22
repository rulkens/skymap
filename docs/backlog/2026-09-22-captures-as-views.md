# Model a capture face as a view, not a third step kind

**Raised:** 2026-09-22, per-view planning prep (`docs/superpowers/plans/2026-09-22-per-view-planning-prep.md`
Task 7), from a greenfield cross-check during that prep's `refactor-ground`
pass. Priced and not adopted at that checkpoint — not needed by the dome.

Today `CaptureStepSpec` (`src/@types/engine/frame/CaptureStepSpec.d.ts`) is
its own `FrameStepSpec` kind, authored as PRELUDE lines in
`src/data/rendering/frameSections.ts`. `expandFrameOrder.ts` expands each
capture key into a synthetic per-face `ctx` — never a real `FrameView` — so
a capture face sits outside the `plan`/`compute`/`render` program every
other view now runs.

## The greenfield shape

Model a capture face as a `role: 'capture'` entry in the frame's view list,
alongside `role: 'draw'` for canvas/dome/eye views. Sections and planners
gain a `roles` field as the single exclusion knob, replacing the capture
step's own roster fields (`cosmoPasses`/`near0Passes`/`bodyPasses`) with the
same per-view program a draw view already runs.

## The price

A rework of #769's capture step (the synthetic-ctx roster mechanism), not a
small follow-on: `expandFrameOrder`, `checkFrameOrder`'s boot rules, every
roster-field consumer, and `CaptureStepSpec` itself all move. Revisit if a
future rig (VR, a second dome variant) needs captures to carry real planned
content instead of a synthetic ctx.
