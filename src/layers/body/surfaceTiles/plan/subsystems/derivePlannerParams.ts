/**
 * derivePlannerParams — a fetched manifest plus the caller's base level as
 * `cutSurfaceTiles` inputs, or null for a bake this build cannot address:
 * every rejection degrades to base-only, cheaper to reason about than
 * silently adapting to wrong pixels. `tilePx` is a validated assertion: the
 * atlas slot edges are fixed in `SURFACE_TILE_LANE_SPECS`, so a bake at any
 * other edge than `SURFACE_TILE_PX` would not fit its slots.
 */

import type { SurfaceTileManifest } from '../../format/@types/SurfaceTileManifest';
import type { SurfaceTileBand } from '../../format/@types/SurfaceTileBand';
import type { SurfaceTileManifestBand } from '../../format/@types/SurfaceTileManifestBand';
import type { SurfaceTilePlannerParams } from '../@types/SurfaceTilePlannerParams';
import type { SurfaceTileProduct } from '../../format/@types/SurfaceTileProduct';
import { SURFACE_TILE_PRODUCTS } from '../../format/data/surfaceTileProducts';
import { SURFACE_TILE_LANE_SPECS } from '../../stream/data/surfaceTileLaneSpecs';
import { surfaceTileBandFromBounds } from '../../format/utils/surfaceTileBandFromBounds';
import { SURFACE_TILE_LOD_BIAS, SURFACE_TILE_PX } from '../../format/data/surfaceTileParams';

export function derivePlannerParams(
  fetched: SurfaceTileManifest,
  baseLevel: number,
): SurfaceTilePlannerParams | null {
  if (fetched.bands.length === 0) return null;
  const tilePx = fetched.tilePx ?? SURFACE_TILE_PX;
  if (tilePx !== SURFACE_TILE_PX) return null;
  const bandsWhere = (built: (band: SurfaceTileManifestBand) => boolean): SurfaceTileBand[] => {
    const kept: SurfaceTileBand[] = [];
    for (const band of fetched.bands) {
      if (!built(band)) continue;
      // A structurally-wrong manifest entry (missing/malformed `bounds`)
      // degrades by skipping it, matching this function's whole stance —
      // never throw over one bad band.
      if (typeof band?.bounds?.west !== 'number') continue;
      // Deeper of the band's own min and base+1: at/above base would
      // re-download detail the whole-globe base already delivers.
      const min = Math.max(band.min, baseLevel + 1);
      // A band clamped past its own depth at this base level bakes nothing usable.
      if (!(band.max >= min)) continue;
      kept.push(surfaceTileBandFromBounds(band.bounds, min, band.max));
    }
    return kept;
  };
  // Gating products need ALL baked: height inherits from the deepest resident
  // ancestor (R14), but a band missing its own height coverage would still 404
  // every height request in its range — wasted fetches that never land.
  const bands = bandsWhere((band) =>
    SURFACE_TILE_PRODUCTS.every(
      (product) =>
        SURFACE_TILE_LANE_SPECS[product].role !== 'gates-cut' ||
        band?.builtFrom?.[product] !== undefined,
    ),
  );
  if (bands.length === 0) return null;
  // A standalone product gates nothing (a leaf with no night tile still draws, the
  // global night texture shows through), so only its own bake limits its requests.
  const requestBands = Object.fromEntries(
    SURFACE_TILE_PRODUCTS.map((product) => [
      product,
      SURFACE_TILE_LANE_SPECS[product].role === 'gates-cut'
        ? bands
        : bandsWhere((band) => band?.builtFrom?.[product] !== undefined),
    ]),
  ) as Record<SurfaceTileProduct, SurfaceTileBand[]>;
  return {
    tilePx,
    baseLevel,
    bands,
    requestBands,
    lodBias: SURFACE_TILE_LOD_BIAS,
  };
}
