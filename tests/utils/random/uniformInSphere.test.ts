import { describe, it, expect } from 'vitest';
import { uniformInSphere } from '../../../src/utils/random/uniformInSphere';
import { mulberry32 } from '../../../src/utils/random/mulberry32';

describe('uniformInSphere', () => {
  it('returns points inside the unit ball (x²+y²+z² ≤ 1)', () => {
    const rand = mulberry32(1);
    for (let i = 0; i < 5000; i++) {
      const [x, y, z] = uniformInSphere(rand);
      expect(x * x + y * y + z * z).toBeLessThanOrEqual(1);
    }
  });
});
