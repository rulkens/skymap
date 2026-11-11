import { SURFACE_TILE_CROSSFADE_MS } from '../../format/data/surfaceTileParams';
import type { ResolvedTileResidency } from '../../stream/@types/ResolvedTileResidency';

/**
 * surfaceTileFadeWeight — how far a leaf's albedo has faded in over its coarser
 * fallback, 0..1; 1 with no fallback to fade from. The renderer draws with it and
 * the planner keeps the loop awake while any leaf is below 1.
 */
export function surfaceTileFadeWeight(
  albedo: Pick<ResolvedTileResidency, 'fallback' | 'readyAtMs'>,
  nowMs: number,
): number {
  if (albedo.fallback === null) return 1;
  return Math.min(1, Math.max(0, (nowMs - albedo.readyAtMs) / SURFACE_TILE_CROSSFADE_MS));
}
