# Seeded stars still live in the body tables

`needs-design` · Engine & State · filed 2026-09-22, out of the starCatalog Layer PR 2

## What it is

The starCatalog Layer (spec `2026-09-21-star-catalog-layer-design.md`) moved
the seeded stars' drawing, captions, selection and identity onto the star
Layer — but `SCENE_BODIES` (`src/data/bodies/sceneBodies.ts`) still lists
them, because a handful of camera/occluder readers resolve a focus id through
it via `findByIdOrThrow`:

- `cameraDrivers.ts:166`
- `bodyHomePose.ts:77`
- `selectionHaloTable.ts:101`
- `focusFraming.ts:109`
- `approachTiltedPose.ts:48`
- `watchFlyToLonLatSaga.ts:73`

Each reads a body's footprint radius off `SCENE_BODIES` for a row `focusDriverId`
(`src/utils/camera/focusDriverId.ts`) named — and a seeded star's driver id is
its own id, so these six sites still need a star answer.

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
roster-derived facts rather than a core static table six unrelated call sites
`findByIdOrThrow` into. Doing it piecemeal now — for stars only — would grow a
second half-migrated table beside the one this feature just cleaned up.
