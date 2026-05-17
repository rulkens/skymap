import { describe, it, expect } from 'vitest';
import { f32ToF16Bits, f16BitsToFloat } from '../../../../tools/utils/math/floatHalf';

/**
 * Round-trip cases for the IEEE-754 f32↔f16 helpers.  Both directions
 * live in one file so the inverse relationship is testable without an
 * external decoder.
 */
describe('floatHalf', () => {
  it('round-trips representative values within f16 precision', () => {
    const cases = [0, 1, -1, 0.5, -0.5, 65504, -65504, 1e-4];
    for (const v of cases) {
      const round = f16BitsToFloat(f32ToF16Bits(v));
      expect(round).toBeCloseTo(v, Math.abs(v) > 1 ? 0 : 3);
    }
  });

  it('overflows to +Inf and -Inf', () => {
    expect(f16BitsToFloat(f32ToF16Bits(1e10))).toBe(Infinity);
    expect(f16BitsToFloat(f32ToF16Bits(-1e10))).toBe(-Infinity);
  });

  it('preserves NaN', () => {
    expect(Number.isNaN(f16BitsToFloat(f32ToF16Bits(NaN)))).toBe(true);
  });

  it('packs zero as bit pattern 0', () => {
    expect(f32ToF16Bits(0)).toBe(0);
  });

  it('decodes f16 +Inf bit pattern back to Infinity', () => {
    // f16 +Inf bit pattern: 0 11111 0000000000 = 0x7C00
    expect(f16BitsToFloat(0x7c00)).toBe(Infinity);
  });

  it('demonstrates known precision loss for a large representable value', () => {
    // f16 has 10 mantissa bits; 1234 has < 11 significant bits so it is
    // representable exactly.  1235 is not — it quantises to 1235 or 1236
    // depending on rounding.  We assert the absolute error is < 1.
    expect(Math.abs(f16BitsToFloat(f32ToF16Bits(1235)) - 1235)).toBeLessThan(1);
  });
});
