/**
 * EarthResidentTile — one atlas-resident tile, as `buildEarthPageTable`
 * needs it: which tile, which slot, how far into its load fade. Structured
 * entries rather than two path-keyed maps, so the callee needs no
 * `(z, x, y)` inversion.
 */

import type { EarthTileId } from '../data/EarthTileId';

export type EarthResidentTile = {
  readonly tile: EarthTileId;
  /** Index of the atlas slot holding this tile's bitmap. */
  readonly slot: number;
  /** Blend weight against the whole-globe base, 0..1 — the load fade. */
  readonly weight: number;
};
