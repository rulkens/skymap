import type { Vec3 } from '../../../src/@types/math/Vec3';
import { pointSegmentDistance } from './pointSegmentDistance';

/** The farthest any of `points` lies from the polyline `line` (a lone point counts as one). */
export function maxDistanceToPolyline(
  points: readonly Readonly<Vec3>[],
  line: readonly Readonly<Vec3>[],
): number {
  return points.reduce((worst, p) => {
    let nearest = pointSegmentDistance(p, line[0]!, line[0]!);
    for (let i = 1; i < line.length; i++) {
      nearest = Math.min(nearest, pointSegmentDistance(p, line[i - 1]!, line[i]!));
    }
    return Math.max(worst, nearest);
  }, 0);
}
