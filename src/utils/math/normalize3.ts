import type { Vec3 } from '../../@types/math/Vec3';

/** normalize3 — unit vector along `v`; falls back to `v` unchanged if it is the zero vector. */
export function normalize3(v: Readonly<Vec3>): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}
