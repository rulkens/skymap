/**
 * writeHiLoVertex — write one f64 position as an interleaved f32 [hi3, lo3]
 * record, in place. The trail vertex layout's single encoder, so per-frame
 * callers (the head vertex, the eye) allocate nothing.
 */

export function writeHiLoVertex(
  src: ArrayLike<number>,
  srcOffset: number,
  out: Float32Array,
  outOffset: number,
): void {
  for (let k = 0; k < 3; k++) {
    const v = src[srcOffset + k]!;
    const hi = Math.fround(v);
    out[outOffset + k] = hi;
    out[outOffset + 3 + k] = v - hi;
  }
}
