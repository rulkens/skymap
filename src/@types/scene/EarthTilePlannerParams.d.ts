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
  /** Shallowest level worth requesting: below it the whole-globe base is already as good. */
  readonly minLevel: number;
  /** Deepest level the bake actually emitted for this kind. */
  readonly maxLevel: number;
  /** Page-table window edge, in tiles at the finest level. */
  readonly windowSide: number;
};
