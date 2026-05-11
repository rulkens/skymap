/**
 * Convert IEEE-754 f32 values into f16 raw bit patterns (Uint16). Used by
 * the SCFD volume builders (`buildCf4Density`, `buildMcpmVolume`) to pack
 * a Float32Array source into the on-disk f16 voxel array.
 *
 * Why hand-roll: per-element conversion from a Float32Array into Uint16
 * f16 bit patterns. Using the well-known IEEE-754 bit-manipulation
 * approach avoids importing a heavy f16 library (or shelling out to
 * Python) for what is fundamentally just a packing step.
 *
 * The algorithm extracts sign, exponent, and mantissa from the f32 bit
 * pattern and repacks them into the f16 5-bit exponent + 10-bit mantissa
 * layout, handling overflow to Inf, underflow to subnormal, and NaN
 * passthrough.
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
