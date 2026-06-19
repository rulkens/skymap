/**
 * galaxyInfoBuilder — pure helpers for turning raw catalog arrays into values
 * the React layer can render.
 *
 * Two pure utilities live here:
 *
 *   - `maxAbsCoord(cloud)` — bounding-box heuristic used at startup to frame
 *     the camera around whichever cloud loaded.
 *   - `niceRound(x)` — axis-ticker style "round down to {1,2,5}×10^k" used by
 *     the scale-bar legend.
 *
 * The third resident, `buildGalaxyInfo`, has moved to `./buildGalaxyInfo` and
 * is re-exported from here so all existing importers continue to resolve
 * without churn.
 */

import type { GalaxyCatalog } from '../../../@types/data/galaxyCatalog/GalaxyCatalog';

export { buildGalaxyInfo } from './buildGalaxyInfo';

/**
 * Return the maximum absolute value of any coordinate component in the cloud's
 * positions array.
 *
 * We use *max abs of any component* rather than computing a true bounding
 * radius (which would require a sqrt per point). For camera-distance purposes
 * this is a heuristic — slightly over-estimating is harmless — and avoiding
 * sqrt keeps this O(N) scan as cheap as possible.
 *
 * The result is used to auto-frame the camera so any cloud (real SDSS or
 * synthetic sphere) is comfortably visible regardless of its spatial extent.
 */
export function maxAbsCoord(cloud: GalaxyCatalog): number {
  let m = 0;
  for (let i = 0; i < cloud.positions.length; i++) {
    const v = Math.abs(cloud.positions[i]!);
    if (v > m) m = v;
  }
  return m;
}

/**
 * Round `x` down to the nearest "nice" number from the {1, 2, 5} × 10^k family.
 *
 * This is the same rounding scheme used by axis tickers in plotting libraries
 * (matplotlib's MaxNLocator, d3's ticks(), etc.). Given any positive real, it
 * returns the largest "round" value ≤ x where round means the mantissa is one
 * of 1, 2, or 5. Examples:
 *
 *     niceRound(  3.7) →   2     (3.7 → mantissa 3.7 → rounds down to 2)
 *     niceRound( 47)   →  20     (47 → 4.7 × 10¹ → 2 × 10¹)
 *     niceRound(800)   → 500     (800 → 8 × 10² → 5 × 10²)
 *     niceRound(  0.07)→   0.05  (0.07 → 7 × 10⁻² → 5 × 10⁻²)
 *
 * Why floor (not nearest)? For a scale bar we want the *bar to fit inside* the
 * desired pixel target, never overflow it. Rounding down to the nice value
 * below the target guarantees the rendered bar is ≤ targetPx.
 */
export function niceRound(x: number): number {
  if (x <= 0) return 0;
  const exp = Math.floor(Math.log10(x));
  const power = Math.pow(10, exp);
  const mantissa = x / power; // ∈ [1, 10)
  const niceMantissa = mantissa >= 5 ? 5 : mantissa >= 2 ? 2 : 1;
  return niceMantissa * power;
}
