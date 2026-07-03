/**
 * grainScale — the per-star jitter/size scale factor the spike derives from
 * total star count, ported verbatim from
 * `createGalaxyBuildContext.ts:49`: `Math.cbrt(400000 / totalStars)`. Every
 * dust-population count formula divides by `grainScale ** 2` (fewer stars ->
 * coarser grains -> proportionally fewer, bigger dust particles for the same
 * visual density), so layout carving needs the identical value the CPU model
 * uses when it writes those same particles.
 *
 * Extracted to its own file rather than importing it out of
 * `createGalaxyBuildContext` (which computes it as a local `const`, not an
 * export) — that function's docblock is explicit that it draws nothing from
 * the main `rand` stream and is part of a fixed construction sequence;
 * reaching into it here to grab one constant would tangle layout carving
 * (a pure, RNG-free computation) with that stream-ordering contract for no
 * benefit. The formula is small enough that porting it verbatim to a second,
 * independent pure function keeps both call sites simple instead of forcing
 * one to depend on the other's internals.
 */

export function grainScale(totalStars: number): number {
  return Math.cbrt(400000 / totalStars);
}
