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

  it('is deterministic for a given seeded source', () => {
    const a = uniformInSphere(mulberry32(42));
    const b = uniformInSphere(mulberry32(42));
    expect(a).toEqual(b);
  });

  it('produces a mean near the origin over many samples', () => {
    const rand = mulberry32(7);
    let sx = 0,
      sy = 0,
      sz = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const [x, y, z] = uniformInSphere(rand);
      sx += x;
      sy += y;
      sz += z;
    }
    expect(Math.abs(sx / n)).toBeLessThan(0.05);
    expect(Math.abs(sy / n)).toBeLessThan(0.05);
    expect(Math.abs(sz / n)).toBeLessThan(0.05);
  });
});
