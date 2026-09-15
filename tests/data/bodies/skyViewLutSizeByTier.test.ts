import { describe, expect, it } from 'vitest';
import { SKY_VIEW_LUT_SIZE_BY_TIER } from '../../../src/data/bodies/skyViewLutSizeByTier';
import { TIER_LADDER } from '../../../src/data/tierLadder';

describe('SKY_VIEW_LUT_SIZE_BY_TIER', () => {
  it('has a texel size for every tier in TIER_LADDER', () => {
    for (const tier of TIER_LADDER) {
      expect(SKY_VIEW_LUT_SIZE_BY_TIER[tier]).toBeDefined();
      const [width, height] = SKY_VIEW_LUT_SIZE_BY_TIER[tier];
      expect(width).toBeGreaterThan(0);
      expect(height).toBeGreaterThan(0);
    }
  });

  it('shrinks the texel count on the mobile-targeted small tier', () => {
    // The whole point of the tier split: small trades angular resolution
    // (bilinear-hidden) for the fetch-count cut that keeps the mobile
    // sky-view bake off the fetch-issue-stall cliff (measured 33ms at the
    // desktop 192x108 size).
    const [smallWidth, smallHeight] = SKY_VIEW_LUT_SIZE_BY_TIER.small;
    const [mediumWidth, mediumHeight] = SKY_VIEW_LUT_SIZE_BY_TIER.medium;
    expect(smallWidth * smallHeight).toBeLessThan(mediumWidth * mediumHeight);
  });
});
