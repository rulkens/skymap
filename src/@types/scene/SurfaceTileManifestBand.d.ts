import type { LonLatBounds } from './LonLatBounds';
import type { SurfaceTileProvenance } from './SurfaceTileProvenance';
import type { SurfaceTileProduct } from '../data/SurfaceTileProduct';

/**
 * SurfaceTileManifestBand — one geographic depth band the bake wrote,
 * shared across products: several imagery sources can share a footprint at
 * different depths (EOX deep tiles over BMNG), and a band's albedo and
 * height tiles cover the SAME box at the SAME depth (they're baked from the
 * same tile-index walk) — one row per box, not one per product, is what
 * keeps that pairing structural rather than a convention two lists could
 * drift out of. `builtFrom` is `Partial`: a band whose height product isn't
 * baked yet (or ever) has no `height` entry.
 */
export type SurfaceTileManifestBand = {
  readonly bounds: LonLatBounds;
  readonly min: number;
  readonly max: number;
  readonly builtFrom: Partial<Record<SurfaceTileProduct, SurfaceTileProvenance>>;
};
