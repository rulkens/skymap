# `DragMode` consumers test `=== 'pan'`, a new variant falls silently into orbit

`ready`.

## What is true today

- `src/@types/camera/DragMode.d.ts` — the shared type is `'orbit' | 'pan'`.
- `src/services/camera/orbitControls.ts:21` declares a second, local
  `DragMode = 'orbit' | 'pan' | 'pinch'` — the recognizer's own type, not an
  import of the shared one. Line 60 sets `dragMode` to `'pan'` or `'orbit'`
  from button state; line 71 sets it to `'pinch'` for a second contact; line
  90 gates click-to-pick on `endedMode === 'orbit'` specifically, so pan and
  pinch are both (correctly, today) excluded — but only because someone
  enumerated `'orbit'` by hand, not because the switch is exhaustive.
- `src/services/camera/applyInputToCamera.ts:49` — `if (step.mode === 'pan') { ... }`
  with no accompanying `else if (step.mode === 'orbit')`; anything that is not
  `'pan'` falls through to the orbit math after the block.
- `src/utils/camera/latchSurfaceGesture.ts:39` — same shape:
  `if (step.mode === 'pan') { ... }`, tilt-handle logic follows unconditionally
  for every other mode.
- `src/services/engine/camera/replayInput.ts:140` —
  `step.kind === 'drag' && step.mode === 'pan' && bodyMovesThisFrame(focus)`
  gates the followed-body strafe path; any other mode skips it silently.
- `src/utils/camera/steppedSitePose.ts` — `InputStep`'s `drag` variant carries
  a `mode: DragMode` field (`src/@types/camera/InputStep.d.ts`), but this file
  never reads `.mode` at all: every `kind === 'drag'` step drives the
  turntable orbit math, so a `'pan'` (or future) mode on the site rung has no
  distinct effect here — it is not tested and not routed, just absorbed.

None of these five sites use a switch or `satisfies never`; each hand-picks
one string literal (`'pan'` or `'orbit'`) and treats the rest of the type as
the other case by omission. Adding a third member to the shared `DragMode`
compiles cleanly and silently reuses the orbit (or no-op) branch everywhere.

## What would fix it

Make the shared `DragMode` the only `DragMode` — drop the local redeclaration
in `orbitControls.ts` — and replace each `if (step.mode === 'pan')` with an
exhaustive `switch (step.mode)` (or an equivalent `satisfies never` default)
so a new variant is a compile error at every consumer, including
`steppedSitePose.ts`, until each site has decided what it does.
