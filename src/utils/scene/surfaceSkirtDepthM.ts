import { SURFACE_TILE_SKIRT_DEPTH_FRACTION } from '../../data/bodies/earthTileParams';

/**
 * surfaceSkirtDepthM — how far a patch's skirt ring hangs inward, metres.
 * TWIN: the same expression in `earthSurfaceTile/vertex.wesl`.
 * The fraction term scales with the PATCH; `reliefSpanM` is the bound it was
 * missing (F2-R3 wanted the neighbour's geometric residual, which no patch can
 * read) — past it a skirt hides nothing an exposed edge won't then draw.
 */
export function surfaceSkirtDepthM(radiusM: number, dLatRad: number, reliefSpanM: number): number {
  return Math.min(SURFACE_TILE_SKIRT_DEPTH_FRACTION * radiusM * dLatRad, reliefSpanM);
}
