import type { SurfaceTileBand } from '../../src/layers/body/surfaceTiles/format/@types/SurfaceTileBand';
import type { SurfaceTilePlannerParams } from '../../src/layers/body/surfaceTiles/plan/@types/SurfaceTilePlannerParams';
import { SURFACE_TILE_PRODUCTS } from '../../src/layers/body/surfaceTiles/format/data/surfaceTileProducts';

/** Every product requested over the same `bands`: hand-built planner inputs
 *  for fixtures whose bake covers each product alike. */
export function requestBandsOf(
  bands: readonly SurfaceTileBand[],
): SurfaceTilePlannerParams['requestBands'] {
  return Object.fromEntries(
    SURFACE_TILE_PRODUCTS.map((product) => [product, bands]),
  ) as SurfaceTilePlannerParams['requestBands'];
}
