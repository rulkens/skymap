import { describe, it, expect } from 'vitest';
import { floatToF16 } from '../../../src/utils/math/floatToF16';
import { f16ToFloat } from '../../../src/utils/math/f16ToFloat';

describe('floatToF16', () => {
  it('packs zero as bit pattern 0', () => {
    expect(floatToF16(0)).toBe(0);
  });

  it('encodes 1.0 as the canonical f16 bit pattern (0x3c00)', () => {
    expect(floatToF16(1)).toBe(0x3c00);
  });

  it('round-trips values in [0, 1] within f16 precision', () => {
    for (const v of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      expect(f16ToFloat(floatToF16(v))).toBeCloseTo(v, 2);
    }
  });

  it('overflows large values to +Inf', () => {
    expect(floatToF16(1e30)).toBe(0x7c00);
  });

  it('underflows tiny values to 0', () => {
    expect(floatToF16(1e-30)).toBe(0);
  });
});
