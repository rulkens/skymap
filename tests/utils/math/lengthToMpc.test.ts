import { describe, expect, it } from 'vitest';
import { lengthToMpc } from '../../../src/utils/math/lengthToMpc';

describe('lengthToMpc', () => {
  it('converts pc, kpc and Mpc to the same value for the same physical length', () => {
    expect(lengthToMpc({ value: 1e6, unit: 'pc' })).toBeCloseTo(1, 12);
    expect(lengthToMpc({ value: 1e3, unit: 'kpc' })).toBeCloseTo(1, 12);
    expect(lengthToMpc({ value: 1, unit: 'Mpc' })).toBe(1);
  });

  it('returns Mpc values unchanged', () => {
    expect(lengthToMpc({ value: 16.5, unit: 'Mpc' })).toBe(16.5);
  });
});
