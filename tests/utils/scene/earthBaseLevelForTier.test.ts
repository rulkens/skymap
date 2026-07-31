/**
 * earthBaseLevelForTier — the pyramid level a session's whole-globe surface
 * texture already delivers.
 *
 * Two properties, both invisible when broken. The level has to move with the
 * tier: the three tiers bind 2048, 4096 and 8192 px images, and a function that
 * answers the same level for all three tells the planner a coarser session has
 * detail it never bound — soft ground at the engage gate and a 4x jump at the
 * tile handoff, with no error anywhere. And it has to be an exact ladder
 * inversion: one level out is a level of resolution silently gained or lost, and
 * a level that is not an integer poisons every tile path and every window span
 * downstream (which is what `Math.log2` risks at exact powers of two).
 */

import { describe, expect, it } from 'vitest';

import { earthBaseLevelForTier } from '../../../src/utils/scene/earthBaseLevelForTier';
import { tierToTexturePx } from '../../../src/utils/math/tierToTexturePx';
import { EARTH_EQUIRECT_BASE_WIDTH_PX } from '../../../src/data/bodies/earthTileParams';
import type { Tier } from '../../../src/@types/data/Tier';

const TIERS: readonly Tier[] = ['small', 'medium', 'large'];

describe('earthBaseLevelForTier', () => {
  it('drops exactly one level per tier step down', () => {
    const large = earthBaseLevelForTier('large');
    expect(earthBaseLevelForTier('medium')).toBe(large - 1);
    expect(earthBaseLevelForTier('small')).toBe(large - 2);
  });

  it('inverts the ladder exactly, at an integer level, for every tier', () => {
    for (const tier of TIERS) {
      const z = earthBaseLevelForTier(tier);
      // Asserted separately because `<<` truncates its operand: a `Math.log2`
      // result of 4.999 would satisfy the width check below and still hand the
      // walk a level that makes every tile path a decimal.
      expect(Number.isInteger(z), `${tier} level is an integer`).toBe(true);
      // The defining property: the level whose full equirect width IS that
      // tier's texture width. Off by one either way and the tiles refine the
      // wrong image.
      expect(EARTH_EQUIRECT_BASE_WIDTH_PX << z, tier).toBe(tierToTexturePx(tier));
    }
  });
});
