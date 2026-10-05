/**
 * splitF64HiLo — split f64 values into an f32 pair whose sum recovers them.
 * An f32 alone carries ~7 digits, which at 160 AU is ~1400 km; the shader
 * subtracts the camera's own pair as `(hi − camHi) + (lo − camLo)`, so the
 * near-cancelling terms are exact and only the small remainders carry rounding.
 */

export function splitF64HiLo(v: Float64Array): { hi: Float32Array; lo: Float32Array } {
  const hi = new Float32Array(v);
  const lo = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) lo[i] = v[i]! - hi[i]!;
  return { hi, lo };
}
