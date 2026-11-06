/**
 * SurfaceTilePlannerParams — the slice of `cutSurfaceTiles`'s input the tile
 * subsystem owns, rather than the camera (camera state is frame-owned;
 * tile edge/bake depth are subsystem-owned). `null` rather than defaults is
 * the honest pre-manifest answer: no known bands, nothing to plan.
 */

import type { SurfaceTileBand } from '../../format/@types/SurfaceTileBand';
import type { SurfaceTileProduct } from '../../format/@types/SurfaceTileProduct';

export type SurfaceTilePlannerParams = {
  /** Tile edge in pixels, from the manifest — also the atlas's slot edge. */
  readonly tilePx: number;
  /** Level the whole-globe base texture this session bound already
   *  delivers (`baseLevelForTier`) — the planner's walk floor and
   *  what the engage gate compares `zWin` against. */
  readonly baseLevel: number;
  /** Geographic depth bands baked for both albedo and height, each floored
   *  to one level finer than `baseLevel`: what refinement reads. Several
   *  imagery sources can share a footprint at different depths (EOX deep
   *  tiles over BMNG). */
  readonly bands: readonly SurfaceTileBand[];
  /** Per product, the bands its tiles are requested over, floored as
   *  `bands` is: a tile outside its own product's bands has no file. */
  readonly requestBands: Readonly<Record<SurfaceTileProduct, readonly SurfaceTileBand[]>>;
  /** Levels coarser than one texel per screen pixel the planner settles for;
   *  see `SURFACE_TILE_LOD_BIAS`. */
  readonly lodBias: number;
};
