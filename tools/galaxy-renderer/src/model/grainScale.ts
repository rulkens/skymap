/**
 * grainScale — the per-star jitter/size scale factor the spike derives from
 * total star count: `Math.cbrt(400000 / totalStars)`. Every dust-population
 * count formula divides by `grainScale ** 2` (fewer stars -> coarser grains
 * -> proportionally fewer, bigger dust particles for the same visual
 * density), so both `carveDustLayout` (CPU-side capacity carving) and the
 * dust generation shader need the identical value.
 *
 * Its own file rather than a constant folded into `packGenerationUniforms`
 * or the carve functions — it's a pure, RNG-free computation with no
 * construction-order dependency on anything else this package draws, and
 * every consumer needs the exact same formula, so a shared single-purpose
 * function is simpler than each call site re-deriving it.
 */

export function grainScale(totalStars: number): number {
  return Math.cbrt(400000 / totalStars);
}
