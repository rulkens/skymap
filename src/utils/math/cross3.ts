import type { Vec3 } from '../../@types/math/Vec3';

/** cross3 — the 3D cross product a x b. */
export function cross3(a: Readonly<Vec3>, b: Readonly<Vec3>): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
