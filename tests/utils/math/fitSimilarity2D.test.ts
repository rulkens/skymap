/** fitSimilarity2D — recovers an exact similarity, and picks the handedness that fits. */

import { describe, it, expect } from 'vitest';

import { fitSimilarity2D } from '../../../src/utils/math/fitSimilarity2D';
import type { Vec2 } from '../../../src/@types/math/Vec2';

const P: Vec2[] = [
  [0, 0],
  [1, 0],
  [0, 2],
  [3, 1],
];

function apply(scale: number, theta: number, mirrored: boolean, t: Vec2): Vec2[] {
  const c = Math.cos(theta) * scale;
  const s = Math.sin(theta) * scale;
  return P.map(([x0, y]) => {
    const x = mirrored ? -x0 : x0;
    return [c * x - s * y + t[0], s * x + c * y + t[1]];
  });
}

describe('fitSimilarity2D', () => {
  for (const mirrored of [false, true])
    it(`recovers a ${mirrored ? 'mirrored' : 'plain'} similarity exactly`, () => {
      const fit = fitSimilarity2D(P, apply(2.5, 0.7, mirrored, [10, -4]));
      expect(fit.mirrored).toBe(mirrored);
      expect(fit.scale).toBeCloseTo(2.5, 9);
      expect(fit.theta).toBeCloseTo(0.7, 9);
      expect(fit.t[0]).toBeCloseTo(10, 9);
      expect(fit.t[1]).toBeCloseTo(-4, 9);
      expect(fit.rms).toBeCloseTo(0, 9);
    });
});
