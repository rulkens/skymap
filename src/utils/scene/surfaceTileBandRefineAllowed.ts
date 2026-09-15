import type { SurfaceTileBand } from '../../@types/scene/SurfaceTileBand';
import { surfaceTileBandOverlapsUv } from './surfaceTileBandOverlapsUv';

/**
 * surfaceTileBandRefineAllowed — true when some band overlapping this tile's uv
 * footprint bakes deeper than `z`. Checked per-band rather than against the
 * footprint's deepest overlapping band overall: the shipped ladder is
 * contiguous, but this stays correct for a gapped one too (e.g. a global
 * z3-7 band jumping straight to a regional z14-19 band with nothing between).
 */
export function surfaceTileBandRefineAllowed(
  bands: readonly SurfaceTileBand[],
  z: number,
  u0: number,
  u1: number,
  v0: number,
  v1: number,
): boolean {
  for (const band of bands) {
    if (z < band.max && surfaceTileBandOverlapsUv(band, u0, u1, v0, v1)) return true;
  }
  return false;
}
