/**
 * EarthTilePlannerParams — the slice of `planEarthTiles`' input that the tile
 * subsystem owns, rather than the camera.
 *
 * `planEarthTiles` takes two unrelated kinds of fact: where the camera is
 * (position, view-projection, viewport) and what the pyramid and the atlas are
 * (which kind, what tile edge, how deep it was baked, how wide the page-table
 * window is). The first belongs to the frame, the second to the subsystem, and
 * bundling the second into one value is what lets the drive site spread it
 * instead of reaching into the subsystem for four unrelated getters — and, more
 * to the point, what stops `windowSide` from being spelled once for the planner's
 * clip and again for the page-table texture's allocation.
 *
 * `null` from the accessor that produces this — rather than defaults — is the
 * honest answer before the manifest lands: there is no known deepest level, so
 * there is nothing to plan, and the feature sits in its identity case.
 */

import type { EarthTileKind } from '../data/EarthTileKind';

export type EarthTilePlannerParams = {
  readonly kind: EarthTileKind;
  /** Tile edge in pixels, from the manifest — also the atlas's slot edge. */
  readonly tilePx: number;
  /**
   * The level the whole-globe base texture THIS session bound already delivers —
   * a property of its tier, via `earthBaseLevelForTier`. The planner's walk
   * floor, and the level the engage gate compares `zWin` against. Distinct from
   * `minTileLevel` because "the base is already as good as the screen needs" and
   * "no tile file exists this shallow" are different facts about different
   * images; see `planEarthTiles`.
   */
  readonly baseLevel: number;
  /**
   * Shallowest level that may be requested: one finer than `baseLevel`, or the
   * shallowest level the manifest says was baked, whichever is deeper. Below the
   * first there is nothing to gain over the bound image; below the second there
   * is no file.
   */
  readonly minTileLevel: number;
  /** Deepest level the bake actually emitted for this kind. */
  readonly maxTileLevel: number;
  /** Page-table window edge, in tiles at the finest level. */
  readonly windowSide: number;
  /** Levels coarser than one texel per screen pixel the planner settles for;
   *  see `EARTH_TILE_LOD_BIAS`. */
  readonly lodBias: number;
};
