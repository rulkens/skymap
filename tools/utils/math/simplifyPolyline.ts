import type { Vec3 } from '../../../src/@types/math/Vec3';

/**
 * Douglas–Peucker: the subset of `points` (endpoints always kept, order preserved) whose polyline
 * passes within `tolerance` of every dropped point. Deterministic: ties keep the first farthest.
 */
export function simplifyPolyline(points: readonly Readonly<Vec3>[], tolerance: number): Vec3[] {
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const spans: [number, number][] = [[0, points.length - 1]];
  while (spans.length > 0) {
    const [from, to] = spans.pop()!;
    const a = points[from]!;
    const ab = [0, 1, 2].map((c) => points[to]![c]! - a[c]!);
    const abLen2 = ab[0]! ** 2 + ab[1]! ** 2 + ab[2]! ** 2;
    let [farthest, farthestDist] = [-1, tolerance];
    for (let i = from + 1; i < to; i++) {
      const ap = [0, 1, 2].map((c) => points[i]![c]! - a[c]!);
      // Distance to the segment, not the infinite line: a track can double back past an end.
      const t =
        abLen2 > 0
          ? Math.max(0, Math.min(1, (ap[0]! * ab[0]! + ap[1]! * ab[1]! + ap[2]! * ab[2]!) / abLen2))
          : 0;
      const d = Math.hypot(ap[0]! - t * ab[0]!, ap[1]! - t * ab[1]!, ap[2]! - t * ab[2]!);
      if (d > farthestDist) [farthest, farthestDist] = [i, d];
    }
    if (farthest < 0) continue;
    keep[farthest] = 1;
    spans.push([from, farthest], [farthest, to]);
  }
  return points.filter((_, i) => keep[i] === 1).map((p) => [p[0], p[1], p[2]]);
}
