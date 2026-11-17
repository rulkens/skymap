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
  // Albedo and height need BOTH baked: height inherits from the deepest
  // resident ancestor (R14), but a band missing its own height coverage would
  // still 404 every height request in its range — wasted fetches that never land.
  const bands = bandsWhere(
    (band) => band?.builtFrom?.albedo !== undefined && band?.builtFrom?.height !== undefined,
  );
  if (bands.length === 0) return null;
  return {
    tilePx,
    baseLevel,
    bands,
    // Night stands alone: a leaf with no night tile still draws (the global
    // night texture shows through), so nothing else gates its requests.
    requestBands: {
      albedo: bands,
      height: bands,
      night: bandsWhere((band) => band?.builtFrom?.night !== undefined),
    },
    lodBias: SURFACE_TILE_LOD_BIAS,
  };
}
