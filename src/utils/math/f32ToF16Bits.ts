/**
 * f32ToF16Bits — convert one IEEE-754 f32 value to its 16-bit f16 raw
 * bit pattern.
 *
 * Used offline by the SCFD volume / flow builders (`buildCf4Density`,
 * `buildMcpmVolume`, `buildFlowField`) to pack f32 source arrays into
 * Uint16 f16 voxel arrays for on-disk storage.
 *
 * Why hand-roll instead of importing a library?  This is fundamentally
 * bit twiddling on a Uint32 view of a Float32Array — a dependency for
 * ~30 lines of arithmetic would dwarf the saved code.
 *
 * Layout reminder:
 *   f32: 1 sign + 8 exp + 23 mant  (bias 127)
 *   f16: 1 sign + 5 exp + 10 mant  (bias 15)
 *
 * Edge handling: NaN preserves the signal bit, ±Inf overflows, subnormal
 * underflow shifts the mantissa into the f16 subnormal field, and the
 * normal range uses round-to-nearest-even via the guard bit at
 * mantissa[12].  This rounding contract intentionally differs from the
 * browser-side `src/utils/math/floatToF16` (which is rough for [0,1]
 * cubes); keep the two separate.
 */

export function f32ToF16Bits(value: number): number {
  const f32 = new Float32Array(1);
  f32[0] = value;
  const u32 = new Uint32Array(f32.buffer)[0]!;
  const sign = (u32 >>> 16) & 0x8000;
  let mant = u32 & 0x007fffff;
  let exp = (u32 >>> 23) & 0xff;
  if (exp === 255) {
    // Inf / NaN — preserve the bit pattern signal (NaN vs Inf).
    return sign | 0x7c00 | (mant ? 1 : 0);
  }
  exp = exp - 127 + 15;
  if (exp >= 31) return sign | 0x7c00; // overflow → Inf
  if (exp <= 0) {
    // Subnormal or zero — shift mantissa to fit the f16 subnormal field.
    if (exp < -10) return sign;
    mant = (mant | 0x00800000) >>> (1 - exp);
    if (mant & 0x00001000) mant += 0x00002000; // round up
    return sign | (mant >>> 13);
  }
  // Normal range: round-to-nearest-even via the guard bit at mantissa[12].
  if (mant & 0x00001000) {
    mant += 0x00002000;
    if (mant & 0x00800000) {
      mant = 0;
      exp += 1;
      if (exp >= 31) return sign | 0x7c00;
    }
  }
  return sign | (exp << 10) | (mant >>> 13);
}
