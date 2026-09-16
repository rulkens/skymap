/**
 * levelFittingWidth — the deepest pyramid level whose full equirectangular
 * width still fits inside `widthPx`. The single inversion of the
 * `baseWidthPx << z` ladder; `baseWidthPx` is the body's level-0 width
 * (Earth callers pass `EARTH_EQUIRECT_BASE_WIDTH_PX`).
 *
 * A shift loop, not `floor(log2(widthPx / baseWidthPx))`: an exact
 * power-of-two width can land one ulp short of `Math.log2`'s true value and
 * floor a level too shallow, making every `z` in the planner's walk
 * non-integer and every tile path 404.
 */
export function levelFittingWidth(widthPx: number, baseWidthPx: number): number {
  let z = 0;
  while (baseWidthPx << (z + 1) <= widthPx) z++;
  return z;
}
