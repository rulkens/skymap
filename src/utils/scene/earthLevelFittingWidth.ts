import { EARTH_EQUIRECT_BASE_WIDTH_PX } from '../../data/bodies/earthTileParams';

/**
 * earthLevelFittingWidth — the deepest pyramid level whose full equirectangular
 * width still fits inside `widthPx`.
 *
 * The single inversion of the `EARTH_EQUIRECT_BASE_WIDTH_PX << z` ladder, asked
 * by everything that holds a raster width and needs the level that width
 * represents: the whole-globe texture a session binds (`earthBaseLevelForTier`),
 * and the deepest level a build-time imagery source can produce without
 * inventing detail (the sources under `tools/textures/`). Written out per caller
 * it is a four-line loop with a boundary in it, and each copy is a separate
 * chance to get that boundary wrong in a way nothing downstream can see.
 *
 * ## Integer arithmetic, not `Math.log2`
 *
 * `floor(log2(widthPx / 512))` is the same formula in floating point, where
 * ECMA-262 only requires an implementation-approximated result — an exactly
 * power-of-two width can land one ulp short and floor a level too shallow. Both
 * callers pass exact powers of two (2048, 4096, 8192, 65536), so that is the
 * common case rather than the corner, and the two consequences are both silent:
 * a source bakes one level shallower than its pixels justify, and a
 * non-integer level makes every `z` in the planner's quadtree walk non-integer,
 * so every tile path is a decimal that 404s and every `1 << (zWin - z)` window
 * span is nonsense. A shift loop cannot express a fractional level at all.
 */
export function earthLevelFittingWidth(widthPx: number): number {
  let z = 0;
  while (EARTH_EQUIRECT_BASE_WIDTH_PX << (z + 1) <= widthPx) z++;
  return z;
}
