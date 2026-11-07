import { describe, expect, it } from 'vitest';

import { simplifyPolyline } from '../../../../tools/utils/math/simplifyPolyline';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

// A wiggly arc, densely sampled: the reference the simplified line must stay near.
const arc: Vec3[] = Array.from({ length: 400 }, (_, i) => {
  const a = (i / 399) * Math.PI;
  return [10 * Math.cos(a), 10 * Math.sin(a), 0.3 * Math.sin(9 * a)];
});

// Distance from p to the polyline, by brute-force sampling each segment.
function distanceToPolyline(p: Readonly<Vec3>, line: readonly Readonly<Vec3>[]): number {
  let best = Infinity;
  for (let s = 1; s < line.length; s++) {
    for (let k = 0; k <= 200; k++) {
      const t = k / 200;
      const q = [0, 1, 2].map((c) => line[s - 1]![c]! + t * (line[s]![c]! - line[s - 1]![c]!));
      best = Math.min(best, Math.hypot(p[0] - q[0]!, p[1] - q[1]!, p[2] - q[2]!));
    }
  }
  return best;
}

describe('simplifyPolyline', () => {
  it('keeps both endpoints and few points, every dropped point within the tolerance', () => {
    const line = simplifyPolyline(arc, 0.4);
    expect(line[0]).toEqual(arc[0]);
    expect(line.at(-1)).toEqual(arc.at(-1));
    expect(line.length).toBeLessThan(40);
    const worst = Math.max(...arc.map((p) => distanceToPolyline(p, line)));
    expect(worst).toBeLessThanOrEqual(0.4 + 1e-3);
  });
});
