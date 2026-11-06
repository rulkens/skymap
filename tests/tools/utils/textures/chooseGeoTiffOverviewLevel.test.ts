/**
 * Pinning the pyramid-level pick itself: geoTiffImagerySource threads the
 * result straight into `readGeoTiffRgbWindow`'s `page` argument, so a wrong
 * index here silently decodes the wrong resolution, not an error.
 */

import { describe, expect, it } from 'vitest';

import { chooseGeoTiffOverviewLevel } from '../../../../tools/utils/textures/chooseGeoTiffOverviewLevel';

const LEVELS = [
  { width: 4096, height: 2048 },
  { width: 2048, height: 1024 },
  { width: 1024, height: 512 },
  { width: 512, height: 256 },
];

describe('chooseGeoTiffOverviewLevel', () => {
  it('requires both width and height to clear the bar, not just one', () => {
    // Level 1 (2048x1024) clears width but not this inflated height demand.
    expect(chooseGeoTiffOverviewLevel(LEVELS, 900, 1100)).toBe(0);
  });
});
