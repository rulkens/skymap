/**
 * galaxyPopulationFractions — the shares both tiers weight their populations
 * by. `splitStarBudget`'s own "counts sum to totalStars" test cannot catch a
 * mistyped share, because the last population absorbs whatever rounding (or a
 * typo) left over; the analytic field has no such absorber and would simply
 * render a galaxy whose light does not add up.
 */
import { describe, expect, it } from 'vitest';
import { galaxyPopulationFractions } from '../../../../../src/services/engine/galaxyGenerator/shared/galaxyPopulationFractions';
import type { GalaxyCategory } from '../../../../../src/@types/galaxy/GalaxyCategory';
import type { GalaxyParams } from '../../../../../src/@types/galaxy/GalaxyParams';

const CATEGORIES: readonly GalaxyCategory[] = [
  'elliptical',
  'lenticular',
  'irregular',
  'barred',
  'spiral',
];

// Off-default bulge/arm knobs, so the spiral-like entry is exercised where its
// terms actually differ rather than at the fallbacks.
const PARAMS: readonly GalaxyParams[] = [
  { type: 'Sb' },
  { type: 'Sb', bulgeSize: 0.45, armStrength: 1.4 },
  { type: 'Sb', bulgeSize: 1.8, armStrength: 0.2 },
];

describe('galaxyPopulationFractions', () => {
  it.each(CATEGORIES)('shares of a %s galaxy sum to the whole', (category) => {
    for (const params of PARAMS) {
      const f = galaxyPopulationFractions(category, params);
      expect(f.bulge + f.bar + f.disk + f.arm + f.halo).toBeCloseTo(1, 12);
    }
  });
});
