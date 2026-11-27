import type { SurfaceTileBand } from '../../format/@types/SurfaceTileBand';

/** The deepest level any of `bands` bakes; -1 with none, which `resolveStandaloneRect` reads as
 *  "this product has no bands". */
export function deepestBandMax(bands: readonly SurfaceTileBand[]): number {
  let max = -1;
  for (const band of bands) if (band.max > max) max = band.max;
  return max;
}
