import { describe, it, expect } from 'vitest';

import { wrapRadPositive } from '../../../src/utils/math/wrapRadPositive';

describe('wrapRadPositive', () => {
  it('folds negatives and a full turn into [0, 2π)', () => {
    expect(wrapRadPositive(-0.5)).toBeCloseTo(Math.PI * 2 - 0.5, 12);
    expect(wrapRadPositive(Math.PI * 2)).toBe(0);
    expect(wrapRadPositive(7)).toBeCloseTo(7 - Math.PI * 2, 12);
  });
});
