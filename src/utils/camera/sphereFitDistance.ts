/**
 * sphereFitDistance — camera distance that fits a sphere of `radiusMpc`
 * inside the framing window at ANY shape. A sphere is fully visible only where
 * the LIMITING half-angle clears it: `halfFov = atan(min(tanHalfX, tanHalfY))`
 * picks the horizontal axis in portrait, vertical otherwise, and
 * `asin(R/d) ≤ halfFov ⇒ d = R / sin(halfFov)` — `sin`, not the flat-disc
 * `tan` the other framing helpers use, because a whole-sphere silhouette
 * subtends `asin`, not a flat disc's `atan`, of the frustum.
 */

import type { FramingWindow } from '../../@types/camera/FramingWindow';
import { clampDistance, MIN_DISTANCE_MPC } from './clampDistance';

/** Headroom past exact edge-to-edge fit, so the shell doesn't touch the frustum border. */
const FIT_MARGIN = 1.05;

export function sphereFitDistance(radiusMpc: number, framing: FramingWindow): number {
  const halfFov = Math.atan(Math.min(framing.tanHalfX, framing.tanHalfY));
  const raw = (radiusMpc / Math.sin(halfFov)) * FIT_MARGIN;
  return clampDistance(raw, MIN_DISTANCE_MPC);
}
