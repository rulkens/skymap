/**
 * EarthResidentTile — one atlas-resident tile, as `buildEarthPageTable` needs
 * it: which tile, which slot it occupies, how far into its load fade.
 *
 * All three facts are already owned, together, by whoever manages the atlas —
 * an allocation writes a slot for a tile, and a fade tracks a weight for that
 * same tile. Passing them as one list of structured entries lets the page
 * table read what its caller already has; the alternative, two maps keyed by
 * a formatted tile path, would force the caller to format a key it has no
 * other use for and the callee to invert that same string back into
 * `(z, x, y)` to do its work. A structured id needs no inversion.
 */

import type { EarthTileId } from '../data/EarthTileId';

export type EarthResidentTile = {
  readonly tile: EarthTileId;
  /** Index of the atlas slot holding this tile's bitmap. */
  readonly slot: number;
  /** Blend weight against the whole-globe base, 0..1 — the load fade. */
  readonly weight: number;
};
