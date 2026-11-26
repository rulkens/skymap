import { describe, it, expect } from 'vitest';
import { clipFactorAt } from '../../../../src/services/engine/animation/clipFactorAt';

describe('clipFactorAt', () => {
  it('follows the segments, holding the last value after them', () => {
    const fadeOut = [{ startSec: 1, endSec: 3, from: 1, to: 0.2 }];
    expect(clipFactorAt(fadeOut, 0.5)).toBe(1);
    expect(clipFactorAt(fadeOut, 2)).toBeCloseTo(0.6, 12);
    expect(clipFactorAt(fadeOut, 10)).toBeCloseTo(0.2, 12);
    expect(clipFactorAt(undefined, 2)).toBe(1);
  });
});
