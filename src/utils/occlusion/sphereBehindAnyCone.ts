/**
 * sphereBehindAnyCone — whether a sphere at eye-relative (x, y, z), `distance` away, lies
 * wholly behind some `occluderConesFrom` body: entirely farther than the body, and its
 * angular disc (half-angle α, sin α = radius / distance) inside the body's (θ):
 * angle to the axis ≤ θ − α, compared as cosines.
 */

import { OCCLUDER_CONE_FLOATS } from '../../data/occlusion/occluderConeFloats';

export function sphereBehindAnyCone(
  cones: Float64Array,
  x: number,
  y: number,
  z: number,
  distance: number,
  radius: number,
): boolean {
  const sinAlpha = radius / distance;
  if (sinAlpha >= 1) return false;
  const cosAlpha = Math.sqrt(1 - sinAlpha * sinAlpha);
  for (let c = 0; c < cones.length; c += OCCLUDER_CONE_FLOATS) {
    const cosTheta = cones[c + 3]!;
    const sinTheta = cones[c + 4]!;
    if (distance - radius <= cones[c + 5]! || sinAlpha > sinTheta) continue;
    const cosToAxis = (x * cones[c]! + y * cones[c + 1]! + z * cones[c + 2]!) / distance;
    if (cosToAxis >= cosTheta * cosAlpha + sinTheta * sinAlpha) return true;
  }
  return false;
}
