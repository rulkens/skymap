/**
 * zoomedDistance — apply a wheel/pinch zoom factor as a step in ALTITUDE above
 * a pivot's surface, not in raw distance from its centre.
 *
 * ### Why proportional-in-distance breaks on final approach
 *
 * Every zoom site scales `cam.distance` — the distance to the orbit TARGET —
 * by a constant factor per notch (`Math.exp(deltaY * 0.001)`, ~10%). That is
 * the right feel in deep space, where "distance to target" and "distance to
 * whatever's onscreen" are the same thing. But when the target is a focused
 * body, `distance` is measured to its CENTRE, and near the surface that
 * distance is dominated by the body's own radius: at Earth, `distance` ≈
 * 1 Earth radius ≈ 6371 km, so a 10% notch is ~637 km — several times the
 * entire usable altitude band between the standoff floor (2% of a radius,
 * `SURFACE_STANDOFF_RADII`) and a comfortable orbital view. One notch jumps
 * from a wide establishing view straight onto the clamp, with nothing in
 * between: there is no final approach, only a slam.
 *
 * ### The fix: geometric steps in altitude, not distance
 *
 * Let `h = distance - pivotRadiusMpc` (altitude above the surface). Scale `h`
 * by `factor` instead of scaling `distance` directly, then add the radius
 * back: `distance' = pivotRadiusMpc + h * factor`. As `h → 0` the steps shrink
 * without bound — an asymptotic approach that slows the closer you get, which
 * is the Google Earth model — and the standoff floor becomes a backstop the
 * taper approaches rather than a wall it hits at speed. The same geometric
 * shrinkage runs in reverse on the way out, for free.
 *
 * Crucially, this is NOT a behaviour change away from a surface: for
 * `h >> pivotRadiusMpc` (every astronomical viewing distance — a galaxy seen
 * from Mpc away, a star system from AU away), `pivotRadiusMpc + h * factor ≈
 * h * factor ≈ distance * factor`, so deep-space zoom feel is unchanged to
 * within floating-point tolerance. The taper only engages in the last few
 * radii of approach, which is exactly where the old model felt wrong.
 *
 * `pivotRadiusMpc === null` means the pivot has no surface to taper against
 * (empty space, a galaxy, a structure, the Milky Way — see `clampDistance`'s
 * docstring for why those stay unfloored), so this degenerates to the
 * original proportional-in-distance model exactly, not approximately.
 *
 * `clampDistance` is called from inside here, not by the caller, so the
 * envelope stays enforced in exactly one place regardless of which arithmetic
 * produced the candidate distance.
 */

import { clampDistance } from './clampDistance';

export function zoomedDistance(
  distance: number,
  factor: number,
  pivotRadiusMpc: number | null,
): number {
  if (pivotRadiusMpc === null) {
    return clampDistance(distance * factor, null);
  }

  const h = distance - pivotRadiusMpc;
  if (h <= 0) {
    // The camera is already at or inside the pivot's surface — a state
    // `clampDistance` exists to prevent, so it should never actually reach
    // here. Fall back to the plain proportional model rather than invent
    // altitude semantics (e.g. a negative or zero altitude scaled
    // geometrically has no sensible taper) for a state that should not occur.
    return clampDistance(distance * factor, pivotRadiusMpc);
  }

  return clampDistance(pivotRadiusMpc + h * factor, pivotRadiusMpc);
}
