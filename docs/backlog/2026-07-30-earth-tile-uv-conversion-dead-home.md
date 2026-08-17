# Earth tile uv-conversion functions have no production caller

`needs-design`

## The problem

`earthTileXyForUv.ts` and `earthTileCentreUv.ts` are meant to be the single
home for the mesh-uv ⇔ tile-grid conversion and its north/south flip — both
files' own headers say so. In the shipped code neither function is called
from anywhere except each other's test. Every shipping site that needs the
same conversion re-derives it inline instead, so the anti-drift guarantee the
functions exist to provide does not actually hold anywhere.

**Verified: the "zero production callers" claim holds.** Grepping both
symbols across `src/` and `tests/` turns up only: their own definitions, one
docstring reference in `src/@types/data/EarthTileId.d.ts:11`, one comment
mention in `planEarthTiles.ts:273` ("the same asymmetry `earthTileXyForUv`
handles"), and the test files. No `import` of either function outside their
own test.

## Verified current state — six re-implementation sites

- **`src/utils/scene/planEarthTiles.ts:155-158`** — the per-tile loop computes
  `vNorth = 1 - y / rows` and `vSouth = 1 - (y + 1) / rows` inline: the same
  north/south flip `earthTileCentreUv` exists to encapsulate.
- **`src/utils/scene/planEarthTiles.ts:246-249`** — the window-origin
  computation derives uv from the camera direction with raw `atan2`/`asin`
  arithmetic: `Math.atan2(camDir[1], camDir[0]) / (2 * Math.PI) + 0.5`. That
  `+ 0.5` is a bare literal, not `TEXTURE_PRIME_MERIDIAN_U`
  (`src/data/bodies/texturePrimeMeridianU.ts`) — the constant every other
  site in the codebase reads this offset from. This is the forward
  direction-to-uv conversion, the inverse of `equirectUvToDirection`; no
  `directionToEquirectUv` exists for it to call instead.
- **`src/services/gpu/shaders/bodies/earth/fragment.wesl:234-238`** —
  `dirToEquirectUv` re-encodes the same direction-to-uv conversion, including
  its own copy of the `+ 0.5` prime-meridian offset. Its comment explains why
  it has to: WESL cannot import the TS constant. This is a legitimate
  second home in a different language, not a redundant one — but it is a
  second full derivation of the same formula, not a port of a shared one.
- **`src/services/gpu/shaders/bodies/earth/fragment.wesl:283-289`** — the
  tile lookup does `(1.0 - in.uv.y) * f32(cols >> 1u)`, the same "mesh v
  counts north, tile row 0 is north" flip a second time, this one on the
  tile-index side rather than the direction side.
- **`src/utils/scene/buildEarthPageTable.ts:115`** — the antimeridian wrap
  (`(((x0 + i - plan.winX0) % cols) + cols) % cols`) is its own copy of the
  same modulo arithmetic `planEarthTiles`'s window clip performs.
- **`tools/textures/buildEarthTiles.ts:119-130`** (`tileBox`) — computes each
  tile's lon/lat box directly (`north: 90 - y * latStep`), the bake-side
  version of the same y-to-latitude mapping. Its own module header claims
  the reconciliation "happens once, in the tile-index arithmetic
  (`earthTileXyForUv`)" (`tools/textures/buildEarthTiles.ts:22-23`) — but
  this file never imports `earthTileXyForUv`; it re-derives the mapping
  itself.

## The existing test can't catch this

`tests/utils/scene/earthTileXyForUv.test.ts` round-trips
`earthTileCentreUv` through `earthTileXyForUv` and back. Both functions can
be internally consistent with each other and the test stays green while
every one of the six sites above drifts from them, because none of the six
is under test through this path.

## Directions to explore (design decides)

- Make the home load-bearing: extract a `directionToEquirectUv` util (the
  inverse of `equirectUvToDirection`) for the direction-side sites, and have
  `planEarthTiles`, `buildEarthTiles`, and the page-table/wrap sites call the
  existing tile-index functions instead of re-deriving them.
- Or delete `earthTileXyForUv.ts` / `earthTileCentreUv.ts` and their test,
  and correct `buildEarthTiles.ts`'s header comment to stop citing a home
  that isn't one.
- `earthTexelMetres` is a different case and should not be swept into
  this — it is deliberately test-only, an independent second derivation of
  the pyramid's texel density used to cross-check the main formula, not a
  utility meant to be called from production.

## Related

`src/utils/scene/earthTileXyForUv.ts`, `earthTileCentreUv.ts`,
`src/utils/scene/planEarthTiles.ts`,
`src/utils/scene/buildEarthPageTable.ts`,
`src/services/gpu/shaders/bodies/earth/fragment.wesl`,
`tools/textures/buildEarthTiles.ts`.
