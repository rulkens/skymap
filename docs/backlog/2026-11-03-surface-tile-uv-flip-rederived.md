# Surface-tile uv flip is re-derived inline

`needs-design`

## The problem

The mesh uv and the tile grid disagree on direction: the mesh's `v` counts north from -90 (`cubeSphereMesh`
bakes `v = lat / π + 0.5`), tile row 0 is the NORTH edge, and `u` carries a `+ 0.5` prime-meridian offset
(`TEXTURE_PRIME_MERIDIAN_U`). `surfaceTileXyForUv`
(`src/layers/body/surfaceTiles/format/utils/surfaceTileXyForUv.ts`) is the one function that reconciles tile
index and uv, and it has production callers. Its twin `surfaceTileCentreUv` had none and was deleted in #1023.
The same flip and offset are still spelled out at the sites below, so a convention change has to find every one.

## Sites that still hold (re-traced 2026-11-03)

- `src/layers/body/surfaceTiles/plan/subsystems/cutSurfaceTiles.ts:137-138`, per-tile `vNorth = 1 - y / rows`,
  `vSouth = 1 - (y + 1) / rows`; and `:338-339`, the same flip as `v0`/`v1` for the band-refine check.
- `src/layers/body/surfaceTiles/stream/subsystems/terrainHeightM.ts:40-55`, the forward direction to uv
  (`atan2`/`asin`, with the constant for `+ 0.5`), then `rowFrac = (1 - v) * rows - y` beside the
  `surfaceTileXyForUv` call. Its own comment says the flip lives in that shared `1 - v`.
- `tools/utils/textures/siteTerrain/tilePostAtLatLon.ts:16-26`, the same lat/lon to uv, `surfaceTileXyForUv` call
  and `rowFrac` copy, so the two copies must agree post for post.
- `src/services/gpu/shaders/bodies/earth/fragment.wesl:88-92` and
  `src/services/gpu/shaders/bodies/surfaceTile/fragmentEarth.wesl:33-37`, `dirToEquirectUv` twice, each with a bare
  `+ 0.5` (WESL cannot import the TS constant; the second is a copy of the first).
- `tools/utils/scene/surfaceTileBounds.ts:14-17`, the bake side of the row to latitude mapping
  (`north: 90 - y * latStep`), which does not go through `surfaceTileXyForUv`.

## Dropped from the old list

The window-origin `atan2` in the cut planner, the page-table antimeridian wrap, and the shader's
`(1.0 - in.uv.y)` tile lookup no longer exist (the page table and that lookup are gone from the current code).

## Directions to explore (design decides)

- Extract a `directionToEquirectUv` util (the inverse of `equirectUvToDirection`) and have `terrainHeightM` and
  `tilePostAtLatLon` call it, taking the prime-meridian constant from one place.
- Route the callers through `surfaceTileXyForUv` or a sibling that also returns the fractional remainder
  (`colFrac`/`rowFrac`), so `terrainHeightM` and `tilePostAtLatLon` stop carrying a copy each.
- The cut planner's `vNorth`/`vSouth` and `surfaceTileBounds` could share a row to v/latitude helper next to
  `surfaceTileXyForUv`.
- The two WESL copies cannot import TS; keep one WESL `lib/` function for both and pin its `+ 0.5` with a parity test
  against the TS constant.
