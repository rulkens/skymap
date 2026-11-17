/**
 * triangulateSphericalPolygon — a lon/lat polygon (outer ring, then holes) as
 * triangles on the unit globe. Earcut runs in an azimuthal equidistant
 * projection about the outer ring's mean direction, which keeps a realm as wide
 * as Muscovy one simple polygon; then every edge longer than `maxEdgeDeg` is
 * halved on the sphere, recursively. The split rule reads the EDGE alone and a
 * midpoint is cached per edge, so two triangles sharing an edge always split it
 * alike: no T-junction opens a hairline of "no realm" inside a realm, which the
 * plate would ink as a border.
 */

import earcut from 'earcut';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { SphericalMesh } from '../@types/SphericalMesh';
import { lonLatDegToDirection } from '../../../../src/utils/geo/lonLatDegToDirection';
import { dot3 } from '../../../../src/utils/math/dot3';
import { cross3 } from '../../../../src/utils/math/cross3';
import { normalize3 } from '../../../../src/utils/math/normalize3';
import { distance3 } from '../../../../src/utils/math/distance3';

export function triangulateSphericalPolygon(
  rings: readonly (readonly (readonly [number, number])[])[],
  maxEdgeDeg: number,
): SphericalMesh {
  const positions: Vec3[] = [];
  for (const ring of rings)
    for (const [lonDeg, latDeg] of ring) positions.push(lonLatDegToDirection({ lonDeg, latDeg }));

  // Azimuthal equidistant about the outer ring's mean direction.
  const outerCount = rings[0]!.length;
  const sum = positions
    .slice(0, outerCount)
    .reduce<Vec3>((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]);
  const c = normalize3(sum);
  const e = normalize3(Math.abs(c[2]) < 0.9 ? cross3([0, 0, 1], c) : cross3([1, 0, 0], c));
  const n = cross3(c, e);
  const flat: number[] = [];
  for (const p of positions) {
    const x = dot3(p, e);
    const y = dot3(p, n);
    const angle = Math.atan2(Math.hypot(x, y), dot3(p, c));
    const r = Math.hypot(x, y);
    flat.push(r > 0 ? (x / r) * angle : 0, r > 0 ? (y / r) * angle : 0);
  }
  const holes: number[] = [];
  let start = 0;
  rings.forEach((ring, i) => {
    if (i > 0) holes.push(start);
    start += ring.length;
  });
  const coarse = earcut(flat, holes, 2);

  const maxChord = 2 * Math.sin(((maxEdgeDeg / 2) * Math.PI) / 180);
  const midpoints = new Map<string, number>();
  const midpoint = (i: number, j: number): number => {
    const key = i < j ? `${i},${j}` : `${j},${i}`;
    let k = midpoints.get(key);
    if (k === undefined) {
      const a = positions[i]!;
      const b = positions[j]!;
      k = positions.push(normalize3([a[0] + b[0], a[1] + b[1], a[2] + b[2]])) - 1;
      midpoints.set(key, k);
    }
    return k;
  };
  const long = (i: number, j: number) => distance3(positions[i]!, positions[j]!) > maxChord;

  const indices: number[] = [];
  const refine = (a: number, b: number, c3: number): void => {
    const ab = long(a, b);
    const bc = long(b, c3);
    const ca = long(c3, a);
    if (!ab && !bc && !ca) {
      indices.push(a, b, c3);
      return;
    }
    // Rotate so the split edges come first, then emit the matching red-green pattern.
    if (ab && bc && ca) {
      const m1 = midpoint(a, b);
      const m2 = midpoint(b, c3);
      const m3 = midpoint(c3, a);
      refine(a, m1, m3);
      refine(m1, b, m2);
      refine(m3, m2, c3);
      refine(m1, m2, m3);
      return;
    }
    if (ab && !bc && !ca) return splitOne(a, b, c3);
    if (bc && !ca && !ab) return splitOne(b, c3, a);
    if (ca && !ab && !bc) return splitOne(c3, a, b);
    if (ab && bc) return splitTwo(a, b, c3);
    if (bc && ca) return splitTwo(b, c3, a);
    return splitTwo(c3, a, b);
  };
  // Edge (a, b) halved: two triangles.
  const splitOne = (a: number, b: number, c3: number): void => {
    const m = midpoint(a, b);
    refine(a, m, c3);
    refine(m, b, c3);
  };
  // Edges (a, b) and (b, c) halved: three triangles.
  const splitTwo = (a: number, b: number, c3: number): void => {
    const m1 = midpoint(a, b);
    const m2 = midpoint(b, c3);
    refine(m1, b, m2);
    refine(a, m1, m2);
    refine(a, m2, c3);
  };
  for (let t = 0; t < coarse.length; t += 3) refine(coarse[t]!, coarse[t + 1]!, coarse[t + 2]!);
  return { positions, indices };
}
