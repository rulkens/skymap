/**
 * zoomedDistance — apply a wheel/pinch zoom factor as a step in ALTITUDE above
 * a pivot's surface, not in raw distance from its centre.
 *
 * Scaling `cam.distance` (to the orbit TARGET) by a constant factor per notch
 * is right in deep space, but a focused body's target is its CENTRE, so near
 * the surface `distance` is dominated by the body's own radius — a 10% notch
 * at Earth is ~637 km, several times the whole usable altitude band above the
 * standoff floor (`SURFACE_STANDOFF_RADII`).
 *
 * The fix scales ALTITUDE geometrically instead: with `h = distance -
 * pivotRadiusMpc`, `distance' = pivotRadiusMpc + h * factor`. As `h → 0` the
 * steps shrink without bound (the Google Earth model). For `h >>
 * pivotRadiusMpc` (every astronomical viewing distance) this degenerates to
 * the old model exactly — `pivotRadiusMpc + h * factor ≈ distance * factor` —
 * so deep-space feel is unchanged and the taper only engages on final
 * approach. `pivotRadiusMpc === null` (no surface — empty space, a galaxy, a
 * structure, the Milky Way) degenerates to it exactly too.
 *
 * `clampDistance` is called from inside here, not by the caller, so the
 * envelope stays enforced in exactly one place.
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
    // Degenerate: `clampDistance` should prevent the camera reaching the
    // surface at all. Fall back to plain proportional scaling rather than
    // invent a geometric taper for a zero/negative altitude.
    return clampDistance(distance * factor, pivotRadiusMpc);
  }

  return clampDistance(pivotRadiusMpc + h * factor, pivotRadiusMpc);
}
