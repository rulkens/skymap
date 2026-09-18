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
  it('picks the coarsest overview that still meets the required resolution', () => {
    expect(chooseGeoTiffOverviewLevel(LEVELS, 900, 400)).toBe(2);
  });

  it('falls back to native (level 0) when every overview is too coarse', () => {
    expect(chooseGeoTiffOverviewLevel(LEVELS, 4096, 2048)).toBe(0);
    expect(chooseGeoTiffOverviewLevel(LEVELS, 3000, 100)).toBe(0);
  });

  it('picks the very coarsest overview when the requirement is looser than all of them', () => {
    expect(chooseGeoTiffOverviewLevel(LEVELS, 10, 10)).toBe(3);
  });

  it('requires both width and height to clear the bar, not just one', () => {
    // Level 1 (2048x1024) clears width but not this inflated height demand.
    expect(chooseGeoTiffOverviewLevel(LEVELS, 900, 1100)).toBe(0);
  });

  it('returns 0 for a single-level (no-overview) file', () => {
    expect(chooseGeoTiffOverviewLevel([{ width: 4096, height: 2048 }], 1, 1)).toBe(0);
  });
});
