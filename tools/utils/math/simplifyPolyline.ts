import type { Vec3 } from '../../../src/@types/math/Vec3';
import { pointSegmentDistance } from './pointSegmentDistance';

/**
 * Douglas–Peucker, worst span first: keeps the farthest dropped point of whichever span strays
 * most until every dropped point lies within `tolerance` or `maxPoints` are kept. Endpoints are
 * always kept and order preserved; deterministic (ties keep the earlier point).
 */
export function simplifyPolyline(
  points: readonly Readonly<Vec3>[],
  tolerance: number,
  maxPoints = Infinity,
): Vec3[] {
  const farthestIn = (from: number, to: number) => {
    let [at, dist] = [-1, -1];
    for (let i = from + 1; i < to; i++) {
      const d = pointSegmentDistance(points[i]!, points[from]!, points[to]!);
      if (d > dist) [at, dist] = [i, d];
    }
    return { from, to, at, dist };
  };
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const spans = [farthestIn(0, points.length - 1)];
  for (let kept = 2; kept < maxPoints; kept++) {
    const worst = spans.reduce((w, s) => (s.dist > w.dist ? s : w));
    if (worst.dist <= tolerance) break;
    keep[worst.at] = 1;
    spans.splice(
      spans.indexOf(worst),
      1,
      farthestIn(worst.from, worst.at),
      farthestIn(worst.at, worst.to),
    );
  }
  return points.filter((_, i) => keep[i] === 1).map((p) => [p[0], p[1], p[2]]);
}
