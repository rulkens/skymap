/**
 * SurfaceTilePlannerParams — the slice of `cutSurfaceTiles`'s input the tile
 * subsystem owns, rather than the camera (camera state is frame-owned;
 * tile edge/bake depth are subsystem-owned). `null` rather than defaults is
 * the honest pre-manifest answer: no known bands, nothing to plan. The
 * product `cutSurfaceTiles` requests against these bands is `'albedo'`,
 * fixed inside that walk (Task 11 makes it two products) — not a field
 * here, since every consumer of this type wants the same one today.
 */

import type { SurfaceTileBand } from './SurfaceTileBand';

export type SurfaceTilePlannerParams = {
  /** Tile edge in pixels, from the manifest — also the atlas's slot edge. */
  readonly tilePx: number;
  /** Level the whole-globe base texture this session bound already
   *  delivers (`earthBaseLevelForTier`) — the planner's walk floor and
   *  what the engage gate compares `zWin` against. */
  readonly baseLevel: number;
  /** Geographic depth bands baked for the albedo product, each floored to
   *  one level finer than `baseLevel`. Replaces a single scalar
   *  `minTileLevel`/`maxTileLevel` range — several imagery sources can share
   *  a footprint at different depths (EOX deep tiles over BMNG). */
  readonly bands: readonly SurfaceTileBand[];
  /** Levels coarser than one texel per screen pixel the planner settles for;
   *  see `EARTH_TILE_LOD_BIAS`. */
  readonly lodBias: number;
};
