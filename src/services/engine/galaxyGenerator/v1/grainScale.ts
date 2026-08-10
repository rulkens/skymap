/**
 * grainScale — the per-star jitter/size factor derived from the total star
 * count: `Math.cbrt(400000 / totalStars)`. Every dust-population count formula
 * divides by `grainScale ** 2` (fewer stars -> coarser grains -> proportionally
 * fewer, bigger dust particles for the same visual density), so
 * `carveDustLayout`, `packGenerationUniforms`'s `starSize` and the dust
 * generation shader must all see the identical value.
 */

export function grainScale(totalStars: number): number {
  return Math.cbrt(400000 / totalStars);
}
