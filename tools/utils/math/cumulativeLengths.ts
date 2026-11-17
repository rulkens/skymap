import type { Vec3 } from '../../../src/@types/math/Vec3';

/** Arc length from the first point to each point of a polyline; [0] = 0, last = total length. */
export function cumulativeLengths(points: readonly Readonly<Vec3>[]): number[] {
  const out = [0];
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1]!, points[i]!];
    out.push(out[i - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  }
  return out;
}
