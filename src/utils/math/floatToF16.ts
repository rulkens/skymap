/**
 * floatToF16 — encode an f32 value into its IEEE 754 binary16 (half)
 * raw bit pattern, returned as a plain `number` holding the 16 bits.
 *
 * JS has no native f16, so callers store cube voxels as `Uint16` holding
 * these raw bits and upload them directly to a WebGPU `r16float` texture
 * (which understands the same bit layout).
 *
 * Implementation borrows the standard "Float16Array shim" trick: a
 * 1-element `Float32Array` view sharing a buffer with a `Uint32Array`
 * gives bit-level access to the f32 representation, which is then
 * re-encoded into f16.  The scratch buffer is module-private so the
 * function presents as pure to callers.
 *
 * Special values + denormals are handled roughly — adequate for cubes
 * that ship values in [0, 1] (no NaN/Inf, no negatives expected).  For
 * the offline builders' round-to-nearest-even contract see the separate
 * `tools/utils/math` half converters; the two intentionally differ.
 */

const f32Buf = new ArrayBuffer(4);
const f32View = new Float32Array(f32Buf);
const u32View = new Uint32Array(f32Buf);

export function floatToF16(value: number): number {
  f32View[0] = value;
  const x = u32View[0]!;
  const sign = (x >> 31) & 0x1;
  let exp = (x >> 23) & 0xff;
  let mant = x & 0x7fffff;
  // Handle special values + denormals roughly — adequate for cubes that
  // ship values in [0, 1] (no NaN/Inf, no negatives expected).
  if (exp === 0xff) {
    return (sign << 15) | 0x7c00 | (mant ? 1 : 0);
  }
  exp = exp - 127 + 15;
  if (exp >= 0x1f) return (sign << 15) | 0x7c00; // Inf
  if (exp <= 0) {
    if (exp < -10) return sign << 15; // underflow → 0
    mant = (mant | 0x800000) >> (1 - exp);
    return (sign << 15) | (mant >> 13);
  }
  return (sign << 15) | (exp << 10) | (mant >> 13);
}
