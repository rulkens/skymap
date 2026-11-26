import { describe, expect, it } from 'vitest';

import { formatLensDeg } from '../../../src/utils/format/formatLensDeg';

describe('formatLensDeg', () => {
  it('whole degrees from 10°, tenths below, with no trailing .0', () => {
    expect(formatLensDeg(60)).toBe('60°');
    expect(formatLensDeg(5.5)).toBe('5.5°');
    expect(formatLensDeg(5)).toBe('5°');
    expect(formatLensDeg(1)).toBe('1°');
  });

  it('arcminutes below a degree, by the same rule', () => {
    expect(formatLensDeg(0.5)).toBe('30′');
    expect(formatLensDeg(0.1)).toBe('6′');
    expect(formatLensDeg(1.5 / 60)).toBe('1.5′');
    expect(formatLensDeg(1 / 60)).toBe('1′');
  });
});
