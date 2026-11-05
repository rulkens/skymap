# Make the frame context's focus fields readonly

**Readiness:** `needs-design`. **Surfaced:** 2026-10-16, while landing the layer-declared visibility PR (#912, ask dvSx).

## Problem

`ReadyFrameContext` is readonly except for three focus fields: `focus`, `focusBlend` and `focusPickId`.
`deriveFrameContext` builds the snapshot with at-rest placeholders. `runFrame` (`runFrame.ts:232-234`) and
`pickFrameContext` (`pickFrameContext.ts:42-44`) then overwrite all three in place, because the focus fade ticks
there and the blend and the subject's pick word must come from the same tick. Every Layer receives a context whose
fields it could write.

## Direction to research

Tick the focus before the snapshot is built and pass the result into `deriveFrameContext`. The three fields would
then be set once, at construction, and the type could be fully readonly. Check the cubemap path, which today leaves
them at rest (blend 0), and the pick path, which reads `lastFocusUniforms()` without ticking.
