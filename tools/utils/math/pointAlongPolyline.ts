import type { Vec3 } from '../../../src/@types/math/Vec3';

/**
 * The point at arc length `s` of a polyline (`cumulative` from `cumulativeLengths`), with the
 * index of the segment it lies on; `s` outside [0, total] clamps to the ends.
 */
export function pointAlongPolyline(
  points: readonly Readonly<Vec3>[],
  cumulative: readonly number[],
  s: number,
): { point: Vec3; segment: number } {
  let lo = 0;
  let hi = points.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cumulative[mid]! <= s) lo = mid;
    else hi = mid - 1;
  }
  const [a, b] = [points[lo]!, points[lo + 1]!];
  const span = cumulative[lo + 1]! - cumulative[lo]!;
  const f = span > 0 ? Math.min(1, Math.max(0, (s - cumulative[lo]!) / span)) : 0;
  return {
    point: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f],
    segment: lo,
  };
}
