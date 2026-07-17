/**
 * clampVec3Length — shorten a vector to at most `maxLen` while preserving its
 * direction, returning the input reference untouched when it already fits.
 *
 * WHY direction-preserving (not per-component clamp): the near0 selection ring
 * needs to pull a camera-relative anchor inside the NEAR0 far plane WITHOUT
 * moving where it projects on screen. With the rebased view-projection (the eye
 * translation folded out), scaling a camera-space point by a scalar `s` scales
 * x, y, and z uniformly, so the projected NDC x/y — ratios of x,y against
 * w ∝ z — are IDENTICAL; only depth moves inward. A per-axis clamp would bend
 * the direction and slide the projection, which is exactly what must not happen.
 *
 * The unchanged-reference return for the common in-bounds case is deliberate:
 * callers on a per-frame hot path can cheaply skip a fresh allocation, and it
 * documents that the clamp is a no-op below the limit.
 */
import type { Vec3 } from '../../@types/math/Vec3';

export function clampVec3Length(v: Vec3, maxLen: number): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len <= maxLen) return v;
  const s = maxLen / len;
  return [v[0] * s, v[1] * s, v[2] * s];
}
