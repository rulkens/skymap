import { describe, it, expect } from 'vitest';
import { hermiteUnit } from '../../../src/utils/math/hermiteUnit';

describe('hermiteUnit', () => {
  it.each([
    [0, 0],
    [1, 1],
    [2, 0.5],
  ])('runs 0 → 1 with end slopes (%s, %s)', (m0, m1) => {
    const h = 1e-6;
    expect(hermiteUnit(m0, m1, 0)).toBe(0);
    expect(hermiteUnit(m0, m1, 1)).toBe(1);
    expect((hermiteUnit(m0, m1, h) - hermiteUnit(m0, m1, 0)) / h).toBeCloseTo(m0, 4);
    expect((hermiteUnit(m0, m1, 1) - hermiteUnit(m0, m1, 1 - h)) / h).toBeCloseTo(m1, 4);
  });
});
