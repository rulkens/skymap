# `MAX_PLANETS = 24` silently drops the tail

Deferred out of the analytic-sphere grill
([session](../grill-sessions/analytic-sphere-primitive-2026-07-28.md), Q4).

`planetRenderer` sizes its instance vertex buffer at `MAX_PLANETS` records
(`planetRenderer.ts:61,132-136`). Two clamps guard it: the layer packs
`Math.min(flat.length, MAX_PLANETS)` records (`planetsLayer.ts:122`) and `draw`
re-clamps `Math.min(Math.max(count, 0), MAX_PLANETS)` (`planetRenderer.ts:200`).

## The real bound today

`SCENE_PLANETS` holds 21 rows (`scenePlanets.ts:22-59`), and this layer draws only
the `flat` branch of `sceneBodyPartition` — the resolved bodies whose surface
texture is _not_ resident, with `textured` and `glints` taking the rest
(`sceneBodyPartition.ts:39-57`). So `flat.length ≤ 21 < 24` and the cap is
unreachable. The constant's own comment says as much and is accurate
(`planetRenderer.ts:58-60`).

Three bodies of headroom. Adding four more moons reaches it.

## What happens on overflow

The draw silently drops the tail — the last bodies in `flat` simply do not render.
Deliberate: `planetRenderer.ts:197-199` prefers a dropped tail to a GPU validation
error.

The asymmetry worth recording is that **the pick has no cap**.
`planetsLayer.drawPick` walks `[...flat, ...textured]` uncapped
(`planetsLayer.ts:190`), so an over-cap body would be invisible and still
clickable — an InfoCard for a body nothing drew.

`bodyPickRenderer` derives its own budget from this constant in prose:
`MAX_SPHERE_DRAWS = 64` is justified as "Earth (1) + planets (≤ `MAX_PLANETS` = 24)

- resolved scene-star spheres (≈ 25) ≈ 50" (`bodyPickRenderer.ts:139-147`). Raising
  one without the other leaves that comment wrong and the pick's own headroom
  overstated.

## What to do

Raise the cap and derive it, rather than re-picking a literal: `SCENE_PLANETS.length`
plus a stated headroom, so a new seed row cannot silently outgrow the buffer. Fix
the pick asymmetry in the same change — either cap `drawPick` to match, or (better)
drop both caps once the size is derived, since there is then nothing to overflow.

## Files

- `src/services/gpu/renderers/bodies/planetRenderer.ts:58-61,132-136,196-212` —
  the constant, the buffer, the clamp.
- `src/services/engine/frame/passes/planetsLayer.ts:76,122,190` — the staging
  array, the draw clamp, the uncapped pick walk.
- `src/data/bodies/scenePlanets.ts:22-59` — the 21-row roster.
- `src/services/gpu/renderers/bodies/bodyPickRenderer.ts:139-147` — the derived
  pick budget.
