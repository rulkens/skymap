import { EARTH_EQUIRECT_BASE_WIDTH_PX } from '../../data/bodies/earthTileParams';

/**
 * earthLevelFittingWidth — the deepest pyramid level whose full equirectangular
 * width still fits inside `widthPx`. The single inversion of the
 * `EARTH_EQUIRECT_BASE_WIDTH_PX << z` ladder.
 *
 * A shift loop, not `floor(log2(widthPx / 512))`: an exact power-of-two width
 * can land one ulp short of `Math.log2`'s true value and floor a level too
 * shallow, making every `z` in the planner's walk non-integer and every tile
 * path 404.
 */
export function earthLevelFittingWidth(widthPx: number): number {
  let z = 0;
  while (EARTH_EQUIRECT_BASE_WIDTH_PX << (z + 1) <= widthPx) z++;
  return z;
}
