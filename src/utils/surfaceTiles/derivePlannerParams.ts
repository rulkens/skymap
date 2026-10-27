/**
 * derivePlannerParams — a fetched manifest plus the caller's base level as
 * `cutSurfaceTiles` inputs, or null for a bake this build cannot address:
 * every rejection degrades to base-only, cheaper to reason about than
 * silently adapting to wrong pixels. `tilePx` is a validated assertion: the
 * atlas's `slotsPerRow` is `SURFACE_TILE_ATLAS_SIDE / tilePx`, an identity
 * that holds only at the shipped 512 px edge.
 */

import type { SurfaceTileManifest } from '../../@types/scene/SurfaceTileManifest';
import type { SurfaceTileBand } from '../../@types/scene/SurfaceTileBand';
import type { SurfaceTilePlannerParams } from '../../@types/scene/SurfaceTilePlannerParams';
import { surfaceTileBandFromBounds } from './surfaceTileBandFromBounds';
import { SURFACE_TILE_LOD_BIAS, SURFACE_TILE_PX } from '../../data/bodies/surfaceTileParams';

export function derivePlannerParams(
  fetched: SurfaceTileManifest,
  baseLevel: number,
): SurfaceTilePlannerParams | null {
  if (fetched.bands.length === 0) return null;
  const tilePx = fetched.tilePx ?? SURFACE_TILE_PX;
  if (tilePx !== SURFACE_TILE_PX) return null;
  const bands: SurfaceTileBand[] = [];
  for (const band of fetched.bands) {
    // Not baked for the albedo product (e.g. a height-only row, once those
    // exist) — this planner only ever requests albedo tiles. Not baked for
    // height either: height inherits from the deepest resident ancestor
    // (R14), but a band missing its own height coverage would still 404
    // every height request in its range — wasted fetches that never land.
    if (band?.builtFrom?.albedo === undefined || band?.builtFrom?.height === undefined) continue;
    // A structurally-wrong manifest entry (missing/malformed `bounds`)
    // degrades by skipping it, matching this function's whole stance —
    // never throw over one bad band.
    if (typeof band?.bounds?.west !== 'number') continue;
    // Deeper of the band's own min and base+1: at/above base would
    // re-download detail the whole-globe base already delivers.
    const min = Math.max(band.min, baseLevel + 1);
    // A band clamped past its own depth at this base level bakes nothing usable.
    if (!(band.max >= min)) continue;
    bands.push(surfaceTileBandFromBounds(band.bounds, min, band.max));
  }
  if (bands.length === 0) return null;
  return {
    tilePx,
    baseLevel,
    bands,
    lodBias: SURFACE_TILE_LOD_BIAS,
  };
}
