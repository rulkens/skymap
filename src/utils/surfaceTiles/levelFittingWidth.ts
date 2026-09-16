import { SURFACE_EQUIRECT_BASE_WIDTH_PX } from '../../data/bodies/surfaceTileParams';

/**
 * levelFittingWidth — the deepest pyramid level whose full equirectangular
 * width still fits inside `widthPx`. The single inversion of the
 * `SURFACE_EQUIRECT_BASE_WIDTH_PX << z` ladder, pipeline-wide across bodies.
 *
 * A shift loop, not `floor(log2(widthPx / SURFACE_EQUIRECT_BASE_WIDTH_PX))`:
 * an exact power-of-two width can land one ulp short of `Math.log2`'s true
 * value and floor a level too shallow, making every `z` in the planner's
 * walk non-integer and every tile path 404.
 */
export function levelFittingWidth(widthPx: number): number {
  let z = 0;
  while (SURFACE_EQUIRECT_BASE_WIDTH_PX << (z + 1) <= widthPx) z++;
  return z;
}
