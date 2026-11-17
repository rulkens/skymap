import type { Vec3 } from '../../../src/@types/math/Vec3';

/** The centroid of a set of points; NaN for none. */
export function meanPoint3(points: readonly Readonly<Vec3>[]): Vec3 {
  const sum = points.reduce<Vec3>((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]);
  return [sum[0] / points.length, sum[1] / points.length, sum[2] / points.length];
}
