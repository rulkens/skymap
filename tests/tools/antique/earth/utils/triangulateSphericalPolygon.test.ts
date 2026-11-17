/**
 * A realm's triangles must close: a T-junction leaves a hairline with no realm
 * code, which the plate would ink as a border running through the realm. So
 * the only edges used by one triangle are the input rings' own, each halved
 * the same number of times, and everything stays on the unit sphere.
 */

import { describe, it, expect } from 'vitest';

import { triangulateSphericalPolygon } from '../../../../../tools/antique/earth/utils/triangulateSphericalPolygon';
import { lonLatDegToDirection } from '../../../../../src/utils/geo/lonLatDegToDirection';

type Ring = [number, number][];
const box = (w: number, s: number, e: number, n: number): Ring => [
  [w, s],
  [e, s],
  [e, n],
  [w, n],
];

// The number of pieces the halving rule leaves on one ring edge.
function pieces(a: [number, number], b: [number, number], maxDeg: number): number {
  const pa = lonLatDegToDirection({ lonDeg: a[0], latDeg: a[1] });
  const pb = lonLatDegToDirection({ lonDeg: b[0], latDeg: b[1] });
  const deg = (Math.acos(pa[0] * pb[0] + pa[1] * pb[1] + pa[2] * pb[2]) * 180) / Math.PI;
  let n = 1;
  // Halving keeps the chord ≤ the max chord, which for equal halves means arc ≤ max.
  while (deg / n > maxDeg + 1e-9) n *= 2;
  return n;
}

describe('triangulateSphericalPolygon', () => {
  it('splits shared edges alike, so only the rings bound the mesh', () => {
    const outer = box(-10, 30, 40, 60);
    const hole = box(5, 40, 15, 47.5).reverse() as Ring;
    const maxDeg = 2;
    const { positions, indices } = triangulateSphericalPolygon([outer, hole], maxDeg);

    const uses = new Map<string, number>();
    for (let t = 0; t < indices.length; t += 3) {
      for (let k = 0; k < 3; k++) {
        const i = indices[t + k]!;
        const j = indices[t + ((k + 1) % 3)]!;
        const key = i < j ? `${i},${j}` : `${j},${i}`;
        uses.set(key, (uses.get(key) ?? 0) + 1);
      }
    }
    const once = [...uses.values()].filter((n) => n === 1).length;
    const expected = [outer, hole]
      .flatMap((ring) => ring.map((p, i) => pieces(p, ring[(i + 1) % ring.length]!, maxDeg)))
      .reduce((a, b) => a + b, 0);
    expect(once).toBe(expected);
    expect([...uses.values()].every((n) => n <= 2)).toBe(true);
    for (const p of positions) expect(Math.hypot(...p)).toBeCloseTo(1, 9);
  });
});
