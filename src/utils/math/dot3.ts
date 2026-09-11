import type { Vec3 } from '../../@types/math/Vec3';

export function dot3(a: Readonly<Vec3>, b: Readonly<Vec3>): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
