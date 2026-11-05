/**
 * sphereFitDistance — camera distance that fits a sphere of `radiusMpc`
 * inside the frustum at ANY aspect. A sphere is fully visible only where the
 * LIMITING half-angle clears it: `halfFov = atan(tan(fovYRad/2)·min(1,aspect))`
 * picks the horizontal axis in portrait (aspect < 1), vertical otherwise, and
 * `asin(R/d) ≤ halfFov ⇒ d = R / sin(halfFov)` — `sin`, not the flat-disc
 * `tan` the other framing helpers use, because a whole-sphere silhouette
 * subtends `asin`, not a flat disc's `atan`, of the frustum.
 */

import { clampDistance, MIN_DISTANCE_MPC } from './clampDistance';

/** Headroom past exact edge-to-edge fit, so the shell doesn't touch the frustum border. */
const FIT_MARGIN = 1.05;

/** `fovYRad` is the VERTICAL FOV in radians, `aspect` is width/height. */
export function sphereFitDistance(radiusMpc: number, fovYRad: number, aspect: number): number {
  const halfFov = Math.atan(Math.tan(fovYRad / 2) * Math.min(1, aspect));
  const raw = (radiusMpc / Math.sin(halfFov)) * FIT_MARGIN;
  return clampDistance(raw, MIN_DISTANCE_MPC);
}
