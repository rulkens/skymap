# Analytic sphere occluders ignore terrain (trails, atmosphere)

> **Owned elsewhere.** The user, 2026-09-18: proper occlusion "is being fixed
> somewhere else", and the same fault shows up between the atmosphere and
> mountains. WHICH effort owns it is not recorded here — ask before picking this
> up, and delete this file rather than duplicating the work. Kept only because
> the root cause below was traced from scratch and is worth not re-deriving.

Surfaced 2026-09-18 during the F3c eye-check, at the Dead Sea pose. Trails that
should be hidden behind the ground in front of them are drawn over it.

## Verified current state

Trail occlusion is analytic, not depth-tested: `orbitTrail/fragment.wesl:36`
`sphereClearance` attenuates the eye→point segment against up to `MAX_OCCLUDERS`
eye-relative spheres, filled by `selectOccluderSpheresKm.ts` from
`sceneOccluderBodies.ts`.

Every body contributes **one sphere at `innerBoundRadiusM(body.surface)`**
(`sceneOccluderBodies.ts:44`, `:50`, `:65`, `:75`), which is
`datumRadiusM + reliefM[0]` — the relief FLOOR. For Earth that is
`6_371_000 + (-430)` = 6,370,570 m.

That radius is deliberate: `innerBoundRadiusM.ts` says "an occluder must
under-occlude: never hide what a valley leaves visible." Correct while the
planet was drawn as a sphere. Now that terrain is drawn, every piece of ground
above the relief floor — i.e. essentially all land — sits OUTSIDE the occluder
and stops occluding anything.

## Why the Dead Sea shows it worst

It is the pose with the biggest gap between the relief floor and the nearby
ground: the shore is at −430 m, so the occluder sphere passes exactly through
the water, while the hills a few km away stand ~1 km above it. A trail behind
those hills is well clear of the sphere and draws straight through them.

## Options

1. **Terrain-aware occludee.** This is spec §8's horizon-cap occludee, held OUT
   of F3c scope by the 2026-09-16 ruling. The honest fix, and the largest.
2. **Depth-test the trails against the surface-tile depth buffer** instead of
   the analytic sphere, where the tiles have already drawn. Removes a whole
   approximation rather than tuning it; needs the trails moved into a pass that
   has the foreground depth attachment, and still needs the analytic path for
   bodies with no tiles.
3. **Raise the occluder radius toward the ground under the eye.** Cheapest, but
   it inverts the under-occlude invariant — it would start hiding trails a
   valley genuinely leaves visible. Probably worse than the bug.

Option 2 looks strongest; it is the same "stop approximating, use the depth we
already have" move that fixed the pick marker's burial. Needs design — note
`CONTENT_PASSES` order and the inside-atmosphere shell's depth-blindness
landmine (#698) before moving a pass.

## Not to be confused with

`backlog/2026-07-18-orbit-trail-residual-speckle.md` (edge-on dashing) and
`project_orbit_trail_occlusion` (#682, which built the analytic sphere path
this item now finds insufficient).
