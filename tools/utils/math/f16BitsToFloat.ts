/**
 * f16BitsToFloat — decode a single IEEE-754 f16 raw bit pattern back
 * into a JS number.  The inverse of `f32ToF16Bits`.
 *
 * Used offline by the SCFD verifiers (`verifyCf4Scfd`, `verifyFlowField`)
 * to decode stored voxel bits for comparison against known cosmography.
 *
 * Layout reminder: f16 is 1 sign + 5 exp (bias 15) + 10 mantissa.  Zero,
 * subnormals, normals, ±Inf and NaN are all handled.
 */

export function f16BitsToFloat(bits: number): number {
  const sign = (bits & 0x8000) >> 15;
  const exp = (bits & 0x7c00) >> 10;
  const mant = bits & 0x03ff;
  if (exp === 0) return (sign ? -1 : 1) * (mant / 1024) * Math.pow(2, -14);
  if (exp === 31) return mant === 0 ? (sign ? -Infinity : Infinity) : NaN;
  return (sign ? -1 : 1) * (1 + mant / 1024) * Math.pow(2, exp - 15);
}
