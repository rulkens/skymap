/**
 * rulingLonLat — a view ray's longitude (from the frame's prime meridian, not
 * wrapped) and latitude in a ruling frame, degrees. A sky frame reads the ray
 * itself; a globe's reads the point where the ray meets it, and a ray that
 * misses the globe has no coordinate (null). `graticule.wesl`'s `frameLonLat`
 * is the GPU twin.
 */

import type { Vec2 } from '../../../@types/math/Vec2';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { AntiqueRulingFrame } from '../../../@types/rendering/AntiqueRulingFrame';
import { raySphereRoots } from '../../math/raySphereRoots';

const DEG = 180 / Math.PI;
const EYE: Vec3 = [0, 0, 0];

export function rulingLonLat(
  frame: Pick<AntiqueRulingFrame, 'axes' | 'lonOffsetDeg' | 'globeCentre'>,
  ray: Readonly<Vec3>,
): Vec2 | null {
  const len = Math.hypot(ray[0], ray[1], ray[2]);
  let d: Vec3 = [ray[0] / len, ray[1] / len, ray[2] / len];
  const c = frame.globeCentre;
  if (c !== null) {
    const roots = raySphereRoots(EYE, d, c, 1);
    if (roots === null || roots[0] <= 0) return null;
    const t = roots[0];
    d = [d[0] * t - c[0], d[1] * t - c[1], d[2] * t - c[2]];
  }
  const a = frame.axes;
  const x = d[0] * a[0] + d[1] * a[1] + d[2] * a[2];
  const y = d[0] * a[3] + d[1] * a[4] + d[2] * a[5];
  const z = d[0] * a[6] + d[1] * a[7] + d[2] * a[8];
  const lat = Math.asin(Math.max(-1, Math.min(1, z / Math.hypot(x, y, z)))) * DEG;
  return [Math.atan2(y, x) * DEG + frame.lonOffsetDeg, lat];
}
