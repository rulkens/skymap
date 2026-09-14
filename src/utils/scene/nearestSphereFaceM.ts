/**
 * nearestSphereFaceM — the smallest eye-to-surface distance over a set of
 * spheres in one frame, metres; `Infinity` for an empty set so a caller's
 * `Math.min` against it is the identity. Negative when the eye is inside one.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import type { HostFrameSphere } from '../../@types/scene/HostFrameSphere';
import { distance3 } from '../math/distance3';

export function nearestSphereFaceM(
  eyeM: Readonly<Vec3>,
  spheres: readonly HostFrameSphere[],
): number {
  let nearest = Infinity;
  for (const s of spheres) nearest = Math.min(nearest, distance3(s.posM, eyeM) - s.radiusM);
  return nearest;
}
