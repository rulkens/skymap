import type { Vec3 } from '../../@types/math/Vec3';
import type { Vec4 } from '../../@types/math/Vec4';
import { cross3 } from './cross3';

/**
 * rotateVec3ByQuat — rotate `v` by unit quaternion `q`, layout
 * `[x, y, z, w]`, identity `[0, 0, 0, 1]`. Uses the optimized form
 * `v + w*t + u×t` where `t = 2*(u×v)` — equivalent to `q v q⁻¹` without
 * building the conjugate.
 */
export function rotateVec3ByQuat(q: Readonly<Vec4>, v: Readonly<Vec3>): Vec3 {
  const u: Vec3 = [q[0], q[1], q[2]];
  const w = q[3];
  const uv = cross3(u, v);
  const t: Vec3 = [2 * uv[0], 2 * uv[1], 2 * uv[2]];
  const ut = cross3(u, t);
  return [v[0] + w * t[0] + ut[0], v[1] + w * t[1] + ut[1], v[2] + w * t[2] + ut[2]];
}
