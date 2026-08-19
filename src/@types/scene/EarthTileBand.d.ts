/**
 * One geographic band of the pyramid: a manifest `LonLatBounds` entry
 * converted to uv once (outside the per-frame walk) plus the depth range it
 * bakes. `uBounds`/`vBounds` follow the mesh's south-first `v` convention —
 * see `derivePlannerParams`'s conversion and `buildEarthTiles.ts`'s `tileBox`
 * for the inverse direction of the same mapping.
 */
export type EarthTileBand = {
  readonly uBounds: readonly [number, number];
  readonly vBounds: readonly [number, number];
  readonly min: number;
  readonly max: number;
};
