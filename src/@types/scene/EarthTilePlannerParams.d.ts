/**
 * EarthTilePlannerParams — the slice of `planEarthTiles`' input the tile
 * subsystem owns, rather than the camera (camera state is frame-owned;
 * kind/tile edge/bake depth/window width are subsystem-owned). Bundling
 * them stops `windowSide` being spelled once for the clip and again for
 * the page-table allocation. `null` rather than defaults is the honest
 * pre-manifest answer: no known bands, nothing to plan.
 */

import type { EarthTileKind } from '../data/EarthTileKind';

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

export type EarthTilePlannerParams = {
  readonly kind: EarthTileKind;
  /** Tile edge in pixels, from the manifest — also the atlas's slot edge. */
  readonly tilePx: number;
  /** Level the whole-globe base texture this session bound already
   *  delivers (`earthBaseLevelForTier`) — the planner's walk floor and
   *  what the engage gate compares `zWin` against. */
  readonly baseLevel: number;
  /** Geographic depth bands this kind bakes, each floored to one level finer
   *  than `baseLevel`. Replaces a single scalar `minTileLevel`/`maxTileLevel`
   *  range — several imagery sources can share a kind at different footprints
   *  and depths (EOX deep tiles over BMNG). */
  readonly bands: readonly EarthTileBand[];
  /** Page-table window edge, in tiles at the finest level. */
  readonly windowSide: number;
  /** Levels coarser than one texel per screen pixel the planner settles for;
   *  see `EARTH_TILE_LOD_BIAS`. */
  readonly lodBias: number;
};
