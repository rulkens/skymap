import type { Vec3 } from '../../@types/math/Vec3';

/** rejectVec3 — the component of `v` perpendicular to unit vector `axis` (`v` minus its projection onto `axis`). */
export function rejectVec3(v: Readonly<Vec3>, axis: Readonly<Vec3>): Vec3 {
  const d = v[0] * axis[0] + v[1] * axis[1] + v[2] * axis[2];
  return [v[0] - axis[0] * d, v[1] - axis[1] * d, v[2] - axis[2] * d];
}
