/**
 * Recover the three grid coordinates from a Morton (Z-order) code — the exact
 * inverse of `mortonEncode3`.
 *
 * A Morton code interleaves the bits of three ≤10-bit axis coordinates so that
 * bit i of x lands on code bit 3i, bit i of y on bit 3i + 1, and bit i of z on
 * bit 3i + 2 (x on the lowest interleave bit). Decoding un-weaves them: pick out
 * every third bit for each axis and compact them back down into a dense integer.
 *
 * The returned triple holds octree grid indices — dimensionless cell
 * coordinates, not a spatial position vector. See `mortonEncode3` for why
 * bit-interleaving buys spatial locality and why 30 bits (10 per axis) fit a
 * uint32.
 *
 * @param code A 30-bit Morton code, as produced by `mortonEncode3`.
 * @returns The `[x, y, z]` grid coordinates, each an integer in [0, 1023].
 */
import type { Vec3 } from '../../@types/math/Vec3';

export function mortonDecode3(code: number): Vec3 {
  return [compact1by2(code), compact1by2(code >> 1), compact1by2(code >> 2)];
}

/**
 * Gather the bits at positions 0, 3, 6, … 27 of `n` and compact them down to a
 * dense 10-bit integer (bit 3i → bit i). This is the inverse of `part1by2`: the
 * same magic-number masks run in reverse, each step folding the spread bits
 * halfway back toward the low end until they form a contiguous run.
 */
function compact1by2(n: number): number {
  n &= 0x09249249; // isolate the bits belonging to this axis (0, 3, 6, … 27)
  n = (n ^ (n >> 2)) & 0x030c30c3;
  n = (n ^ (n >> 4)) & 0x0300f00f;
  n = (n ^ (n >> 8)) & 0xff0000ff;
  n = (n ^ (n >> 16)) & 0x000003ff;
  return n;
}
