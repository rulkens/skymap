/**
 * Recover ONE grid coordinate from a Morton (Z-order) code — the single-axis,
 * allocation-free sibling of `mortonDecode3`.
 *
 * `mortonDecode3` returns all three axes as a fresh `Vec3`. A hot per-frame path
 * that only needs the three scalars — the star cut, which writes each decoded
 * axis straight into a reused typed array — must not allocate that throwaway
 * tuple tens of thousands of times a frame. This pulls out exactly one axis so
 * the caller can do `[mortonDecodeAxis(m, 0), mortonDecodeAxis(m, 1),
 * mortonDecodeAxis(m, 2)]` into scalars with zero garbage.
 *
 * A Morton code interleaves the bits of three ≤10-bit axis coordinates so that
 * bit i of axis a lands on code bit `3i + a` (x on the lowest interleave bit).
 * So axis `a` is decoded by shifting the code right by `a` and compacting every
 * third bit back down — the exact per-axis step `mortonDecode3` runs three
 * times. Kept bit-for-bit identical to that module's `compact1by2`, so the two
 * decoders can never drift.
 *
 * @param code A 30-bit Morton code, as produced by `mortonEncode3`.
 * @param axis Which axis to extract: 0 = x, 1 = y, 2 = z.
 * @returns That axis's grid coordinate, an integer in [0, 1023].
 */
export function mortonDecodeAxis(code: number, axis: number): number {
  return compact1by2(code >> axis);
}

/**
 * Gather the bits at positions 0, 3, 6, … 27 of `n` and compact them down to a
 * dense 10-bit integer (bit 3i → bit i). The inverse of `part1by2`: the same
 * magic-number masks in reverse, each step folding the spread bits halfway back
 * toward the low end until they form a contiguous run. Duplicated (not shared)
 * with `mortonDecode3` because it is a private, one-symbol-per-file detail — the
 * decoders' parity is pinned by `mortonDecodeAxis.test.ts` cross-checking
 * against `mortonDecode3`.
 */
function compact1by2(n: number): number {
  n &= 0x09249249; // isolate the bits belonging to this axis (0, 3, 6, … 27)
  n = (n ^ (n >> 2)) & 0x030c30c3;
  n = (n ^ (n >> 4)) & 0x0300f00f;
  n = (n ^ (n >> 8)) & 0xff0000ff;
  n = (n ^ (n >> 16)) & 0x000003ff;
  return n;
}
