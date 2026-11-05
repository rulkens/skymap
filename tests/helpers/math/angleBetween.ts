import type { Vec3 } from '../../../src/@types/math/Vec3';
import { cross3 } from '../../../src/utils/math/cross3';

// atan2 of the cross over the dot: acos of a dot reads a one-ulp difference between
// parallel vectors as 1.5e-8 rad and anything smaller as exactly 0. Scale-invariant.
export function angleBetween(a: Readonly<Vec3>, b: Readonly<Vec3>): number {
  const c = cross3(a, b);
  return Math.atan2(Math.hypot(c[0], c[1], c[2]), a[0] * b[0] + a[1] * b[1] + a[2] * b[2]);
}
