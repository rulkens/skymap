# Star cut frustum prune fades newcomers on re-entry

`needs-design` — byproduct of `walkStarOctreeCut`'s off-screen frustum prune
(star-catalog-pass-extraction plan, 2026-09-20).

## Why

The prune drops an off-screen node's whole subtree at its common ancestor,
coarser than the renderer's exact per-node cull. A node that rotates back
on-screen re-enters `computeStarCut`'s cut as a NEWCOMER — opacity 0, ramping
to 1 over `NODE_FADE_MS` (`src/data/starNodeFade.ts`) — where before the prune
existed it was already in the cut at opacity 1, and only the renderer's exact
cull (not the LOD fade) decided whether it painted, so it snapped in
instantly. During fast interactive pan/rotate the leading screen edge now
shows a ~250ms fade-in band instead of an instant pop. Subtle at near-static
poses, visible in fast rotation; not yet reported as a real complaint.

## Option

Seed frustum-driven newcomers — nodes whose only reason for last frame's
absence was the frustum prune, not an LOD split/merge — at opacity 1 instead
of 0, distinguishing them from genuine LOD-split newcomers (which must still
start at 0 to dissolve the octree-box pop). Left out of the original change
so the prune landed as a pure, measurable optimization first.
