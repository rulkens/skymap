/**
 * f16ToFloat — decode an IEEE 754 binary16 (half) raw bit pattern, held
 * in the low 16 bits of a `number`, back into a JS `number`.
 *
 * The inverse of `floatToF16`.  Used by tests and the volume fetchers to
 * read back the `Uint16` voxel bits a `ScalarCube` carries.
 *
 * Layout reminder: f16 is 1 sign + 5 exp (bias 15) + 10 mantissa.  This
 * handles the full range — zero, denormals, normals, ±Inf and NaN — so a
 * round-trip on any representable value is faithful.
 */

export function f16ToFloat(bits: number): number {
  const sign = (bits >> 15) & 0x1;
  const exp = (bits >> 10) & 0x1f;
  const mant = bits & 0x3ff;
  if (exp === 0) {
    if (mant === 0) return sign ? -0 : 0;
    // Denormal — rebuild as f32.
    const value = mant / 1024 / 16384;
    return sign ? -value : value;
  }
  if (exp === 0x1f) return mant ? NaN : sign ? -Infinity : Infinity;
  const e = exp - 15;
  const value = (1 + mant / 1024) * Math.pow(2, e);
  return sign ? -value : value;
}
