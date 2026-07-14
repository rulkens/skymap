/**
 * Interleave three ≤10-bit grid coordinates into a single Morton (Z-order) code.
 *
 * A Morton code is the index of a point along a space-filling Z-order curve.
 * The trick is bit-interleaving: given integer grid coordinates x, y, z, you
 * take their bits and weave them together so the low bits of all three axes end
 * up adjacent, then the next-higher bits, and so on:
 *
 *     bit i of x → code bit 3i        (x on the lowest interleave bit)
 *     bit i of y → code bit 3i + 1
 *     bit i of z → code bit 3i + 2
 *
 * Why bother? Because interleaving makes numerically-adjacent codes spatially
 * adjacent most of the time — two points whose codes differ only in their low
 * bits share every high-order octree cell, so they sit in the same corner of
 * the same corner of the same corner of the cube. Sorting points by Morton code
 * therefore groups spatial neighbours, which is exactly what an octree walk (or
 * a cache-friendly build-time layout) wants. The curve has occasional long
 * jumps at cell boundaries, but the locality is good enough that it is the
 * standard index for linear/pointerless octrees.
 *
 * At ≤10 bits per axis the interleaved result is 3 × 10 = 30 bits, which fits
 * comfortably inside a uint32 (bit 30 and 31 stay clear). That headroom also
 * means the composition below never sets bit 31, so JS's int32 bitwise ops
 * cannot produce a spuriously-negative number and no `>>> 0` coercion is needed.
 *
 * The inputs and output are octree grid indices — dimensionless cell
 * coordinates, not a spatial position vector. Convert world coordinates to grid
 * cells before calling.
 *
 * @param x Grid coordinate on the x axis, integer in [0, 1023].
 * @param y Grid coordinate on the y axis, integer in [0, 1023].
 * @param z Grid coordinate on the z axis, integer in [0, 1023].
 * @returns The interleaved 30-bit Morton code as a non-negative uint32.
 */
export function mortonEncode3(x: number, y: number, z: number): number {
  return part1by2(x) | (part1by2(y) << 1) | (part1by2(z) << 2);
}

/**
 * Spread the low 10 bits of `n` out so each occupies every third bit position
 * (bit i → bit 3i), leaving two zero bits between them for the other two axes.
 *
 * The magic-number masks do this in log(10) steps instead of a per-bit loop:
 * each shift-xor-mask fans the bits halfway to their final home, and the mask
 * discards the collisions the shift created. This is the classic "part1by2"
 * dilation; the final mask 0x09249249 has exactly bits 0, 3, 6, … 27 set.
 */
function part1by2(n: number): number {
  n &= 0x3ff; // keep the low 10 bits — the max coordinate per axis
  n = (n ^ (n << 16)) & 0xff0000ff;
  n = (n ^ (n << 8)) & 0x0300f00f;
  n = (n ^ (n << 4)) & 0x030c30c3;
  n = (n ^ (n << 2)) & 0x09249249;
  return n;
}
