import { describe, it, expect } from 'vitest';
import { f16BitsToFloat } from '../../../../tools/utils/math/f16BitsToFloat';
import { f32ToF16Bits } from '../../../../src/utils/math/f32ToF16Bits';

describe('f16BitsToFloat', () => {
  it('decodes the f16 +Inf bit pattern back to Infinity', () => {
    // f16 +Inf bit pattern: 0 11111 0000000000 = 0x7C00.
    expect(f16BitsToFloat(0x7c00)).toBe(Infinity);
  });

  it('decodes the f16 -Inf bit pattern back to -Infinity', () => {
    // Sign bit set: 1 11111 0000000000 = 0xFC00.
    expect(f16BitsToFloat(0xfc00)).toBe(-Infinity);
  });

  it('decodes a NaN bit pattern to NaN', () => {
    expect(Number.isNaN(f16BitsToFloat(0x7e00))).toBe(true);
  });

  it('decodes the zero bit pattern to 0', () => {
    expect(f16BitsToFloat(0)).toBe(0);
  });

  it('inverts f32ToF16Bits across representative values', () => {
    for (const v of [0, 1, -1, 0.5, -0.5, 0.25]) {
      expect(f16BitsToFloat(f32ToF16Bits(v))).toBeCloseTo(v, 3);
    }
  });
});
