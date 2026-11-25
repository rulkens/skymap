import type { SurfaceTileProduct } from '../../format/@types/SurfaceTileProduct';
import type { SURFACE_TILE_LANE_SPECS } from '../../stream/data/surfaceTileLaneSpecs';

/**
 * StandaloneProduct — the products whose lane row says `role: 'standalone'`:
 * a leaf draws without them, so they never gate the cut. Derived from the rows,
 * so a new product must state its role before this type (and the cut) compile.
 */
export type StandaloneProduct = {
  [P in SurfaceTileProduct]: (typeof SURFACE_TILE_LANE_SPECS)[P]['role'] extends 'standalone'
    ? P
    : never;
}[SurfaceTileProduct];
