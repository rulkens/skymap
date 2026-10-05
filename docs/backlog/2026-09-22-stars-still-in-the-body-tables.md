# Seeded stars still live in the body tables

`needs-design` · Engine & State · filed 2026-09-22, out of the starCatalog Layer PR 2

## What it is

The starCatalog Layer (spec `2026-09-21-star-catalog-layer-design.md`) moved
the seeded stars' drawing, captions, selection and identity onto the star
Layer — but `SCENE_BODIES` (`src/data/bodies/sceneBodies.ts`) still lists them.

The **reader half is resolved** (blackHoles PR 1): the camera's geometry now
rides `SelectionRow.driver` (`src/@types/engine/camera/DriverGeometry.d.ts`),
which each arm's own `extractRow` fills, so the star arm answers for its own
photosphere and no focus-generic reader resolves a focus id against
`SCENE_BODIES` any more (`focusDriverId.ts` is deleted). What remains of that
half is `bodyHomePose`, `watchFlyToLonLatSaga` and `bodyRung`, which take a
*body id* by contract (go-home, fly-to-lon/lat, surface rung) and are body-domain
callers, not focus-generic ones.

So the listing itself is what is left: seeded stars are in `SCENE_BODIES`
because the palette rows, the pick tables and the occluder seam read that one
registry.

`ORBIT_REACH_BY_REGION` (`src/data/bodies/orbitReachByRegion.ts`) is the other
half: it is computed from the static non-mesh `ORBITAL_ELEMENTS` table rather
than from `state.orbitTrailRows` (the composed roster core + every Layer's
`guides.orbitTrails` feed), so the galactic-centre region's reach does not
follow a Layer that changes its trail roster.

## Why not fixed now

Both resolve when the body Layer forms (`docs/layers/README.md`'s remaining
`body`/`milkyWay`/`structure`/`volume` list): body's ground prep composes
positions at boot the same way the star Layer's rows already do, and at that
point `SCENE_BODIES`/`ORBIT_REACH_BY_REGION` become the body Layer's own
roster-derived facts rather than a core static table unrelated call sites
`findByIdOrThrow` into. Doing it piecemeal now — for stars only — would grow a
second half-migrated table beside the one this feature just cleaned up.
