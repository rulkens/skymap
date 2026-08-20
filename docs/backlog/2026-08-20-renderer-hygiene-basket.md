# Consolidate the renderer hygiene-basket duplications (grow-buffer / fade-scratch / fullscreen-tri / sub-pixel cull)

Surfaced by the 2026-08-17 renderer/layer sweep
([`renderer-layer-outliers.md`](../research/engine/renderer-layer-outliers.md)
§4 items 2, 4, 5; §6 ladder table, "hygiene basket — one small PR anytime, or
opportunistic within rungs that touch the files"). `ORPHAN` in the 2026-08-20
carry-forward audit for the four findings below — none had ever been filed.

## What it is

Four small, well-understood duplications named as a group ("hygiene basket")
because each is a mechanical extract-one-helper, not a design question:

1. **Grow-on-demand instance buffer, ×7+ copies.**
   `instancedQuadRenderer`'s parameterized `capacity` config already exists
   as the pattern to extract to; the seven-plus copies vary by stride,
   label, usage, count unit, and overflow policy.
2. **16-byte fade-scratch duplication, ×4** (one existing comment already
   admits "same shape as filamentRenderer's"); additionally
   `structureMarkerRenderer` re-declares the dummy-fade pair the shared
   `createDummyFadeBindGroup` helper already provides — a redundant
   fifth instance of a problem the shared helper was built to solve.
3. **Fullscreen-triangle duplication, ×5 + a second implementation.**
   Byte-identical vertex bodies across `additiveUpsample`,
   `starAggregateUpsample`, `compositor`, and `bloom`, plus
   `lib/fullscreenTri.wesl` implementing the same primitive a second,
   different way; `VSOut` is duplicated ×5 alongside it. (The stale doc
   comments this duplication left behind — `bloom/io.wesl`'s header and
   `additiveUpsample.ts`'s "two subsystems" count — are filed separately:
   [stale shader-tree doc comments](2026-08-20-stale-shader-tree-doc-comments.md).)
4. **Sub-pixel cull recomputed, ×3** (§2 "Copied gates" table).

## Why it matters

Pure cleanup — none of the four are correctness bugs today, each is a
hand-copied pattern with an existing extraction target already living in the
codebase (`instancedQuadRenderer`'s `capacity` config, the fade-scratch
comment's own admission, `lib/fullscreenTri.wesl`, or a shared cull helper
waiting to be written). The cost of leaving them is the ordinary
copy-paste-drift risk: each new renderer that needs any of these four things
is another hand-copy rather than a call site, and the four have already
proven they accrete (fullscreen-tri grew a second full implementation before
anyone noticed).

## Partial capture — read before filing more

The sibling finding from this same hygiene basket — "third copy of the
reduced-res viewport formula" (`renderTargets.ts`, `scalarVolumeLayer.ts`,
`zoneOfAvoidanceLayer.ts`) — **is already tracked**: `BACKLOG.md:143`,
proposing `renderTargets.sizeOf(target)` as the consolidation. Do not
re-file that one; this item covers only the four findings above.

## Approach

Each of the four is independently pickable (no shared design decision ties
them together beyond "extract the existing pattern"):

1. Grow-buffer: parameterize the ~7 copies onto
   `instancedQuadRenderer`'s existing `capacity` config, threading
   stride/label/usage/count-unit/overflow-policy as config fields.
2. Fade-scratch: consolidate the 4 duplicated 16-byte scratch buffers onto
   one shared helper; fix `structureMarkerRenderer` to call
   `createDummyFadeBindGroup` instead of re-declaring the dummy-fade pair.
3. Fullscreen-tri: pick one of the two implementations
   (`lib/fullscreenTri.wesl` vs. the ×5 inline copies) as canonical and
   migrate the other four call sites onto it; decide whether `bloom`
   (which the sweep separately notes is deliberately family-local) stays
   out of the consolidation.
4. Sub-pixel cull: extract the ×3 recomputed logic into one shared helper.

"One small PR anytime" per the sweep's own ladder note — none of the four
block or are blocked by any ladder rung.
