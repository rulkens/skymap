import { describe, it, expect } from 'vitest';
import { f32ToF16Bits } from '../../../tools/parsers/floatToHalf';

/** Decode an f16 raw bit pattern back into a JS number; copy of the helper
 * already used by `tests/tools/buildCf4Density.smoke.test.ts`. */
function f16BitsToFloat(bits: number): number {
  const sign = (bits & 0x8000) >> 15;
  const exp = (bits & 0x7c00) >> 10;
  const mant = bits & 0x03ff;
  if (exp === 0) return (sign ? -1 : 1) * (mant / 1024) * Math.pow(2, -14);
  if (exp === 31) return mant === 0 ? (sign ? -Infinity : Infinity) : NaN;
  return (sign ? -1 : 1) * (1 + mant / 1024) * Math.pow(2, exp - 15);
}

describe('f32ToF16Bits', () => {
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
});
