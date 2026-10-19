import { describe, expect, it } from 'vitest';

import { formatPowerOfTen } from '../../../src/utils/format/formatPowerOfTen';

describe('formatPowerOfTen', () => {
  it('writes the exponent in superscript, with its sign', () => {
    expect(formatPowerOfTen(1.3127e6, 3)).toBe('1.31 × 10⁶');
    expect(formatPowerOfTen(2.94e-13, 2)).toBe('2.9 × 10⁻¹³');
  });

  it('carries a rounded-up mantissa into the exponent', () => {
    expect(formatPowerOfTen(9.996e5, 3)).toBe('1.00 × 10⁶');
  });
});
