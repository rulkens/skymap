# Sky-cubemap face seams where the Gaia star aggregates draw

**Reported:** 2026-09-03, user eyeball in the Sgr A\* lens band (branch
worktree-s-star-analytic-lensing, PR #657).

## Symptom

In the lensed view, the cube-face boundaries of the sky cubemap are visible as
seams wherever the Gaia star-aggregate gaussians are drawn. Point content
(galaxy sprites, resolved catalog stars) crosses the same boundaries cleanly.

## Mechanism (hypothesis, unverified)

Each capture face is a 90° frustum. The star-catalog renderer frustum-culls
octree nodes per face against a bounding sphere
(`starCatalogRenderer.ts`, the `cullRadius` branch): for aggregate nodes the
sphere is the box half-diagonal scaled by `spread`, with no angular floor — the
comment there already flags that a fixed-pixel/angular footprint "would need the
pick-style angular floor too". An aggregate gaussian whose node centre lies just
outside face B but whose splat footprint spills across the shared edge is drawn
on face A (clipped at the viewport edge) and culled on face B, so the spill is
missing on B's side of the edge. The result is a brightness step exactly along
face boundaries, only where aggregates contribute.

Second candidate, if the first does not reproduce: the per-face `frustumPlanes`
are built from the face projection, but any glow/spread margin sized from the
live camera's `fovYRad` or viewport (not the face's) under-estimates the
footprint at 90°.

## Investigation recipe

1. Fly into the band (`sgr-a-star-lens` perf scenario pose), toggle the
   star-aggregates layer: seams vanish with it ⇒ confirmed to this layer.
2. Pass `frustumPlanes = null` for capture draws only (`viewSlot !== 0`) —
   culling disabled: seams vanish ⇒ the cull radius is the cause.
3. Fix candidates, smallest first: add the angular floor to the aggregate
   `cullRadius` (the code's own suggestion); or pad the capture face frustum by
   the maximum aggregate splat angle; or skip the cull on capture faces
   outright (six 90° faces cover the sphere, so the cull saves little there).

## Related

- `docs/backlog/2026-09-02-lens-crossfade-duplicate-points.md` — different
  symptom (band ramp), same cubemap.
- Follow-up proposed in PR #657 discussion: freeze the cubemap to a one-shot
  capture on band entry. Independent of this seam, but the same capture code.
