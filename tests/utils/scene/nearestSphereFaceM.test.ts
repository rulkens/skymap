import { describe, expect, it } from 'vitest';

import { nearestSphereFaceM } from '../../../src/utils/scene/nearestSphereFaceM';

describe('nearestSphereFaceM', () => {
  it('picks the closest surface, not the closest centre', () => {
    const eye = [0, 0, 0] as const;
    // Centre at 10 m with a 9 m radius: face at 1 m. Centre at 5 m, radius 1: face at 4 m.
    const near = nearestSphereFaceM(eye, [
      { posM: [5, 0, 0], radiusM: 1 },
      { posM: [10, 0, 0], radiusM: 9 },
    ]);
    expect(near).toBeCloseTo(1);
  });

  it('is Infinity for no spheres and negative inside one', () => {
    expect(nearestSphereFaceM([0, 0, 0], [])).toBe(Infinity);
    expect(nearestSphereFaceM([0, 0, 0], [{ posM: [1, 0, 0], radiusM: 3 }])).toBeCloseTo(-2);
  });
});
