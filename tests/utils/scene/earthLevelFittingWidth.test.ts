/**
 * earthLevelFittingWidth — the ladder inversion both the tier base level and the
 * build-time imagery sources depend on.
 *
 * The one thing worth pinning is the boundary, because both of its callers pass
 * an exact power of two and both consequences are silent: one level too shallow
 * bakes a pyramid that stops short of the pixels it was given, one too deep
 * upscales a photograph and calls it detail. `Math.log2` is the formula that
 * gets this wrong at exactly these inputs.
 */

import { expect, it } from 'vitest';

import { EARTH_EQUIRECT_BASE_WIDTH_PX } from '../../../src/data/bodies/earthTileParams';
import { earthLevelFittingWidth } from '../../../src/utils/scene/earthLevelFittingWidth';

it('takes the deepest level that fits, inclusive of an exact match', () => {
  // A width that IS a ladder level is that level, not the one below it.
  expect(earthLevelFittingWidth(EARTH_EQUIRECT_BASE_WIDTH_PX << 7)).toBe(7);
  // One pixel short of it is the level below.
  expect(earthLevelFittingWidth((EARTH_EQUIRECT_BASE_WIDTH_PX << 7) - 1)).toBe(6);
  // The BMNG quadrant composite: 4 x 21600 = 86400 px, between z7 (65536) and
  // z8 (131072), so z7 is the deepest level it can fill without upscaling.
  expect(earthLevelFittingWidth(86400)).toBe(7);
});
