import { describe, it, expect } from 'vitest';
import { galaxyCacheKey } from '../../../../src/utils/render/disk/galaxyCacheKey';

describe('galaxyCacheKey', () => {
  it('rounds RA/Dec to 5 decimal places', () => {
    expect(galaxyCacheKey(10.123456789, -20.987654321)).toBe('10.12346_-20.98765');
  });

  it('is stable for the same position', () => {
    expect(galaxyCacheKey(1, 2)).toBe(galaxyCacheKey(1, 2));
    expect(galaxyCacheKey(1, 2)).toBe('1.00000_2.00000');
  });

  it('distinguishes positions that differ past 5 dp', () => {
    expect(galaxyCacheKey(1.000001, 0)).not.toBe(galaxyCacheKey(1.000009, 0));
  });
});
