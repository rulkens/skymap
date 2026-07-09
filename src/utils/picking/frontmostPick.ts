/**
 * Resolve one raw pick value from per-slab readbacks by taking the first
 * non-zero in near→far order.
 *
 * The screen shows slabs composited far-to-near with OVER blending, so
 * nearer content paints over farther content — what the cursor lands on is
 * whatever the nearest slab drew there. Picking mirrors that same visual
 * result on the CPU: read each slab's pick texture at the cursor, then fold
 * the readbacks front-to-back and stop at the first hit. Because `perSlabRaw`
 * is ordered near→far (index 0 = nearest per `Slab`), that fold is simply
 * "first non-zero"; 0 is the reserved no-hit value the pick shader clears to.
 *
 * This is deliberately a raw-value fold, not a decoder — `unpackPick` still
 * owns turning the winning 32-bit word into a `(sourceCode, localIdx)` pair.
 * Keeping the two apart means the cross-slab occlusion rule and the bit
 * layout can each change without disturbing the other.
 */

export function frontmostPick(perSlabRaw: readonly number[]): number {
  for (const raw of perSlabRaw) {
    if (raw !== 0) return raw;
  }
  return 0;
}
