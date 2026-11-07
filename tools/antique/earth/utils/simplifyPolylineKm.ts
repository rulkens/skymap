/**
 * simplifyPolylineKm — Douglas–Peucker on the sphere: drop every vertex within
 * `toleranceKm` of the great-circle arc its kept neighbours span. Natural
 * Earth's 1:10m lines carry vertices far finer than the map can show, and
 * each one would cost a line vertex. Ends are always kept.
 */

import { lonLatDegToDirection } from '../../../../src/utils/geo/lonLatDegToDirection';
import { cross3 } from '../../../../src/utils/math/cross3';
import { dot3 } from '../../../../src/utils/math/dot3';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const angle = (a: Vec3, b: Vec3) => Math.acos(Math.min(1, Math.max(-1, dot3(a, b))));

/** Radians from p to the arc a→b: across the arc's great circle where p projects
 * inside it, else to the nearer end. */
const arcDistance = (p: Vec3, a: Vec3, b: Vec3): number => {
  const n = cross3(a, b);
  const len = Math.hypot(n[0], n[1], n[2]);
  if (len < 1e-12) return angle(p, a);
  const inside = dot3(cross3(a, p), n) >= 0 && dot3(cross3(p, b), n) >= 0;
  return inside
    ? Math.asin(Math.min(1, Math.abs(dot3(p, n)) / len))
    : Math.min(angle(p, a), angle(p, b));
};

export function simplifyPolylineKm(
  points: readonly (readonly [number, number])[],
  toleranceKm: number,
  radiusKm: number,
): (readonly [number, number])[] {
  if (points.length <= 2) return [...points];
  const dirs = points.map(([lonDeg, latDeg]) => lonLatDegToDirection({ lonDeg, latDeg }));
  const tolerance = toleranceKm / radiusKm;
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  // An explicit stack: a 10k-vertex river would overflow a recursive one.
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [from, to] = stack.pop()!;
    let worst = -1;
    let worstAt = -1;
    for (let i = from + 1; i < to; i++) {
      const d = arcDistance(dirs[i]!, dirs[from]!, dirs[to]!);
      if (d > worst) {
        worst = d;
        worstAt = i;
      }
    }
    if (worst > tolerance) {
      keep[worstAt] = true;
      stack.push([from, worstAt], [worstAt, to]);
    }
  }
  return points.filter((_, i) => keep[i]);
}
