/**
 * EarthTilePlannerParams — the slice of `cutSurfaceTiles`'s input the tile
 * subsystem owns, rather than the camera (camera state is frame-owned;
 * kind/tile edge/bake depth are subsystem-owned). `null` rather than
 * defaults is the honest pre-manifest answer: no known bands, nothing to
 * plan.
 */

import type { EarthTileBand } from './EarthTileBand';
import type { EarthTileKind } from '../data/EarthTileKind';

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
  /** Levels coarser than one texel per screen pixel the planner settles for;
   *  see `EARTH_TILE_LOD_BIAS`. */
  readonly lodBias: number;
};
