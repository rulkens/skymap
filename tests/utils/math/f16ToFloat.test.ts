import { describe, it, expect } from 'vitest';
import { f16ToFloat } from '../../../src/utils/math/f16ToFloat';
import { floatToF16 } from '../../../src/utils/math/floatToF16';

describe('f16ToFloat', () => {
  it('decodes the zero bit pattern to 0', () => {
    expect(f16ToFloat(0)).toBe(0);
  });

  it('decodes 0x3c00 to 1.0', () => {
    expect(f16ToFloat(0x3c00)).toBe(1);
  });

  it('decodes the +Inf bit pattern to Infinity', () => {
    // f16 +Inf: 0 11111 0000000000 = 0x7c00.
    expect(f16ToFloat(0x7c00)).toBe(Infinity);
  });

  it('decodes a NaN bit pattern to NaN', () => {
    // Any non-zero mantissa with the all-ones exponent is NaN.
    expect(Number.isNaN(f16ToFloat(0x7e00))).toBe(true);
  });

  it('round-trips floatToF16 across [0, 1], including negatives and zero', () => {
    for (let i = -10; i <= 10; i++) {
      const v = i / 10;
      expect(f16ToFloat(floatToF16(v))).toBeCloseTo(v, 2);
    }
  });

  it('round-trips subnormals (below f16 normal range, 2^-14)', () => {
    for (const v of [3e-5, -3e-5, 1e-5, -1e-5]) {
      expect(f16ToFloat(floatToF16(v))).toBeCloseTo(v, 6);
    }
  });
});
